from datetime import datetime, timezone

import pytest

from app.domain.contact_window import check_contact_window

IST_OFFSET_NOTE = "IST is UTC+05:30, so 08:00 IST is 02:30 UTC"


def ist(h, m=0, day=7):
    """Build an aware datetime for a wall-clock time in IST on Nov 2026."""
    from datetime import timedelta, timezone as tz
    return datetime(2026, 11, day, h, m, tzinfo=tz(timedelta(hours=5, minutes=30)))


@pytest.mark.parametrize("h,m", [(8, 0), (12, 30), (18, 59)])
def test_inside_window_is_allowed(h, m):
    allowed, reason = check_contact_window(ist(h, m))
    assert allowed is True
    assert reason is None


@pytest.mark.parametrize("h,m", [(7, 59), (19, 0), (23, 30), (0, 0)])
def test_outside_window_is_blocked_with_reason(h, m):
    allowed, reason = check_contact_window(ist(h, m))
    assert allowed is False
    assert "08:00" in reason and "19:00" in reason


def test_converts_utc_to_ist_before_checking():
    # 02:30 UTC is exactly 08:00 IST, so allowed
    allowed, _ = check_contact_window(datetime(2026, 11, 7, 2, 30, tzinfo=timezone.utc))
    assert allowed is True
    # 13:29 UTC is 18:59 IST, still allowed; 13:30 UTC is 19:00 IST, blocked
    assert check_contact_window(datetime(2026, 11, 7, 13, 29, tzinfo=timezone.utc))[0] is True
    assert check_contact_window(datetime(2026, 11, 7, 13, 30, tzinfo=timezone.utc))[0] is False


def test_naive_datetime_is_rejected():
    with pytest.raises(ValueError):
        check_contact_window(datetime(2026, 11, 7, 10, 0))
