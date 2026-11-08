"""A small in-memory limiter for failed logins. State lives in one process, which is right for a
single API instance; with several instances each keeps its own count, so the limit only gets looser."""
import time
from collections import defaultdict, deque
from collections.abc import Callable

from fastapi import Request

MAX_PER_USER = 5      # wrong passwords for one username from one client
MAX_PER_CLIENT = 20   # wrong passwords from one client across all usernames
WINDOW_SECONDS = 15 * 60


class FailureLimiter:
    def __init__(self, clock: Callable[[], float] = time.monotonic):
        self._clock = clock
        self._hits: dict[tuple, deque[float]] = defaultdict(deque)

    def _recent(self, key: tuple) -> deque[float]:
        hits = self._hits[key]
        cutoff = self._clock() - WINDOW_SECONDS
        while hits and hits[0] <= cutoff:
            hits.popleft()
        if not hits:
            self._hits.pop(key, None)  # keeps the dict from growing with every client ever seen
        return hits

    def retry_after(self, client: str, username: str) -> int:
        """Seconds to wait, or 0 when this attempt may go ahead."""
        wait = 0.0
        for key, limit in ((("u", client, username), MAX_PER_USER), (("c", client), MAX_PER_CLIENT)):
            hits = self._recent(key)
            if len(hits) >= limit:
                wait = max(wait, hits[0] + WINDOW_SECONDS - self._clock())
        return int(wait) + 1 if wait > 0 else 0

    def record_failure(self, client: str, username: str) -> None:
        now = self._clock()
        self._hits[("u", client, username)].append(now)
        self._hits[("c", client)].append(now)

    def clear(self, client: str, username: str) -> None:
        self._hits.pop(("u", client, username), None)

    def reset(self) -> None:
        self._hits.clear()


login_limiter = FailureLimiter()


def client_ip(request: Request) -> str:
    """Behind a proxy (Render) the real address is the last entry the proxy appended to
    X-Forwarded-For. The first entries can be written by the caller, so they are not trusted."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[-1].strip()
    return request.client.host if request.client else "unknown"
