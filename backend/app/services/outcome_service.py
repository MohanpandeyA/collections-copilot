"""Record outcomes from the officer's phone. Each item stands alone: its own
validation, its own savepoint, its own result, so one bad item never blocks the rest."""
import uuid
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.domain.contact_window import IST, check_contact_window
from app.domain.promise import next_state
from app.models import Assignment, ContactAttempt, Loan, Outcome, Promise, User
from app.schemas.outcomes import ItemResult, OutcomeIn
from app.services.scoring_service import score_loans

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

    parsed = {"client_id": client_id, "occurred_at": occurred_at, "promise": None, "amount": None}
    if item.amount_received not in (None, ""):
        if item.result != "paid":
            raise Rejected("amount_received is only for a paid outcome")
        try:
            amount = Decimal(item.amount_received)
        except InvalidOperation:
            raise Rejected("amount_received is not a number") from None
        if not amount.is_finite() or amount <= 0:
            raise Rejected("amount_received must be more than zero")
        if amount.as_tuple().exponent < -2:
            raise Rejected("amount_received can have at most 2 decimal places")
        parsed["amount"] = amount
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


def _paid_since(db: Session, promise: Promise, loan_id: str) -> Decimal:
    """Rupees received on this loan since the promise was made, so two part payments can add up."""
    since = db.scalar(select(Outcome.occurred_at).where(Outcome.client_id == promise.outcome_id)) \
        if promise.outcome_id else None
    q = select(func.coalesce(func.sum(Outcome.amount_received), 0)).where(
        Outcome.loan_id == loan_id, Outcome.result == "paid")
    if since is not None:
        q = q.where(Outcome.occurred_at >= since)
    return Decimal(db.scalar(q))


def _settle_open_promise(db: Session, loan_id: str, paid_at: datetime, amount: Decimal | None) -> None:
    promise = db.scalar(select(Promise).where(Promise.loan_id == loan_id, Promise.state == "open")
                        .order_by(Promise.id.desc()))
    if promise is None:
        return
    if amount is not None and _paid_since(db, promise, loan_id) < promise.amount:
        return  # not enough yet: the promise stays open until the date passes
    on_time = paid_at.astimezone(IST).date() <= promise.promise_date
    promise.state = next_state(promise.state, "kept" if on_time else "broken")


def _apply_payment(loan: Loan, amount: Decimal, paid_at: datetime) -> None:
    """Take the money off the balance. A cleared loan is closed and no longer past due."""
    loan.outstanding -= amount
    paid_on = paid_at.astimezone(IST).date()
    if loan.last_payment_date is None or paid_on > loan.last_payment_date:
        loan.last_payment_date = paid_on
    if loan.outstanding == 0:
        loan.status, loan.dpd = "closed", 0


def _save(db: Session, officer: User, item: OutcomeIn) -> str:
    parsed = _parse(item)
    existing = db.get(Outcome, parsed["client_id"])
    if existing is not None:
        if existing.officer_id != officer.id:
            raise Rejected("client_id already used")
        return "duplicate"
    if not _owns(db, officer, item.loan_id):
        raise Rejected("Loan not found")
    loan = db.get(Loan, item.loan_id)
    if parsed["amount"] is not None and parsed["amount"] > loan.outstanding:
        raise Rejected("amount_received is more than the outstanding balance")

    db.add(Outcome(
        client_id=parsed["client_id"], loan_id=item.loan_id, officer_id=officer.id,
        result=item.result, lat=item.lat, lng=item.lng,
        occurred_at=parsed["occurred_at"], note=item.note, amount_received=parsed["amount"]))
    db.flush()  # the promise row references the outcome
    if parsed["promise"]:
        p_date, p_amount = parsed["promise"]
        db.add(Promise(loan_id=item.loan_id, outcome_id=parsed["client_id"],
                       promise_date=p_date, amount=p_amount, state="open"))
    elif item.result == "paid":
        _settle_open_promise(db, item.loan_id, parsed["occurred_at"], parsed["amount"])
        if parsed["amount"] is not None:
            _apply_payment(loan, parsed["amount"], parsed["occurred_at"])

    # The visit already happened, so we keep the record, but audit it against the
    # time it occurred. A visit outside the window is evidence, not something to hide.
    allowed, reason = check_contact_window(parsed["occurred_at"])
    db.add(ContactAttempt(loan_id=item.loan_id, officer_id=officer.id, channel="visit",
                          attempted_at=parsed["occurred_at"], allowed=allowed, block_reason=reason))
    return "created"


def record_batch(db: Session, officer: User, items: list[OutcomeIn], now: datetime) -> list[ItemResult]:
    results = []
    touched: set[str] = set()
    for item in items:
        try:
            with db.begin_nested():  # savepoint: a failure undoes only this item
                status = _save(db, officer, item)
            results.append(ItemResult(client_id=item.client_id, status=status))
            if status == "created":
                touched.add(item.loan_id)
        except Rejected as err:
            results.append(ItemResult(client_id=item.client_id, status="rejected", reason=str(err)))
    # A payment or a settled promise changes the score, so the list must not show yesterday's number.
    if touched:
        still_open = list(db.scalars(select(Loan.loan_id).where(Loan.loan_id.in_(touched), Loan.status == "open")))
        score_loans(db, still_open, now.astimezone(IST).date())
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
