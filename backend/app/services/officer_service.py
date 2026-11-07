"""Read side for the field officer: only loans actively assigned to them."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.scoring import band
from app.models import Assignment, Loan, Promise, ScoreSnapshot, User
from app.schemas.officer import LoanDetailOut, LoanRowOut, PromiseOut, ReasonOut


def _latest_scores(db: Session, loan_ids: list[str]) -> dict[str, ScoreSnapshot]:
    rows = db.scalars(
        select(ScoreSnapshot).where(ScoreSnapshot.loan_id.in_(loan_ids))
        .order_by(ScoreSnapshot.scored_on, ScoreSnapshot.id)
    )
    return {s.loan_id: s for s in rows}  # later rows overwrite earlier ones


def my_loans(db: Session, officer: User) -> list[LoanRowOut]:
    pairs = db.execute(
        select(Loan, Assignment.manual_rank)
        .join(Assignment, Assignment.loan_id == Loan.loan_id)
        .where(Assignment.officer_id == officer.id, Assignment.active, Loan.status == "open")
    ).all()
    scores = _latest_scores(db, [l.loan_id for l, _ in pairs])
    rows = []
    for loan, rank in pairs:
        snap = scores.get(loan.loan_id)
        score = snap.score if snap else 0.0
        rows.append((rank, score, LoanRowOut(
            loan_id=loan.loan_id, borrower_name=loan.borrower_name,
            outstanding=loan.outstanding, dpd=loan.dpd,
            band=band(score), score=score)))
    # manager's manual order first (lowest rank number), then highest score
    rows.sort(key=lambda r: (r[0] is None, r[0] if r[0] is not None else 0, -r[1]))
    return [r[2] for r in rows]


def my_loan_detail(db: Session, officer: User, loan_id: str) -> LoanDetailOut | None:
    loan = db.scalar(
        select(Loan).join(Assignment, Assignment.loan_id == Loan.loan_id)
        .where(Loan.loan_id == loan_id, Assignment.officer_id == officer.id, Assignment.active)
    )
    if loan is None:
        return None
    snap = _latest_scores(db, [loan_id]).get(loan_id)
    promise = db.scalar(select(Promise).where(Promise.loan_id == loan_id).order_by(Promise.id.desc()))
    score = snap.score if snap else 0.0
    return LoanDetailOut(
        loan_id=loan.loan_id, borrower_name=loan.borrower_name, phone=loan.phone,
        pincode=loan.pincode, outstanding=loan.outstanding, dpd=loan.dpd,
        last_payment_date=loan.last_payment_date, score=score, band=band(score),
        reasons=[ReasonOut(**r) for r in (snap.reasons if snap else [])],
        promise=PromiseOut(state=promise.state, promise_date=promise.promise_date,
                           amount=promise.amount) if promise else None,
    )
