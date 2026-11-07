"""Roll rate: of the loans 1-30 days past due at month start, how many are past 30 now.

Pure function over (dpd_at_month_start, dpd_now) pairs. Loans that were current or
already past 30 at month start are not in the cohort, and loans that cured stay in it
without counting as rolled (assumption A8).
"""
from dataclasses import dataclass

ROLL_CLIFF = 30


@dataclass(frozen=True)
class RollRate:
    cohort: int
    rolled: int
    rate: float | None  # percent, one decimal; None when the cohort is empty


def roll_rate(pairs: list[tuple[int, int]]) -> RollRate:
    cohort = [(start, now) for start, now in pairs if 1 <= start <= ROLL_CLIFF]
    rolled = sum(1 for _, now in cohort if now > ROLL_CLIFF)
    rate = round(rolled / len(cohort) * 100, 1) if cohort else None
    return RollRate(len(cohort), rolled, rate)
