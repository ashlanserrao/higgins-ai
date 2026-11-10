"""Send telemetry records to Langfuse as OpenTelemetry traces: plain OTLP/HTTP JSON, no SDK.

Numbers only: model, time, tokens, cost, outcome and tool names. Never prompts, replies, tool
arguments or anything the organiser typed.

Each record becomes one span. A call made outside a trace (ideas, quotes, a typed request) is its
own one-span trace. Inside the agent's trace, model calls ("generation") and tool runs ("tool")
are children of the trace's root span ("agent"), sent when the trace ends. Langfuse needs that
root span to build the trace.

Spans wait in a buffer and go in one request shortly after the first arrives, so a request
never waits on Langfuse. A failed send is logged and dropped: tracing must never break the app.
Endpoint and attribute names: langfuse.com/integrations/native/opentelemetry (checked 10 Nov 2026).
"""

import asyncio
import json
import logging
import secrets
from typing import Any

import httpx

from higgins.core.telemetry import CallRecord, Record, ToolRecord, TraceContext

logger = logging.getLogger(__name__)

PATH = "/api/public/otel/v1/traces"
FLUSH_AFTER_SECONDS = 2.0
TIMEOUT_SECONDS = 5.0
MAX_BUFFER = 500  # beyond this, new spans are dropped rather than grow without limit
OK, ERROR = 1, 2  # OpenTelemetry status codes


def _attribute(key: str, value: str | int | float) -> dict[str, Any]:
    if isinstance(value, bool) or isinstance(value, str):
        return {"key": key, "value": {"stringValue": str(value)}}
    if isinstance(value, int):
        return {"key": key, "value": {"intValue": str(value)}}  # OTLP JSON sends int64 as a string
    return {"key": key, "value": {"doubleValue": value}}


def _span(
    context: TraceContext | None, name: str, kind: str, ms: int, ended_ns: int, ok: bool,
    attributes: dict[str, str | int | float],
) -> dict[str, Any]:
    """One OTLP span. Inside a trace it's a child of the trace's root span; outside, a root."""
    trace_name = context.name if context else name
    attributes = {
        "langfuse.observation.type": kind, "langfuse.trace.name": trace_name,
        "langfuse.observation.level": "DEFAULT" if ok else "WARNING", **attributes,
    }
    span: dict[str, Any] = {
        "traceId": context.trace_id if context else secrets.token_hex(16),
        "spanId": secrets.token_hex(8),
        "name": name,
        "kind": 1,  # internal
        "startTimeUnixNano": str(ended_ns - ms * 1_000_000),
        "endTimeUnixNano": str(ended_ns),
        "attributes": [_attribute(key, value) for key, value in attributes.items() if value is not None],
        "status": {"code": OK if ok else ERROR},
    }
    if context:
        span["parentSpanId"] = context.span_id
    return span


def to_span(item: Record) -> dict[str, Any]:
    """A telemetry record as an OTLP span, with Langfuse's attribute names."""
    if isinstance(item, CallRecord):
        usage = item.usage
        attributes: dict[str, Any] = {
            "langfuse.observation.model.name": item.model, "gen_ai.request.model": item.model,
            "gen_ai.system": item.provider,
            "langfuse.observation.metadata.provider": item.provider,
            "langfuse.observation.metadata.outcome": item.outcome,
        }
        if usage.input_tokens is not None and usage.output_tokens is not None:
            attributes |= {
                "gen_ai.usage.input_tokens": usage.input_tokens, "gen_ai.usage.output_tokens": usage.output_tokens,
                "langfuse.observation.usage_details": json.dumps(
                    {"input": usage.input_tokens, "output": usage.output_tokens}),
            }
        if (cost := item.cost_usd) is not None:
            attributes |= {"gen_ai.usage.cost": cost, "langfuse.observation.cost_details": json.dumps({"total": cost})}
        if usage.tokens_left is not None:
            attributes["langfuse.observation.metadata.tokens_left"] = usage.tokens_left
        return _span(item.trace, f"{item.task} {item.provider}", "generation", item.ms, item.ended_ns,
                     item.outcome == "ok", attributes)
    if isinstance(item, ToolRecord):
        return _span(item.trace, item.name, "tool", item.ms, item.ended_ns, item.outcome == "ok",
                     {"langfuse.observation.metadata.outcome": item.outcome})
    # The trace's root span: its own ids, no parent.
    root = _span(None, item.context.name, "agent", item.ms, item.ended_ns, item.facts.get("stopped") in (None, "done"),
                 {f"langfuse.observation.metadata.{key}": value for key, value in item.facts.items()})
    root["traceId"], root["spanId"] = item.context.trace_id, item.context.span_id
    return root


class LangfuseExporter:
    """A telemetry listener (telemetry.subscribe) that sends spans to Langfuse."""

    def __init__(
        self, base_url: str, public_key: str, secret_key: str, client: httpx.AsyncClient | None = None,
        flush_after: float = FLUSH_AFTER_SECONDS,
    ) -> None:
        self.url = base_url.rstrip("/") + PATH
        self.client = client or httpx.AsyncClient(timeout=TIMEOUT_SECONDS)
        self.auth = httpx.BasicAuth(public_key, secret_key)
        self.flush_after = flush_after
        self.spans: list[dict[str, Any]] = []
        self._pending: asyncio.Task[None] | None = None

    def __call__(self, item: Record) -> None:
        if len(self.spans) >= MAX_BUFFER:
            return
        self.spans.append(to_span(item))
        if self._pending is None or self._pending.done():
            try:
                self._pending = asyncio.get_running_loop().create_task(self._flush_soon())
            except RuntimeError:  # no event loop: wait for an explicit flush()
                pass

    async def _flush_soon(self) -> None:
        await asyncio.sleep(self.flush_after)
        await self.flush()

    async def flush(self) -> bool:
        """Send everything buffered in one request. True if Langfuse accepted it (or nothing to send)."""
        spans, self.spans = self.spans, []
        if not spans:
            return True
        body = {"resourceSpans": [{
            "resource": {"attributes": [_attribute("service.name", "higgins")]},
            "scopeSpans": [{"scope": {"name": "higgins.telemetry"}, "spans": spans}],
        }]}
        try:
            response = await self.client.post(
                self.url, json=body, auth=self.auth, headers={"x-langfuse-ingestion-version": "4"},
            )
            if response.status_code >= 300:
                logger.warning("Langfuse: %d spans not accepted (HTTP %d)", len(spans), response.status_code)
                return False
        except httpx.HTTPError as exc:
            logger.warning("Langfuse: %d spans not sent (%s)", len(spans), type(exc).__name__)
            return False
        return True

    async def close(self) -> bool:
        """Send what's left and close the connection (app shutdown, end of an eval run)."""
        if self._pending and not self._pending.done():
            self._pending.cancel()
        sent = await self.flush()
        await self.client.aclose()
        return sent
