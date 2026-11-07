import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import func, select

from app.core.database import SessionLocal
from app.core.deps import get_now
from app.main import app
from app.models import ContactAttempt, Outcome, Promise
from app.tests.conftest import login

HEADER = "loan_id,borrower_name,phone,pincode,outstanding,dpd,last_payment_date\n"
IST = timezone(timedelta(hours=5, minutes=30))
NOON = datetime(2026, 11, 7, 12, 0, tzinfo=IST).isoformat()
NIGHT = datetime(2026, 11, 7, 22, 30, tzinfo=IST).isoformat()


@pytest.fixture()
def loan_id(client, manager):
    """A fresh loan in rahul's pincode, so every test owns its data."""
    lid = f"LN-O{uuid.uuid4().hex[:8]}"
    body = HEADER + f"{lid},Outcome Test,9200000001,452001,80000,15,\n"
    client.post("/manager/imports", headers=manager, files={"file": ("a.csv", body, "text/csv")})
    return lid


def item(loan_id, result="unreachable", when=NOON, **extra):
    return {"client_id": str(uuid.uuid4()), "loan_id": loan_id, "result": result,
            "occurred_at": when, **extra}


def post(client, headers, *items):
    return client.post("/outcomes/batch", headers=headers, json={"items": list(items)})


def test_requires_officer(client, manager):
    assert post(client, manager, item("X")).status_code == 403
    assert client.post("/outcomes/batch", json={"items": []}).status_code == 401


def test_creates_outcome_and_returns_created(client, officer, loan_id):
    it = item(loan_id, lat=22.7, lng=75.8, note="Not home")
    res = post(client, officer, it)
    assert res.status_code == 200
    assert res.json()["results"] == [{"client_id": it["client_id"], "status": "created", "reason": None}]
    with SessionLocal() as db:
        o = db.get(Outcome, uuid.UUID(it["client_id"]))
        assert o.loan_id == loan_id and o.result == "unreachable" and o.received_at is not None


def test_retry_is_idempotent(client, officer, loan_id):
    it = item(loan_id)
    post(client, officer, it)
    res = post(client, officer, it)
    assert res.json()["results"][0]["status"] == "duplicate"
    with SessionLocal() as db:
        n = db.scalar(select(func.count()).select_from(Outcome).where(Outcome.loan_id == loan_id))
        assert n == 1


def test_loan_not_assigned_to_officer_is_rejected(client, officer):
    res = post(client, officer, item("LN-11930"))  # imran's loan
    r = res.json()["results"][0]
    assert r["status"] == "rejected" and r["reason"] == "Loan not found"


def test_one_bad_item_does_not_block_the_rest(client, officer, loan_id):
    good, bad = item(loan_id), item("NOPE")
    res = post(client, officer, bad, good).json()["results"]
    assert [r["status"] for r in res] == ["rejected", "created"]


def test_invalid_result_and_naive_time_are_rejected(client, officer, loan_id):
    res = post(client, officer, item(loan_id, result="happy"),
               item(loan_id, when="2026-11-07T12:00:00")).json()["results"]
    assert [r["status"] for r in res] == ["rejected", "rejected"]
    assert "result" in res[0]["reason"] and "timezone" in res[1]["reason"]


def test_promise_outcome_creates_open_promise(client, officer, loan_id):
    it = item(loan_id, result="promise", promise_date="2026-11-12", promise_amount="30000")
    assert post(client, officer, it).json()["results"][0]["status"] == "created"
    with SessionLocal() as db:
        p = db.scalar(select(Promise).where(Promise.loan_id == loan_id))
        assert p.state == "open" and str(p.promise_date) == "2026-11-12" and float(p.amount) == 30000


def test_promise_without_date_or_amount_is_rejected(client, officer, loan_id):
    r = post(client, officer, item(loan_id, result="promise")).json()["results"][0]
    assert r["status"] == "rejected" and "promise_date" in r["reason"]
    with SessionLocal() as db:  # nothing half-saved
        assert db.scalar(select(func.count()).select_from(Outcome).where(Outcome.loan_id == loan_id)) == 0


def test_payment_on_time_marks_promise_kept(client, officer, loan_id):
    post(client, officer, item(loan_id, result="promise", promise_date="2026-11-12", promise_amount="1000"))
    post(client, officer, item(loan_id, result="paid", when=datetime(2026, 11, 11, 12, tzinfo=IST).isoformat()))
    with SessionLocal() as db:
        assert db.scalar(select(Promise.state).where(Promise.loan_id == loan_id)) == "kept"


def test_late_payment_marks_promise_broken(client, officer, loan_id):
    post(client, officer, item(loan_id, result="promise", promise_date="2026-11-12", promise_amount="1000"))
    post(client, officer, item(loan_id, result="paid", when=datetime(2026, 11, 13, 12, tzinfo=IST).isoformat()))
    with SessionLocal() as db:
        assert db.scalar(select(Promise.state).where(Promise.loan_id == loan_id)) == "broken"


def test_visit_outside_window_is_saved_but_audited_as_blocked(client, officer, loan_id):
    it = item(loan_id, when=NIGHT)
    assert post(client, officer, it).json()["results"][0]["status"] == "created"
    with SessionLocal() as db:
        a = db.scalar(select(ContactAttempt).where(ContactAttempt.loan_id == loan_id))
        assert a.channel == "visit" and a.allowed is False and "08:00" in a.block_reason


def test_visit_inside_window_is_audited_as_allowed(client, officer, loan_id):
    post(client, officer, item(loan_id, when=NOON))
    with SessionLocal() as db:
        assert db.scalar(select(ContactAttempt.allowed).where(ContactAttempt.loan_id == loan_id)) is True


def test_batch_over_limit_is_rejected(client, officer, loan_id):
    assert post(client, officer, *[item(loan_id) for _ in range(51)]).status_code == 422


# --- live contact attempts: server clock decides ---------------------------------

@pytest.fixture()
def fixed_time():
    def set_time(hour):
        app.dependency_overrides[get_now] = lambda: datetime(2026, 11, 7, hour, 0, tzinfo=IST)
    yield set_time
    app.dependency_overrides.pop(get_now, None)


def test_call_inside_window_is_allowed_and_audited(client, officer, loan_id, fixed_time):
    fixed_time(10)
    res = client.post("/contact-attempts", headers=officer, json={"loan_id": loan_id, "channel": "call"})
    assert res.json() == {"allowed": True, "block_reason": None}
    with SessionLocal() as db:
        assert db.scalar(select(ContactAttempt.allowed).where(
            ContactAttempt.loan_id == loan_id, ContactAttempt.channel == "call")) is True


def test_call_at_night_is_blocked_and_audited(client, officer, loan_id, fixed_time):
    fixed_time(20)
    res = client.post("/contact-attempts", headers=officer, json={"loan_id": loan_id, "channel": "call"})
    assert res.json()["allowed"] is False and "08:00" in res.json()["block_reason"]
    with SessionLocal() as db:
        assert db.scalar(select(ContactAttempt.allowed).where(
            ContactAttempt.loan_id == loan_id, ContactAttempt.channel == "call")) is False


def test_contact_attempt_on_other_officers_loan_is_404(client, officer, fixed_time):
    fixed_time(10)
    res = client.post("/contact-attempts", headers=officer, json={"loan_id": "LN-11930", "channel": "call"})
    assert res.status_code == 404
