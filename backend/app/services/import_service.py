"""Load a validated CSV: upsert loans, assign new ones, score them. One transaction."""
from datetime import date
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.domain.assignment import OfficerLoad, assign_loans
from app.domain.csv_import import ParseResult, RejectedRow
from app.models import Assignment, ImportBatch, Loan, User
from app.schemas.imports import ImportSummary, RejectedOut
from app.services.scoring_service import score_loans


def _officer_loads(db: Session, branch_id: int) -> list[OfficerLoad]:
    officers = db.scalars(
        select(User).where(User.role == "officer", User.branch_id == branch_id)
    ).all()
    rows = db.execute(
        select(Assignment.officer_id, func.count(), func.coalesce(func.sum(Loan.outstanding), 0))
        .join(Loan, Loan.loan_id == Assignment.loan_id)
        .where(Assignment.active, Loan.status == "open", Assignment.officer_id.in_([o.id for o in officers]))
        .group_by(Assignment.officer_id)
    ).all()
    used = {oid: (n, Decimal(total)) for oid, n, total in rows}
    return [OfficerLoad(o.id, list(o.pincodes), *used.get(o.id, (0, Decimal(0)))) for o in officers]


def run_import(db: Session, manager: User, parsed: ParseResult, today: date) -> ImportSummary:
    rejected: list[RejectedRow] = list(parsed.rejected)
    batch = ImportBatch(uploaded_by=manager.id)
    db.add(batch)
    db.flush()

    existing = {l.loan_id: l for l in db.scalars(
        select(Loan).where(Loan.loan_id.in_([r.loan_id for r in parsed.rows])))}
    loaded_ids: list[str] = []
    for row in parsed.rows:
        loan = existing.get(row.loan_id)
        if loan and loan.branch_id != manager.branch_id:
            rejected.append(RejectedRow(parsed.row_numbers[row.loan_id], row.loan_id,
                                        "Loan belongs to another branch"))
            continue
        if loan is None:
            loan = Loan(loan_id=row.loan_id, branch_id=manager.branch_id)
            db.add(loan)
        loan.borrower_name, loan.phone, loan.pincode = row.borrower_name, row.phone, row.pincode
        loan.outstanding, loan.dpd = row.outstanding, row.dpd
        loan.last_payment_date, loan.status, loan.batch_id = row.last_payment_date, "open", batch.id
        loaded_ids.append(row.loan_id)
    db.flush()

    already = set(db.scalars(select(Assignment.loan_id).where(
        Assignment.loan_id.in_(loaded_ids), Assignment.active)))
    to_assign = [(l.loan_id, l.pincode, l.outstanding)
                 for l in db.scalars(select(Loan).where(Loan.loan_id.in_(loaded_ids)))
                 if l.loan_id not in already]
    decisions = assign_loans(to_assign, _officer_loads(db, manager.branch_id))
    for loan_id, d in decisions.items():
        db.add(Assignment(loan_id=loan_id, officer_id=d.officer_id, active=True))

    score_loans(db, loaded_ids, today)

    rejected.sort(key=lambda r: r.row_number)
    batch.rows_ok, batch.rows_rejected = len(loaded_ids), len(rejected)
    db.commit()
    return ImportSummary(
        batch_id=batch.id, loaded=len(loaded_ids), assigned=len(decisions),
        fallback_count=sum(d.fallback for d in decisions.values()),
        rejected_count=len(rejected),
        rejected=[RejectedOut(row_number=r.row_number, loan_id=r.loan_id, reason=r.reason)
                  for r in rejected],
    )

