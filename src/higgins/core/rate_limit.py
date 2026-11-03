"""Per-key sliding-window rate limiting: per visitor IP, and one key for all AI calls together.

In-memory state assumes a single process (documented in the README).
"""

import time
from collections import deque
from threading import Lock


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
