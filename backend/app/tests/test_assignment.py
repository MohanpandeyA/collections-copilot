from decimal import Decimal

from app.domain.assignment import OfficerLoad, assign_loans, pick_officer


def off(id, pins, load=0, amount="0"):
    return OfficerLoad(id, pins, load, Decimal(amount))


def test_pincode_match_wins_over_lighter_load():
    officers = [off(1, ["452001"], load=9), off(2, ["452003"], load=0)]
    d = pick_officer("452001", officers)
    assert d.officer_id == 1 and d.fallback is False


def test_least_loaded_among_pincode_matches():
    officers = [off(1, ["452001"], load=5), off(2, ["452001"], load=2)]
    assert pick_officer("452001", officers).officer_id == 2


def test_tie_on_count_goes_to_lower_outstanding():
    officers = [off(1, ["452001"], 3, "900000"), off(2, ["452001"], 3, "400000")]
    assert pick_officer("452001", officers).officer_id == 2


def test_full_tie_is_deterministic_by_id():
    officers = [off(7, ["452001"]), off(4, ["452001"])]
    assert pick_officer("452001", officers).officer_id == 4


def test_no_pincode_match_falls_back_to_branch_and_flags_it():
    officers = [off(1, ["452001"], 4), off(2, ["452003"], 1)]
    d = pick_officer("499999", officers)
    assert d.officer_id == 2 and d.fallback is True


def test_no_officers_returns_none():
    assert pick_officer("452001", []) is None


def test_batch_spreads_load_as_it_goes():
    officers = [off(1, ["452001"]), off(2, ["452001"])]
    loans = [("A", "452001", Decimal("100")), ("B", "452001", Decimal("100")),
             ("C", "452001", Decimal("100")), ("D", "452001", Decimal("100"))]
    result = assign_loans(loans, officers)
    counts = {1: 0, 2: 0}
    for d in result.values():
        counts[d.officer_id] += 1
    assert counts == {1: 2, 2: 2}


def test_batch_does_not_mutate_input():
    officers = [off(1, ["452001"])]
    assign_loans([("A", "452001", Decimal("10"))], officers)
    assert officers[0].load == 0
