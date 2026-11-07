import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.core.database import SessionLocal
from app.core.deps import get_now
from app.main import app
from app.models import ContactAttempt, ReminderDraft
from app.services.llm import get_llm
from app.tests.conftest import login

IST = timezone(timedelta(hours=5, minutes=30))
DAY = lambda h: datetime(2026, 11, 7, h, 0, tzinfo=IST)  # noqa: E731
GOOD_AI = "Dear Company B (packaging unit), a gentle reminder: Rs 100,000 was promised by 5 Nov 2026. Thank you."


@pytest.fixture()
def clock():
    def set_hour(h):
        app.dependency_overrides[get_now] = lambda: DAY(h)
    set_hour(11)
    yield set_hour
    app.dependency_overrides.pop(get_now, None)


@pytest.fixture()
def llm():
    def use(fn):
        app.dependency_overrides[get_llm] = lambda: fn
    yield use
    app.dependency_overrides.pop(get_llm, None)


def draft(client, headers, loan="LN-10293", language="en", use_ai=False):
    return client.post("/reminders/draft", headers=headers,
                       json={"loan_id": loan, "language": language, "use_ai": use_ai})


def test_requires_officer(client, manager):
    assert draft(client, manager).status_code == 403


def test_other_officers_loan_is_404(client, officer, clock):
    assert draft(client, officer, loan="LN-11930").status_code == 404


def test_template_draft_for_open_promise_uses_promise_facts(client, officer, clock):
    d = draft(client, officer).json()
    assert d["source"] == "template" and d["state"] == "draft"
    assert "Company B (packaging unit)" in d["text"] and "100,000" in d["text"] and "5 Nov 2026" in d["text"]


def test_hindi_template_draft(client, officer, clock):
    d = draft(client, officer, language="hi").json()
    assert "₹100,000" in d["text"] and "प्रिय" in d["text"]


def test_payment_reminder_when_no_promise_uses_outstanding_and_due_date(client, clock):
    h = login(client, "neha")
    d = draft(client, h, loan="LN-10871").json()
    assert "310,000" in d["text"] and "11 Oct 2026" in d["text"]  # 7 Nov minus 27 days


def test_ai_draft_is_used_when_it_passes_checks(client, officer, clock, llm):
    llm(lambda prompt: GOOD_AI)
    d = draft(client, officer, use_ai=True).json()
    assert d["source"] == "llm" and d["text"] == GOOD_AI and d["note"] is None


def test_ai_prompt_carries_the_facts_but_not_the_phone_number(client, officer, clock, llm):
    seen = {}
    llm(lambda prompt: seen.setdefault("p", prompt) and GOOD_AI)
    draft(client, officer, use_ai=True)
    assert "100,000" in seen["p"] and "9000000001" not in seen["p"]


def test_ai_failure_falls_back_to_template(client, officer, clock, llm):
    def boom(prompt):
        raise TimeoutError("slow")
    llm(boom)
    d = draft(client, officer, use_ai=True).json()
    assert d["source"] == "template" and "unavailable" in d["note"]


def test_ai_threat_falls_back_to_template(client, officer, clock, llm):
    llm(lambda p: "Company B (packaging unit), pay Rs 100,000 by 5 Nov 2026 or police will come.")
    d = draft(client, officer, use_ai=True).json()
    assert d["source"] == "template" and "police" in d["note"] and "police" not in d["text"]


def test_ai_wrong_amount_falls_back_to_template(client, officer, clock, llm):
    llm(lambda p: "Dear Company B (packaging unit), pay Rs 900,000 by 5 Nov 2026.")
    d = draft(client, officer, use_ai=True).json()
    assert d["source"] == "template" and "100,000" in d["text"]


def test_ai_requested_but_not_configured_uses_template(client, officer, clock, llm):
    app.dependency_overrides[get_llm] = lambda: None
    d = draft(client, officer, use_ai=True).json()
    assert d["source"] == "template" and "not configured" in d["note"]


def test_every_stored_draft_text_passes_the_word_filter(client, officer, clock, llm):
    from app.domain.word_filter import check_draft
    llm(lambda p: "Company B (packaging unit), Rs 100,000 by 5 Nov 2026, we will seize your goods.")
    d = draft(client, officer, use_ai=True).json()
    assert check_draft(d["text"])[0]


# --- sending -------------------------------------------------------------------------

def send(client, headers, draft_id, channel="sms"):
    return client.post(f"/reminders/{draft_id}/send", headers=headers, json={"channel": channel})


def test_send_inside_window_marks_sent_and_audits(client, officer, clock):
    did = draft(client, officer).json()["id"]
    res = send(client, officer, did)
    assert res.status_code == 200 and res.json()["state"] == "sent" and res.json()["message_id"].startswith("mock-")
    with SessionLocal() as db:
        assert db.get(ReminderDraft, did).state == "sent"
        a = db.scalars(select(ContactAttempt).where(ContactAttempt.loan_id == "LN-10293",
                                                    ContactAttempt.channel == "sms")).all()[-1]
        assert a.allowed is True


def test_send_outside_window_is_blocked_and_audited(client, officer, clock):
    did = draft(client, officer).json()["id"]
    clock(21)
    res = send(client, officer, did)
    assert res.status_code == 409 and "08:00" in res.json()["detail"]
    with SessionLocal() as db:
        assert db.get(ReminderDraft, did).state == "blocked"
        a = db.scalars(select(ContactAttempt).where(ContactAttempt.loan_id == "LN-10293",
                                                    ContactAttempt.channel == "sms")).all()[-1]
        assert a.allowed is False


def test_send_twice_is_refused(client, officer, clock):
    did = draft(client, officer).json()["id"]
    send(client, officer, did)
    assert send(client, officer, did).status_code == 409


def test_cannot_send_another_officers_draft(client, officer, clock):
    did = draft(client, officer).json()["id"]
    assert send(client, login(client, "neha"), did).status_code == 404


def test_unknown_draft_and_bad_channel(client, officer, clock):
    assert send(client, officer, 999999).status_code == 404
    did = draft(client, officer).json()["id"]
    assert send(client, officer, did, channel="telegram").status_code == 422
