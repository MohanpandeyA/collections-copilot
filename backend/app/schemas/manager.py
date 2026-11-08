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
    amount_received: Decimal | None = None


class ActivityPage(BaseModel):
    items: list[ActivityRow]
    total: int      # rows matching the filter, across all pages
    limit: int
    offset: int


class BandCounts(BaseModel):
    high: int
    medium: int
    low: int


class AgeBucket(BaseModel):
    key: str        # b1 | b2 | b3 | b4, the labels are the screen's job
    amount: Decimal


class PromiseCounts(BaseModel):
    open: int
    kept: int
    broken: int


class VisitDay(BaseModel):
    day: date
    count: int


class ResultMix(BaseModel):
    paid: int
    promise: int
    unreachable: int
    dispute: int


class InsightsOut(BaseModel):
    """Everything the dashboard charts draw, counted on the server so the browser never has to
    download the whole loan, promise and activity lists."""
    bands: BandCounts
    overdue_by_age: list[AgeBucket]
    promises: PromiseCounts
    visits_by_day: list[VisitDay]   # last 7 IST days ending today, oldest first, zeros included
    result_mix: ResultMix           # the same 7 days
    next_promises: list[PromiseRow]  # earliest open promises


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
