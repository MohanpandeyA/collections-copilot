"""Branch-scoped read models and actions for the manager. Every query filters by the
manager's branch, so one branch can never see or touch another's data."""
from datetime import date, datetime, time, timedelta

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.domain.contact_window import IST
from app.domain.roll_rate import roll_rate
from app.domain.scoring import band
from app.models import Assignment, Loan, LoanSnapshot, Outcome, Promise, ScoreSnapshot, User
from app.schemas.manager import (
    ActivityPage, ActivityRow, AgeBucket, BandCounts, DashboardOut, InsightsOut, ManagerLoanRow,
    OfficerStat, PromiseCounts, PromiseRow, ResultMix, RollRateOut, VisitDay,
)
from app.services.officer_service import _latest_scores
from app.services.promise_service import sweep_due


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
    """Manual button: the same sweep the background job runs, limited to the manager's branch."""
    return sweep_due(db, today, branch_id=manager.branch_id)


def _ist_midnight(day: date) -> datetime:
    return datetime.combine(day, time.min, tzinfo=IST)


def activity(db: Session, manager: User, limit: int = 50, offset: int = 0,
             date_from: date | None = None, date_to: date | None = None) -> ActivityPage:
    """One page of the branch's visit log, newest first. The dates are IST days, both ends included."""
    where = [Loan.branch_id == manager.branch_id]
    if date_from:
        where.append(Outcome.occurred_at >= _ist_midnight(date_from))
    if date_to:
        where.append(Outcome.occurred_at < _ist_midnight(date_to + timedelta(days=1)))
    total = db.scalar(select(func.count()).select_from(Outcome)
                      .join(Loan, Loan.loan_id == Outcome.loan_id).where(*where)) or 0
    q = (select(Outcome, Loan, User)
         .join(Loan, Loan.loan_id == Outcome.loan_id)
         .join(User, User.id == Outcome.officer_id)
         .where(*where)
         # client_id last: rows with equal times must keep one order, or a row can repeat or vanish between pages
         .order_by(Outcome.occurred_at.desc(), Outcome.received_at.desc(), Outcome.client_id)
         .limit(limit).offset(offset))
    items = [ActivityRow(client_id=str(o.client_id), loan_id=l.loan_id, borrower_name=l.borrower_name,
                         officer_name=u.full_name, result=o.result, occurred_at=o.occurred_at, note=o.note,
                         amount_received=o.amount_received)
             for o, l, u in db.execute(q).all()]
    return ActivityPage(items=items, total=total, limit=limit, offset=offset)


AGE_BUCKETS = (("b1", 1, 30), ("b2", 31, 60), ("b3", 61, 90), ("b4", 91, None))


def insights(db: Session, manager: User, today: date, days: int = 7) -> InsightsOut:
    branch = manager.branch_id
    # The same loans the Loans page lists: open and assigned.
    open_assigned = [Loan.branch_id == branch, Loan.status == "open", Assignment.active]

    latest = (select(ScoreSnapshot.loan_id, func.max(ScoreSnapshot.scored_on).label("d"))
              .group_by(ScoreSnapshot.loan_id).subquery())
    scores = db.scalars(
        select(func.coalesce(ScoreSnapshot.score, 0))
        .select_from(Loan).join(Assignment, Assignment.loan_id == Loan.loan_id)
        .outerjoin(latest, latest.c.loan_id == Loan.loan_id)
        .outerjoin(ScoreSnapshot, (ScoreSnapshot.loan_id == latest.c.loan_id) & (ScoreSnapshot.scored_on == latest.c.d))
        .where(*open_assigned)).all()
    bands = BandCounts(high=0, medium=0, low=0)
    for sc in scores:
        setattr(bands, band(float(sc)), getattr(bands, band(float(sc))) + 1)

    bucket = case(*[(Loan.dpd.between(lo, hi) if hi else Loan.dpd >= lo, key) for key, lo, hi in AGE_BUCKETS],
                  else_=None)
    sums = dict(db.execute(
        select(bucket, func.sum(Loan.outstanding)).select_from(Loan)
        .join(Assignment, Assignment.loan_id == Loan.loan_id)
        .where(*open_assigned, Loan.dpd >= 1).group_by(bucket)).all())
    age = [AgeBucket(key=k, amount=sums.get(k, 0)) for k, _, _ in AGE_BUCKETS]

    states = dict(db.execute(
        select(Promise.state, func.count()).join(Loan, Loan.loan_id == Promise.loan_id)
        .where(Loan.branch_id == branch).group_by(Promise.state)).all())

    first = today - timedelta(days=days - 1)
    visit_day = func.date(func.timezone("Asia/Kolkata", Outcome.occurred_at))
    window = [Loan.branch_id == branch, Outcome.occurred_at >= _ist_midnight(first),
              Outcome.occurred_at < _ist_midnight(today + timedelta(days=1))]
    per_day = {d: n for d, n in db.execute(
        select(visit_day, func.count()).join(Loan, Loan.loan_id == Outcome.loan_id)
        .where(*window).group_by(visit_day)).all()}
    visits = [VisitDay(day=first + timedelta(days=i), count=per_day.get(first + timedelta(days=i), 0))
              for i in range(days)]
    mix = dict(db.execute(
        select(Outcome.result, func.count()).join(Loan, Loan.loan_id == Outcome.loan_id)
        .where(*window).group_by(Outcome.result)).all())

    return InsightsOut(
        bands=bands, overdue_by_age=age,
        promises=PromiseCounts(open=states.get("open", 0), kept=states.get("kept", 0), broken=states.get("broken", 0)),
        visits_by_day=visits,
        result_mix=ResultMix(paid=mix.get("paid", 0), promise=mix.get("promise", 0),
                             unreachable=mix.get("unreachable", 0), dispute=mix.get("dispute", 0)),
        next_promises=_next_promises(db, manager))


def _next_promises(db: Session, manager: User, n: int = 4) -> list[PromiseRow]:
    q = (select(Promise, Loan, User)
         .join(Loan, Loan.loan_id == Promise.loan_id)
         .join(Assignment, (Assignment.loan_id == Loan.loan_id) & Assignment.active)
         .join(User, User.id == Assignment.officer_id)
         .where(Loan.branch_id == manager.branch_id, Promise.state == "open")
         .order_by(Promise.promise_date, Promise.id).limit(n))
    return [PromiseRow(loan_id=l.loan_id, borrower_name=l.borrower_name, officer_name=u.full_name,
                       promise_date=p.promise_date, amount=p.amount, state=p.state)
            for p, l, u in db.execute(q).all()]


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
