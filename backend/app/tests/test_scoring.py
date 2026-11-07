from datetime import date
from decimal import Decimal

from app.domain.scoring import LoanFacts, score_loan

TODAY = date(2026, 11, 7)


def facts(**overrides):
    base = dict(dpd=5, outstanding=Decimal("50000"), last_payment_date=TODAY,
                promise_state=None, promise_date=None, today=TODAY)
    base.update(overrides)
    return LoanFacts(**base)


def test_score_is_between_0_and_100():
    s = score_loan(facts(dpd=45, outstanding=Decimal("9000000"), promise_state="broken"))
    assert 0 <= s.score <= 100


def test_higher_dpd_scores_higher_all_else_equal():
    low = score_loan(facts(dpd=3))
    high = score_loan(facts(dpd=28))
    assert high.score > low.score


def test_broken_promise_scores_above_no_promise():
    none = score_loan(facts(dpd=12))
    broken = score_loan(facts(dpd=12, promise_state="broken", promise_date=date(2026, 10, 31)))
    assert broken.score > none.score


def test_returns_exactly_three_reasons_sorted_by_contribution():
    s = score_loan(facts(dpd=27, outstanding=Decimal("640000"), promise_state="broken",
                         promise_date=date(2026, 10, 31),
                         last_payment_date=date(2026, 9, 1)))
    assert len(s.reasons) == 3
    contributions = [r.contribution for r in s.reasons]
    assert contributions == sorted(contributions, reverse=True)


def test_reasons_are_plain_text_and_name_the_real_fact():
    s = score_loan(facts(dpd=27, promise_state="broken", promise_date=date(2026, 10, 31)))
    texts = " ".join(r.text for r in s.reasons)
    assert "27" in texts            # the DPD number is shown
    assert "31 Oct" in texts        # the broken promise date is shown


def test_same_inputs_give_same_score():
    assert score_loan(facts(dpd=20)).score == score_loan(facts(dpd=20)).score


def test_weights_sum_to_one():
    from app.domain.scoring import WEIGHTS
    assert abs(sum(WEIGHTS.values()) - 1.0) < 1e-9
