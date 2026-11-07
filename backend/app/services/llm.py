"""Gemini client. Returns a plain function prompt -> text, or None when no key is set.

Kept tiny so tests replace it with a fake and never touch the network.
The key goes in a header, never in the URL, so it cannot end up in logs.
"""
from collections.abc import Callable

import httpx

from app.core.config import settings

TIMEOUT_SECONDS = 45  # 25 s is too tight when behind a proxy; hosting env will be faster
URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

Llm = Callable[[str], str]


def _gemini(prompt: str) -> str:
    res = httpx.post(
        URL.format(model=settings.gemini_model),
        headers={"x-goog-api-key": settings.gemini_api_key},
        json={"contents": [{"parts": [{"text": prompt}]}],
              "generationConfig": {"temperature": 0.3, "maxOutputTokens": 400,
                                 # a short SMS needs no hidden reasoning; it only costs time and tokens
                                 "thinkingConfig": {"thinkingBudget": 0}}},
        timeout=TIMEOUT_SECONDS,
    )
    res.raise_for_status()
    return res.json()["candidates"][0]["content"]["parts"][0]["text"].strip()


def get_llm() -> Llm | None:
    return _gemini if settings.gemini_api_key else None
