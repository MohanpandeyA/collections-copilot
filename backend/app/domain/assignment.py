"""Pick an officer for a loan. Pure: the caller loads officers and saves results.

Rule (assumption A2, one active officer per loan):
1. Officers whose pincodes include the loan's pincode.
2. Among them, the fewest open loans, then the lowest outstanding total, then lowest id.
3. If nobody covers the pincode, use the whole branch and flag it as a fallback so the
   manager can review it.
"""
from dataclasses import dataclass, replace
from decimal import Decimal


@dataclass(frozen=True)
class OfficerLoad:
    id: int
    pincodes: list[str]
    load: int  # open loans already assigned
    outstanding: Decimal  # total outstanding already assigned


@dataclass(frozen=True)
class Decision:
    officer_id: int
    fallback: bool  # True when no officer covered the pincode


def _lightest(officers: list[OfficerLoad]) -> OfficerLoad:
    return min(officers, key=lambda o: (o.load, o.outstanding, o.id))


def pick_officer(pincode: str, officers: list[OfficerLoad]) -> Decision | None:
    if not officers:
        return None
    local = [o for o in officers if pincode in o.pincodes]
    if local:
        return Decision(_lightest(local).id, fallback=False)
    return Decision(_lightest(officers).id, fallback=True)


def assign_loans(
    loans: list[tuple[str, str, Decimal]], officers: list[OfficerLoad]
) -> dict[str, Decision]:
    """loans are (loan_id, pincode, outstanding). Load is updated as we go so a big
    batch spreads out instead of piling onto whoever started lightest."""
    state = {o.id: o for o in officers}
    result: dict[str, Decision] = {}
    for loan_id, pincode, amount in loans:
        decision = pick_officer(pincode, list(state.values()))
        if decision is None:
            continue
        result[loan_id] = decision
        o = state[decision.officer_id]
        state[o.id] = replace(o, load=o.load + 1, outstanding=o.outstanding + amount)
    return result
