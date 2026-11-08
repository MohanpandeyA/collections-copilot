import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean, CheckConstraint, Date, DateTime, ForeignKey, Index, Numeric,
    String, Text, func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Outcome(Base):
    """A visit/contact result. The phone-generated client_id is the primary key,
    so a retried upload hits the same row and can never create a duplicate."""

    __tablename__ = "outcome"
    __table_args__ = (
        CheckConstraint(
            "result in ('paid','promise','unreachable','dispute')", name="ck_outcome_result"
        ),
        CheckConstraint("lat between -90 and 90 and lng between -180 and 180", name="ck_outcome_geo"),
        CheckConstraint("amount_received is null or amount_received > 0", name="ck_outcome_amount"),
        Index("ix_outcome_loan_time", "loan_id", "occurred_at"),
    )

    client_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    loan_id: Mapped[str] = mapped_column(ForeignKey("loan.loan_id"))
    officer_id: Mapped[int] = mapped_column(ForeignKey("app_user.id"))
    result: Mapped[str] = mapped_column(String(12))
    lat: Mapped[float | None]
    lng: Mapped[float | None]
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))  # device time
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )  # server time
    note: Mapped[str | None] = mapped_column(Text)
    # Rupees collected, set only on a paid outcome. Null on older rows and unpaid results.
    amount_received: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))


class Promise(Base):
    __tablename__ = "promise"
    __table_args__ = (
        CheckConstraint("state in ('open','kept','broken')", name="ck_promise_state"),
        CheckConstraint("amount > 0", name="ck_promise_amount"),
        Index("ix_promise_state_date", "state", "promise_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    loan_id: Mapped[str] = mapped_column(ForeignKey("loan.loan_id"))
    outcome_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("outcome.client_id"), unique=True
    )
    promise_date: Mapped[date] = mapped_column(Date)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    state: Mapped[str] = mapped_column(String(8), default="open")


class ContactAttempt(Base):
    """Audit row for every contact attempt, allowed or blocked (RBI window)."""

    __tablename__ = "contact_attempt"
    __table_args__ = (
        CheckConstraint("channel in ('call','sms','whatsapp','visit')", name="ck_attempt_channel"),
        Index("ix_attempt_officer_time", "officer_id", "attempted_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    loan_id: Mapped[str] = mapped_column(ForeignKey("loan.loan_id"))
    officer_id: Mapped[int] = mapped_column(ForeignKey("app_user.id"))
    channel: Mapped[str] = mapped_column(String(10))
    attempted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    allowed: Mapped[bool] = mapped_column(Boolean)
    block_reason: Mapped[str | None] = mapped_column(String(120))
