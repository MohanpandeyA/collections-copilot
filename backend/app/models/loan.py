from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, Numeric,
    String, UniqueConstraint, func, text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.types import EncryptedString


class ImportBatch(Base):
    __tablename__ = "import_batch"

    id: Mapped[int] = mapped_column(primary_key=True)
    uploaded_by: Mapped[int] = mapped_column(ForeignKey("app_user.id"))
    rows_ok: Mapped[int] = mapped_column(Integer, default=0)
    rows_rejected: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Loan(Base):
    __tablename__ = "loan"
    __table_args__ = (
        CheckConstraint("dpd >= 0", name="ck_loan_dpd"),
        CheckConstraint("outstanding >= 0", name="ck_loan_outstanding"),
        CheckConstraint("status in ('open','closed')", name="ck_loan_status"),
        Index("ix_loan_branch_dpd", "branch_id", "dpd"),
    )

    loan_id: Mapped[str] = mapped_column(String(20), primary_key=True)
    borrower_name: Mapped[str] = mapped_column(EncryptedString)
    phone: Mapped[str] = mapped_column(EncryptedString)
    pincode: Mapped[str] = mapped_column(String(6), index=True)
    branch_id: Mapped[int] = mapped_column(ForeignKey("branch.id"))
    outstanding: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    dpd: Mapped[int] = mapped_column(Integer)
    last_payment_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(10), default="open")
    batch_id: Mapped[int | None] = mapped_column(ForeignKey("import_batch.id"))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Assignment(Base):
    """Loan-to-officer link. Kept as rows so reassignment history survives."""

    __tablename__ = "assignment"
    __table_args__ = (
        Index("ix_assignment_officer_active", "officer_id", "active"),
        # One active officer per loan (assumption A2), enforced by the database.
        Index(
            "uq_assignment_one_active", "loan_id",
            unique=True, postgresql_where=text("active"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    loan_id: Mapped[str] = mapped_column(ForeignKey("loan.loan_id"))
    officer_id: Mapped[int] = mapped_column(ForeignKey("app_user.id"))
    active: Mapped[bool] = mapped_column(default=True)
    manual_rank: Mapped[int | None] = mapped_column(Integer)  # manager reorder
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class LoanSnapshot(Base):
    """Month-start DPD per loan, the cohort base for roll-rate reports."""

    __tablename__ = "loan_snapshot"
    __table_args__ = (UniqueConstraint("loan_id", "snapshot_date", name="uq_snapshot_loan_date"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    loan_id: Mapped[str] = mapped_column(ForeignKey("loan.loan_id"))
    branch_id: Mapped[int] = mapped_column(ForeignKey("branch.id"))
    snapshot_date: Mapped[date] = mapped_column(Date)
    dpd: Mapped[int] = mapped_column(Integer)


class ScoreSnapshot(Base):
    __tablename__ = "score_snapshot"
    __table_args__ = (Index("ix_score_loan_date", "loan_id", "scored_on"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    loan_id: Mapped[str] = mapped_column(ForeignKey("loan.loan_id"))
    score: Mapped[float]
    reasons: Mapped[list] = mapped_column(JSONB)  # top 3, each {code, text}
    scored_on: Mapped[date] = mapped_column(Date)
