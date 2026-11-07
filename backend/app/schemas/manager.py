from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class RollRateOut(BaseModel):
    cohort: int
    rolled: int
    rate: float | None


class OfficerStat(BaseModel):
    officer_id: int
    officer_name: str
    open_loans: int
    cohort: int
    rolled: int
    rate: float | None


class DashboardOut(BaseModel):
    open_loans: int
    overdue_amount: Decimal
    broken_promises: int
    open_promises: int
    snapshot_date: date | None
    roll_rate: RollRateOut
    by_officer: list[OfficerStat]


class PromiseRow(BaseModel):
    loan_id: str
    borrower_name: str
    officer_name: str
    promise_date: date
    amount: Decimal
    state: str


class SweepOut(BaseModel):
    marked_broken: int


class ActivityRow(BaseModel):
    client_id: str
    loan_id: str
    borrower_name: str
    officer_name: str
    result: str
    occurred_at: datetime
    note: str | None


class ManagerLoanRow(BaseModel):
    loan_id: str
    borrower_name: str
    officer_name: str
    dpd: int
    outstanding: Decimal
    score: float
    band: str
    rank: int | None


class RankIn(BaseModel):
    rank: int | None = Field(ge=1)
