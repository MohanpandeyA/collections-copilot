"""Rule-based priority score (0-100) with the top three reasons.

This is a transparent weighted model, not machine learning. Every reason is
one term of the sum, so the explanation is exact. Weights are labelled
assumption A9 in the TDD; a weekly back-test against real payments would tune them.
"""
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

WEIGHTS = {"dpd": 0.35, "promise": 0.25, "amount": 0.20, "payment": 0.20}
AMOUNT_CAP = Decimal("1000000")  # amounts above Rs 10 lakh all count as 1.0
ROLL_CLIFF = 30                  # loans past 30 DPD roll into the next bucket


@dataclass(frozen=True)
class LoanFacts:
    dpd: int
    outstanding: Decimal
    last_payment_date: date | None
    promise_state: str | None   # open | kept | broken | None
    promise_date: date | None
    today: date


@dataclass(frozen=True)
class Reason:
    code: str
    text: str
    contribution: float  # points out of 100


@dataclass(frozen=True)
class ScoreResult:
    score: float
    reasons: list[Reason]


def _fmt(d: date) -> str:
    return f"{d.day} {d.strftime('%b')}"


def _dpd_term(f: LoanFacts) -> tuple[float, str]:
    # Rises to 1.0 at the 30-day cliff, so 25-30 DPD loans rank highest.
    value = min(f.dpd / ROLL_CLIFF, 1.0)
    if f.dpd >= 25 and f.dpd <= ROLL_CLIFF:
        return value, f"{f.dpd} days past due, close to the 30-day cliff"
    return value, f"{f.dpd} days past due"


def _promise_term(f: LoanFacts) -> tuple[float, str]:
    if f.promise_state == "broken" and f.promise_date:
        return 1.0, f"Broke a promise to pay on {_fmt(f.promise_date)}"
    if f.promise_state == "open" and f.promise_date:
        if f.promise_date <= f.today:
            return 0.6, f"Promise due {_fmt(f.promise_date)}, not yet paid"
        return 0.2, f"Promise to pay on {_fmt(f.promise_date)}"
    return 0.0, "No promise to pay on record"


def _amount_term(f: LoanFacts) -> tuple[float, str]:
    value = float(min(f.outstanding / AMOUNT_CAP, Decimal(1)))
    return value, f"Rs {int(f.outstanding):,} outstanding"


def _payment_term(f: LoanFacts) -> tuple[float, str]:
    if f.last_payment_date is None:
        return 1.0, "No payment on record"
    days = (f.today - f.last_payment_date).days
    return min(days / 90, 1.0), f"Last payment {days} days ago"


def score_loan(f: LoanFacts) -> ScoreResult:
    terms = {
        "dpd": _dpd_term(f),
        "promise": _promise_term(f),
        "amount": _amount_term(f),
        "payment": _payment_term(f),
    }
    reasons = [
        Reason(code=k, text=text, contribution=round(WEIGHTS[k] * value * 100, 2))
        for k, (value, text) in terms.items()
    ]
    score = round(sum(r.contribution for r in reasons), 1)
    top3 = sorted(reasons, key=lambda r: r.contribution, reverse=True)[:3]
    return ScoreResult(score=score, reasons=top3)
