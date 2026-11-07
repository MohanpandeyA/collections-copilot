from app.domain.roll_rate import roll_rate


def test_counts_cohort_and_rolled():
    r = roll_rate([(10, 35), (20, 25), (5, 5)])
    assert (r.cohort, r.rolled, r.rate) == (3, 1, 33.3)


def test_boundaries_30_to_31_rolls():
    assert roll_rate([(30, 31)]).rolled == 1
    assert roll_rate([(1, 30)]).rolled == 0


def test_loans_not_overdue_at_month_start_are_excluded():
    assert roll_rate([(0, 40)]).cohort == 0


def test_loans_already_past_30_at_month_start_are_excluded():
    assert roll_rate([(31, 50)]).cohort == 0


def test_cured_loans_stay_in_cohort_but_do_not_roll():
    r = roll_rate([(15, 0), (15, 45)])
    assert (r.cohort, r.rolled, r.rate) == (2, 1, 50.0)


def test_empty_cohort_has_no_rate():
    r = roll_rate([])
    assert (r.cohort, r.rolled, r.rate) == (0, 0, None)
