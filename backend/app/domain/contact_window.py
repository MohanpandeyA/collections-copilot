"""RBI recovery rule: borrowers may be contacted only 08:00 to 19:00 IST."""
from datetime import datetime, time, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))
WINDOW_START = time(8, 0)
WINDOW_END = time(19, 0)  # exclusive: 19:00 itself is blocked


def check_contact_window(now: datetime) -> tuple[bool, str | None]:
    """Return (allowed, block_reason). `now` must be timezone-aware.

    The server passes its own clock, never the phone's, so a wrong device
    clock cannot unlock contact outside the window.
    """
    if now.tzinfo is None:
        raise ValueError("now must be timezone-aware")
    local = now.astimezone(IST).time()
    if WINDOW_START <= local < WINDOW_END:
        return True, None
    return False, "Contact allowed only between 08:00 and 19:00 IST"
