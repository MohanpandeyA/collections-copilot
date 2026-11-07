"""Blocks threatening or abusive language in reminder drafts (RBI conduct rules).

The list is a starting point, kept in code so it is reviewable and tested.
A production list would come from the client's compliance team.
"""
import re

BLOCKED_TERMS = [
    "seize", "jail", "prison", "arrest", "police", "threat", "harass", "humiliate",
    "family will", "your family", "consequences", "legal action", "court", "goons",
    "जेल", "गिरफ्तार", "पुलिस", "धमकी", "अदालत",
]


def check_draft(text: str) -> tuple[bool, list[str]]:
    """Return (ok, matched_terms)."""
    lowered = text.lower()
    hits = [t for t in BLOCKED_TERMS if re.search(re.escape(t.lower()), lowered)]
    return (not hits), hits
