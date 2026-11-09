"""One record per AI provider call: what it took (tokens, time), what it would cost, and how
much of the provider's rate limit is left. Numbers only: never the prompt, the reply or a key.

The provider chain records every attempt here. The record is logged as one line, and passed to
any listener: the evals count calls with one, and tracing (Phase 2, step 2) sends them on.
A listener that fails is logged and skipped, so telemetry can never break a request.
"""

import logging
from collections.abc import Callable
from dataclasses import dataclass

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
class CallRecord:
    task: str
    provider: str
    model: str
    ms: int
    outcome: str  # ok, timeout, 429, auth, bad_request, invalid_json, api_error
    usage: Usage = Usage()

    @property
    def cost_usd(self) -> float | None:
        """At list price; None when the model's price or the token counts are unknown."""
        price = PRICES_USD_PER_MILLION.get(self.model)
        if price is None or self.usage.input_tokens is None or self.usage.output_tokens is None:
            return None
        return (self.usage.input_tokens * price[0] + self.usage.output_tokens * price[1]) / 1_000_000


Listener = Callable[[CallRecord], None]
_listeners: list[Listener] = []


def subscribe(listener: Listener) -> Callable[[], None]:
    """Call `listener` with every record from now on. Returns the function that stops it."""
    _listeners.append(listener)
    return lambda: _listeners.remove(listener)


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
    for listener in list(_listeners):
        try:
            listener(call)
        except Exception:  # telemetry must never break a request
            logger.exception("Telemetry listener failed")
