"""One record per AI provider call: what it took (tokens, time), what it would cost, and how
much of the provider's rate limit is left. Numbers only: never the prompt, the reply or a key.

The provider chain records every attempt here. The record is logged as one line, and passed to
any listener: the evals count calls with one, and the Langfuse exporter (core/langfuse.py) sends
them on. A listener that fails is logged and skipped, so telemetry can never break a request.

A request with several calls (the agent) opens a `trace`: calls and tool runs inside it carry
its ids, so they show as one trace, and the trace itself is recorded when it ends.
"""

import logging
import secrets
import time
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass, field

logger = logging.getLogger("higgins.ai.providers.chain")  # the existing per-call log line

# List prices in USD per 1M tokens (input, output), to show what calls would cost on a paid plan.
# Checked 9 Nov 2026: console.groq.com/docs/models, developers.openai.com/api/docs/models/gpt-5-nano.
PRICES_USD_PER_MILLION: dict[str, tuple[float, float]] = {
    "openai/gpt-oss-20b": (0.075, 0.30),
    "gpt-5-nano": (0.05, 0.40),
}


@dataclass(frozen=True)
class Usage:
    """What one provider reply reports. None: the provider didn't say."""

    input_tokens: int | None = None
    output_tokens: int | None = None
    # From the rate-limit headers, as the provider means them. Groq: tokens left this minute,
    # requests left today.
    tokens_left: int | None = None
    requests_left: int | None = None


@dataclass(frozen=True)
class TraceContext:
    """The trace a record belongs to: OpenTelemetry-style hex ids, and the trace's name."""

    name: str
    trace_id: str = field(default_factory=lambda: secrets.token_hex(16))
    span_id: str = field(default_factory=lambda: secrets.token_hex(8))  # the trace's root span


_current: ContextVar[TraceContext | None] = ContextVar("trace", default=None)


def _now_ns() -> int:
    return time.time_ns()


@dataclass(frozen=True)
class CallRecord:
    task: str
    provider: str
    model: str
    ms: int
    outcome: str  # ok, timeout, 429, auth, bad_request, invalid_json, api_error
    usage: Usage = Usage()
    trace: TraceContext | None = field(default_factory=_current.get)
    ended_ns: int = field(default_factory=_now_ns)

    @property
    def cost_usd(self) -> float | None:
        """At list price; None when the model's price or the token counts are unknown."""
        price = PRICES_USD_PER_MILLION.get(self.model)
        if price is None or self.usage.input_tokens is None or self.usage.output_tokens is None:
            return None
        return (self.usage.input_tokens * price[0] + self.usage.output_tokens * price[1]) / 1_000_000


@dataclass(frozen=True)
class ToolRecord:
    """One agent tool run: its name and outcome, never its arguments or result."""

    name: str
    outcome: str  # ok, error, invalid_arguments, unknown_tool
    ms: int
    trace: TraceContext | None = field(default_factory=_current.get)
    ended_ns: int = field(default_factory=_now_ns)


@dataclass(frozen=True)
class TraceRecord:
    """A finished trace: its whole time, and a few numbers about it (`facts`)."""

    context: TraceContext
    ms: int
    facts: dict[str, str | int]
    ended_ns: int = field(default_factory=_now_ns)


Record = CallRecord | ToolRecord | TraceRecord
Listener = Callable[[Record], None]
_listeners: list[Listener] = []


def subscribe(listener: Listener) -> Callable[[], None]:
    """Call `listener` with every record from now on. Returns the function that stops it."""
    _listeners.append(listener)
    return lambda: _listeners.remove(listener)


def _notify(item: Record) -> None:
    for listener in list(_listeners):
        try:
            listener(item)
        except Exception:  # telemetry must never break a request
            logger.exception("Telemetry listener failed")


def record(call: CallRecord) -> None:
    """Log the call as one line, then pass it to every listener."""
    usage, extra = call.usage, ""
    if usage.input_tokens is not None:
        extra += f" in={usage.input_tokens} out={usage.output_tokens}"
    if (cost := call.cost_usd) is not None:
        extra += f" ${cost:.6f}"
    if usage.tokens_left is not None:
        extra += f" tokens_left={usage.tokens_left}"
    level = logging.INFO if call.outcome == "ok" else logging.WARNING
    logger.log(level, "AI %s: %s %s %dms %s%s", call.task, call.provider, call.model, call.ms, call.outcome, extra)
    _notify(call)


def record_tool(name: str, outcome: str, ms: int) -> None:
    _notify(ToolRecord(name, outcome, ms))


@contextmanager
def trace(name: str) -> Iterator[dict[str, str | int]]:
    """Group the records made inside into one trace. Fill the yielded dict with facts about the
    whole request (how it ended, totals); they're recorded with the trace when it ends."""
    context = TraceContext(name)
    token = _current.set(context)
    started = time.monotonic()
    facts: dict[str, str | int] = {}
    try:
        yield facts
    finally:
        _current.reset(token)
        _notify(TraceRecord(context, round((time.monotonic() - started) * 1000), facts))
