"""Glue between the database and the pure scoring function."""
from datetime import date

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.domain.scoring import LoanFacts, score_loan
from app.models import Loan, Promise, ScoreSnapshot


def score_loans(db: Session, loan_ids: list[str], today: date) -> None:
    """Score the given loans and store one snapshot per loan per day."""
    if not loan_ids:
        return
    loans = db.scalars(select(Loan).where(Loan.loan_id.in_(loan_ids))).all()
    promises: dict[str, Promise] = {}
    # newest promise last, so it wins in the dict
    for p in db.scalars(select(Promise).where(Promise.loan_id.in_(loan_ids)).order_by(Promise.id)):
        promises[p.loan_id] = p

    db.execute(delete(ScoreSnapshot).where(
        ScoreSnapshot.loan_id.in_(loan_ids), ScoreSnapshot.scored_on == today))
    for loan in loans:
        p = promises.get(loan.loan_id)
        result = score_loan(LoanFacts(
            dpd=loan.dpd, outstanding=loan.outstanding,
            last_payment_date=loan.last_payment_date,
            promise_state=p.state if p else None,
            promise_date=p.promise_date if p else None,
            today=today,
        ))
        db.add(ScoreSnapshot(
            loan_id=loan.loan_id, score=result.score, scored_on=today,
            reasons=[{"code": r.code, "text": r.text, "contribution": r.contribution}
                     for r in result.reasons],
        ))
