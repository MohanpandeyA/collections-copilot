from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class LoanRowOut(BaseModel):
    loan_id: str
    borrower_name: str
    outstanding: Decimal
    dpd: int
    band: str
    score: float
    visited_today: bool = False


class ReasonOut(BaseModel):
    code: str
    text: str
    contribution: float


class PromiseOut(BaseModel):
    state: str
    promise_date: date
    amount: Decimal


class LoanDetailOut(BaseModel):
    loan_id: str
    borrower_name: str
    phone: str
    pincode: str
    outstanding: Decimal
    dpd: int
    last_payment_date: date | None
    score: float
    band: str
    reasons: list[ReasonOut]
    promise: PromiseOut | None
