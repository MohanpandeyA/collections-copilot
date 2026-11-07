import pytest

from app.domain.promise import IllegalTransition, next_state


def test_open_promise_can_be_kept():
    assert next_state("open", "kept") == "kept"


def test_open_promise_can_be_broken():
    assert next_state("open", "broken") == "broken"


@pytest.mark.parametrize("current", ["kept", "broken"])
def test_closed_promises_cannot_change(current):
    with pytest.raises(IllegalTransition):
        next_state(current, "open")


def test_unknown_state_is_rejected():
    with pytest.raises(IllegalTransition):
        next_state("open", "paid")
