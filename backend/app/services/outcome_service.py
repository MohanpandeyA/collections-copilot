"""Record outcomes from the officer's phone. Each item stands alone: its own
validation, its own savepoint, its own result, so one bad item never blocks the rest."""
import uuid
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.contact_window import IST, check_contact_window
from app.domain.promise import next_state
from app.models import Assignment, ContactAttempt, Outcome, Promise, User
from app.schemas.outcomes import ItemResult, OutcomeIn

RESULTS = {"paid", "promise", "unreachable", "dispute"}


class Rejected(Exception):
    pass


def _parse(item: OutcomeIn) -> dict:
    try:
        client_id = uuid.UUID(item.client_id)
    except ValueError:
        raise Rejected("client_id is not a valid UUID") from None
    if item.result not in RESULTS:
        raise Rejected("result must be one of " + ", ".join(sorted(RESULTS)))
    try:
        occurred_at = datetime.fromisoformat(item.occurred_at)
    except ValueError:
        raise Rejected("occurred_at is not a valid date and time") from None
    if occurred_at.tzinfo is None:
        raise Rejected("occurred_at must include a timezone")
    if (item.lat is None) != (item.lng is None):
        raise Rejected("lat and lng must be sent together")
    if item.lat is not None and not (-90 <= item.lat <= 90 and -180 <= item.lng <= 180):
        raise Rejected("lat or lng is out of range")

    parsed = {"client_id": client_id, "occurred_at": occurred_at, "promise": None}
    if item.result == "promise":
        try:
            p_date = date.fromisoformat(item.promise_date or "")
        except ValueError:
            raise Rejected("promise_date is required (YYYY-MM-DD) for a promise") from None
        try:
            p_amount = Decimal(item.promise_amount or "")
        except InvalidOperation:
            raise Rejected("promise_amount is required for a promise") from None
        if not p_amount.is_finite() or p_amount <= 0:
            raise Rejected("promise_amount must be more than zero")
        if p_date < occurred_at.astimezone(IST).date():
            raise Rejected("promise_date cannot be before the visit date")
        parsed["promise"] = (p_date, p_amount)
    return parsed


def _owns(db: Session, officer: User, loan_id: str) -> bool:
    return db.scalar(select(Assignment.id).where(
        Assignment.loan_id == loan_id, Assignment.officer_id == officer.id, Assignment.active)) is not None


def _settle_open_promise(db: Session, loan_id: str, paid_at: datetime) -> None:
    promise = db.scalar(select(Promise).where(Promise.loan_id == loan_id, Promise.state == "open")
                        .order_by(Promise.id.desc()))
    if promise is None:
        return
    on_time = paid_at.astimezone(IST).date() <= promise.promise_date
    promise.state = next_state(promise.state, "kept" if on_time else "broken")


def _save(db: Session, officer: User, item: OutcomeIn) -> str:
    parsed = _parse(item)
    existing = db.get(Outcome, parsed["client_id"])
    if existing is not None:
        if existing.officer_id != officer.id:
            raise Rejected("client_id already used")
        return "duplicate"
    if not _owns(db, officer, item.loan_id):
        raise Rejected("Loan not found")

    db.add(Outcome(
        client_id=parsed["client_id"], loan_id=item.loan_id, officer_id=officer.id,
        result=item.result, lat=item.lat, lng=item.lng,
        occurred_at=parsed["occurred_at"], note=item.note))
    db.flush()  # the promise row references the outcome
    if parsed["promise"]:
        p_date, p_amount = parsed["promise"]
        db.add(Promise(loan_id=item.loan_id, outcome_id=parsed["client_id"],
                       promise_date=p_date, amount=p_amount, state="open"))
    elif item.result == "paid":
        _settle_open_promise(db, item.loan_id, parsed["occurred_at"])

    # The visit already happened, so we keep the record, but audit it against the
    # time it occurred. A visit outside the window is evidence, not something to hide.
    allowed, reason = check_contact_window(parsed["occurred_at"])
    db.add(ContactAttempt(loan_id=item.loan_id, officer_id=officer.id, channel="visit",
                          attempted_at=parsed["occurred_at"], allowed=allowed, block_reason=reason))
    return "created"


def record_batch(db: Session, officer: User, items: list[OutcomeIn]) -> list[ItemResult]:
    results = []
    for item in items:
        try:
            with db.begin_nested():  # savepoint: a failure undoes only this item
                status = _save(db, officer, item)
            results.append(ItemResult(client_id=item.client_id, status=status))
        except Rejected as err:
            results.append(ItemResult(client_id=item.client_id, status="rejected", reason=str(err)))
    db.commit()
    return results


def record_contact_attempt(db: Session, officer: User, loan_id: str, channel: str,
                           now: datetime) -> tuple[bool, str | None] | None:
    if not _owns(db, officer, loan_id):
        return None
    allowed, reason = check_contact_window(now)
    db.add(ContactAttempt(loan_id=loan_id, officer_id=officer.id, channel=channel,
                          attempted_at=now, allowed=allowed, block_reason=reason))
    db.commit()
    return allowed, reason
