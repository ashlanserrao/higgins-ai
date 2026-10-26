"""Small in-process protections: per-IP rate limiting and security headers.

In-memory state assumes a single process (documented in the README).
"""

import time
from collections import deque
from threading import Lock

SECURITY_HEADERS = {
    # Inline styles are allowed for the landing page's "how it works" web component
    # (frontend/public/hm/), which styles its shadow root inline. Scripts stay same-origin only.
    "Content-Security-Policy": (
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
        "connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
    ),
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    # Plan inputs live in the URL query; never leak them to other sites.
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
}


class RateLimiter:
    """Sliding-window limit of `limit` requests per `window` seconds per client key."""

    _MAX_TRACKED_CLIENTS = 10_000

    def __init__(self, limit: int, window: float = 60.0) -> None:
        self.limit = limit
        self.window = window
        self._hits: dict[str, deque[float]] = {}
        self._lock = Lock()

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        with self._lock:
            if len(self._hits) > self._MAX_TRACKED_CLIENTS:
                self._drop_stale(now)
            hits = self._hits.setdefault(key, deque())
            while hits and now - hits[0] > self.window:
                hits.popleft()
            if len(hits) >= self.limit:
                return False
            hits.append(now)
            return True

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()

    def _drop_stale(self, now: float) -> None:
        stale = [k for k, hits in self._hits.items() if not hits or now - hits[-1] > self.window]
        for key in stale:
            del self._hits[key]
