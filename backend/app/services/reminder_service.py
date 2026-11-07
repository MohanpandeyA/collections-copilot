"""Draft and send reminders. The officer always taps send; nothing goes out on its own."""
from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.contact_window import IST, check_contact_window
from app.domain.reminder_text import render_template, verify_draft
from app.models import (
    Assignment, ContactAttempt, Loan, Promise, ReminderDraft, ReminderTemplate, User,
)
from app.schemas.reminders import DraftOut
from app.services.llm import Llm
from app.services.messaging import Gateway


class NotFound(Exception):
    pass


class NotSendable(Exception):
    pass


def _fmt_date(d: date) -> str:
    return f"{d.day} {d.strftime('%b')} {d.year}"


def _own_loan(db: Session, officer: User, loan_id: str) -> Loan:
    loan = db.scalar(select(Loan).join(Assignment, Assignment.loan_id == Loan.loan_id)
                     .where(Loan.loan_id == loan_id, Assignment.officer_id == officer.id, Assignment.active))
    if loan is None:
        raise NotFound
    return loan


def _facts(db: Session, loan: Loan, today: date) -> tuple[str, dict]:
    """Pick the template code and the numbers: an open promise wins, else the overdue amount."""
    promise = db.scalar(select(Promise).where(Promise.loan_id == loan.loan_id, Promise.state == "open")
                        .order_by(Promise.id.desc()))
    if promise:
        amount, when, code = promise.amount, promise.promise_date, "promise_reminder"
    else:
        amount, when, code = loan.outstanding, date.fromordinal(today.toordinal() - loan.dpd), "payment_reminder"
    return code, {"name": loan.borrower_name, "amount": f"{int(amount):,}", "date": _fmt_date(when)}


def _prompt(language: str, facts: dict) -> str:
    lang = "Hindi (Devanagari script)" if language == "hi" else "English"
    return (
        f"Write a polite, short payment reminder SMS in {lang} for an Indian small-business loan borrower.\n"
        f"Use exactly these details and no others: name {facts['name']}; amount Rs {facts['amount']}; "
        f"date {facts['date']}.\n"
        "Rules: under 300 characters; respectful and calm; no threats, no mention of police, court, "
        "legal action or family; do not add any other numbers, fees or phone numbers; "
        "write the amount as Rs followed by the amount exactly as given. Return only the message text."
    )


def create_draft(db: Session, officer: User, loan_id: str, language: str, use_ai: bool,
                 llm: Llm | None, now: datetime) -> DraftOut:
    loan = _own_loan(db, officer, loan_id)
    code, facts = _facts(db, loan, now.astimezone(IST).date())
    template = db.scalar(select(ReminderTemplate).where(
        ReminderTemplate.code == code, ReminderTemplate.language == language, ReminderTemplate.approved))
    if template is None:
        raise NotFound

    text, source, note = render_template(template.body, **facts), "template", None
    if use_ai:
        if llm is None:
            note = "AI drafting is not configured, so the approved template is shown"
        else:
            try:
                candidate = llm(_prompt(language, facts))
                ok, reason = verify_draft(candidate, **facts)
                if ok:
                    text, source = candidate, "llm"
                else:
                    note = f"AI draft rejected ({reason}), so the approved template is shown"
            except Exception:  # timeout, quota, bad response: the template is always a safe answer
                note = "AI drafting is unavailable right now, so the approved template is shown"

    draft = ReminderDraft(loan_id=loan_id, officer_id=officer.id, template_id=template.id,
                          text=text, source=source, state="draft")
    db.add(draft)
    db.commit()
    return DraftOut(id=draft.id, loan_id=loan_id, language=language, text=text,
                    source=source, state="draft", note=note)


def send_draft(db: Session, officer: User, draft_id: int, channel: str,
               gateway: Gateway, now: datetime) -> tuple[ReminderDraft, str | None, str | None]:
    """Returns (draft, message_id, block_reason). The window is checked here, on the
    server clock, even though the app also checks, because the app can be bypassed."""
    draft = db.get(ReminderDraft, draft_id)
    if draft is None or draft.officer_id != officer.id:
        raise NotFound
    if draft.state != "draft":
        raise NotSendable(f"This reminder was already {draft.state}")
    loan = _own_loan(db, officer, draft.loan_id)

    allowed, reason = check_contact_window(now)
    db.add(ContactAttempt(loan_id=loan.loan_id, officer_id=officer.id, channel=channel,
                          attempted_at=now, allowed=allowed, block_reason=reason))
    if not allowed:
        draft.state = "blocked"
        db.commit()
        return draft, None, reason
    message_id = gateway.send(loan.phone, draft.text, channel)
    draft.state = "sent"
    db.commit()
    return draft, message_id, None
