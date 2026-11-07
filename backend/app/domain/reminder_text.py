"""Fill and verify reminder text. Pure: no database, no network.

verify_draft is the safety net for AI text. The model is only trusted with wording;
the name, amount and date must come through unchanged and nothing else numeric may appear.
"""
import re

from app.domain.word_filter import check_draft

MAX_LENGTH = 400
_NUMBER = re.compile(r"\d[\d,]*(?:\.\d+)?")


def render_template(body: str, *, name: str, amount: str, date: str) -> str:
    return body.format(name=name, amount=amount, date=date)


def verify_draft(text: str, *, name: str, amount: str, date: str) -> tuple[bool, str | None]:
    """Return (ok, reason). The first failed check is the reason shown to the officer."""
    ok, hits = check_draft(text)
    if not ok:
        return False, "Blocked words: " + ", ".join(hits)
    if len(text) > MAX_LENGTH:
        return False, f"Draft is longer than {MAX_LENGTH} characters"
    for label, value in (("name", name), ("amount", amount), ("date", date)):
        if value not in text:
            return False, f"Draft does not include the correct {label}"
    leftover = text
    for value in (name, amount, date):
        leftover = leftover.replace(value, " ")
    extra = [n.rstrip(",") for n in _NUMBER.findall(leftover)]
    if extra:
        return False, "Draft contains an unexpected number: " + extra[0]
    return True, None
