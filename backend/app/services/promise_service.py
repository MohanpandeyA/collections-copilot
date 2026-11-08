"""Promise housekeeping that does not depend on a manager pressing a button."""
import logging
from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.domain.contact_window import IST
from app.domain.promise import next_state
from app.models import Loan, Promise
from app.services.scoring_service import score_loans

log = logging.getLogger("promise_sweep")


def sweep_due(db: Session, today: date, branch_id: int | None = None) -> int:
    """Open promises whose date has passed with no full payment become broken. A broken promise
    changes the loan's score, so the affected open loans are re-scored. Pass branch_id to limit it."""
    q = select(Promise).join(Loan, Loan.loan_id == Promise.loan_id).where(
        Promise.state == "open", Promise.promise_date < today)
    if branch_id is not None:
        q = q.where(Loan.branch_id == branch_id)
    due = db.scalars(q).all()
    for p in due:
        p.state = next_state(p.state, "broken")
    db.flush()
    loan_ids = sorted({p.loan_id for p in due})
    still_open = list(db.scalars(select(Loan.loan_id).where(Loan.loan_id.in_(loan_ids), Loan.status == "open"))) \
        if loan_ids else []
    score_loans(db, still_open, today)
    db.commit()
    return len(due)


def sweep_job(now: datetime | None = None) -> int:
    """One scheduled run across every branch. Never raises: a failed run must not stop the loop."""
    today = (now or datetime.now(IST)).astimezone(IST).date()
    try:
        with SessionLocal() as db:
            n = sweep_due(db, today)
        if n:
            log.info("promise sweep marked %d broken", n)
        return n
    except Exception:  # noqa: BLE001 - logged, and the next run tries again
        log.exception("promise sweep failed")
        return 0
