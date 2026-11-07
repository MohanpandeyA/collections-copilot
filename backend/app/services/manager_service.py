"""Branch-scoped read models and actions for the manager. Every query filters by the
manager's branch, so one branch can never see or touch another's data."""
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.domain.promise import next_state
from app.domain.roll_rate import roll_rate
from app.domain.scoring import band
from app.models import Assignment, Loan, LoanSnapshot, Outcome, Promise, User
from app.schemas.manager import (
    ActivityRow, DashboardOut, ManagerLoanRow, OfficerStat, PromiseRow, RollRateOut,
)
from app.services.officer_service import _latest_scores


def dashboard(db: Session, manager: User) -> DashboardOut:
    branch = manager.branch_id
    open_loans, overdue = db.execute(
        select(func.count(), func.coalesce(func.sum(Loan.outstanding), 0))
        .where(Loan.branch_id == branch, Loan.status == "open")).one()
    promise_counts = dict(db.execute(
        select(Promise.state, func.count()).join(Loan, Loan.loan_id == Promise.loan_id)
        .where(Loan.branch_id == branch).group_by(Promise.state)).all())

    snap_date = db.scalar(select(func.max(LoanSnapshot.snapshot_date))
                          .where(LoanSnapshot.branch_id == branch))
    pairs = db.execute(
        select(LoanSnapshot.loan_id, LoanSnapshot.dpd, Loan.dpd, Assignment.officer_id)
        .join(Loan, Loan.loan_id == LoanSnapshot.loan_id)
        .outerjoin(Assignment, (Assignment.loan_id == Loan.loan_id) & Assignment.active)
        .where(LoanSnapshot.branch_id == branch, LoanSnapshot.snapshot_date == snap_date)
    ).all() if snap_date else []

    officers = db.scalars(select(User).where(User.role == "officer", User.branch_id == branch)
                          .order_by(User.full_name)).all()
    open_by_officer = dict(db.execute(
        select(Assignment.officer_id, func.count()).join(Loan, Loan.loan_id == Assignment.loan_id)
        .where(Assignment.active, Loan.status == "open", Loan.branch_id == branch)
        .group_by(Assignment.officer_id)).all())
    stats = []
    for o in officers:
        rr = roll_rate([(start, now) for _, start, now, oid in pairs if oid == o.id])
        stats.append(OfficerStat(officer_id=o.id, officer_name=o.full_name,
                                 open_loans=open_by_officer.get(o.id, 0),
                                 cohort=rr.cohort, rolled=rr.rolled, rate=rr.rate))
    total = roll_rate([(start, now) for _, start, now, _ in pairs])
    return DashboardOut(
        open_loans=open_loans, overdue_amount=overdue,
        broken_promises=promise_counts.get("broken", 0), open_promises=promise_counts.get("open", 0),
        snapshot_date=snap_date, roll_rate=RollRateOut(cohort=total.cohort, rolled=total.rolled, rate=total.rate),
        by_officer=stats)


def promises(db: Session, manager: User, state: str | None) -> list[PromiseRow]:
    q = (select(Promise, Loan, User)
         .join(Loan, Loan.loan_id == Promise.loan_id)
         .join(Assignment, (Assignment.loan_id == Loan.loan_id) & Assignment.active)
         .join(User, User.id == Assignment.officer_id)
         .where(Loan.branch_id == manager.branch_id)
         .order_by(Promise.promise_date.desc(), Promise.id.desc()))
    if state:
        q = q.where(Promise.state == state)
    return [PromiseRow(loan_id=l.loan_id, borrower_name=l.borrower_name, officer_name=u.full_name,
                       promise_date=p.promise_date, amount=p.amount, state=p.state)
            for p, l, u in db.execute(q).all()]


def sweep_promises(db: Session, manager: User, today: date) -> int:
    """Open promises whose date has passed with no payment become broken."""
    due = db.scalars(select(Promise).join(Loan, Loan.loan_id == Promise.loan_id)
                     .where(Loan.branch_id == manager.branch_id, Promise.state == "open",
                            Promise.promise_date < today)).all()
    for p in due:
        p.state = next_state(p.state, "broken")
    db.commit()
    return len(due)


def activity(db: Session, manager: User, limit: int = 100) -> list[ActivityRow]:
    q = (select(Outcome, Loan, User)
         .join(Loan, Loan.loan_id == Outcome.loan_id)
         .join(User, User.id == Outcome.officer_id)
         .where(Loan.branch_id == manager.branch_id)
         .order_by(Outcome.occurred_at.desc(), Outcome.received_at.desc()).limit(limit))
    return [ActivityRow(client_id=str(o.client_id), loan_id=l.loan_id, borrower_name=l.borrower_name,
                        officer_name=u.full_name, result=o.result, occurred_at=o.occurred_at, note=o.note)
            for o, l, u in db.execute(q).all()]


def branch_loans(db: Session, manager: User) -> list[ManagerLoanRow]:
    rows = db.execute(
        select(Loan, User, Assignment.manual_rank)
        .join(Assignment, (Assignment.loan_id == Loan.loan_id) & Assignment.active)
        .join(User, User.id == Assignment.officer_id)
        .where(Loan.branch_id == manager.branch_id, Loan.status == "open")).all()
    scores = _latest_scores(db, [l.loan_id for l, _, _ in rows])
    out = []
    for loan, officer, rank in rows:
        score = scores[loan.loan_id].score if loan.loan_id in scores else 0.0
        out.append(ManagerLoanRow(loan_id=loan.loan_id, borrower_name=loan.borrower_name,
                                  officer_name=officer.full_name, dpd=loan.dpd,
                                  outstanding=loan.outstanding, score=score,
                                  band=band(score), rank=rank))
    out.sort(key=lambda r: -r.score)
    return out


def set_rank(db: Session, manager: User, loan_id: str, rank: int | None) -> bool:
    assignment = db.scalar(
        select(Assignment).join(Loan, Loan.loan_id == Assignment.loan_id)
        .where(Assignment.loan_id == loan_id, Assignment.active, Loan.branch_id == manager.branch_id))
    if assignment is None:
        return False
    assignment.manual_rank = rank
    db.commit()
    return True
