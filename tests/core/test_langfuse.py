"""The Langfuse exporter, offline: an agent request becomes one trace (a root, its model calls and
tool runs), only numbers leave the app, and a failing Langfuse never breaks anything."""

import base64
import json

import httpx
import pytest

from higgins.agent.draft import Draft
from higgins.agent.loop import run_agent
from higgins.core import telemetry
from higgins.core.langfuse import LangfuseExporter
from tests.agent.test_loop import ScriptedModel, call, calls, make_ai, reply
from tests.conftest import TODAY

pytestmark = pytest.mark.anyio

MESSAGE = "move 2k from decor to food and write to the caterer"


def exporter_with(handler) -> LangfuseExporter:
    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return LangfuseExporter("https://cloud.langfuse.com/", "pk-lf-test", "sk-lf-test", client, flush_after=60)


async def test_an_agent_request_is_one_trace_with_numbers_only(diwali_request):
    sent: list[httpx.Request] = []
    exporter = exporter_with(lambda request: sent.append(request) or httpx.Response(200))
    stop = telemetry.subscribe(exporter)
    try:
        await run_agent(make_ai(ScriptedModel([
            calls(call("move_money", from_key="decor", to_key="food", amount_inr=2000),
                  call("draft_vendor_message", task_id="caterer")),
            reply("Moved ₹2,000 and drafted a follow-up to the caterer."),
        ])), Draft(message=MESSAGE, today=TODAY, original=diwali_request))
    finally:
        stop()
    await exporter.close()

    [request] = sent  # everything in one batch, at close
    assert str(request.url) == "https://cloud.langfuse.com/api/public/otel/v1/traces"
    assert request.headers["authorization"] == "Basic " + base64.b64encode(b"pk-lf-test:sk-lf-test").decode()
    assert request.headers["x-langfuse-ingestion-version"] == "4"
    body = request.content.decode()
    spans = json.loads(body)["resourceSpans"][0]["scopeSpans"][0]["spans"]
    kinds = {span["name"]: {a["key"]: a["value"] for a in span["attributes"]} for span in spans}

    root = next(span for span in spans if "parentSpanId" not in span)
    assert root["name"] == "ask" and kinds["ask"]["langfuse.observation.type"] == {"stringValue": "agent"}
    assert {span["traceId"] for span in spans} == {root["traceId"]}  # one trace
    assert all(span["parentSpanId"] == root["spanId"] for span in spans if span is not root)
    names = sorted(span["name"] for span in spans)
    assert names == ["ask", "ask groq", "ask groq", "draft_vendor_message", "move_money"]
    generation = kinds["ask groq"]
    assert generation["langfuse.observation.type"] == {"stringValue": "generation"}
    assert generation["langfuse.observation.model.name"] == {"stringValue": "openai/gpt-oss-20b"}
    assert generation["gen_ai.usage.input_tokens"] == {"intValue": "1200"}
    assert kinds["ask"]["langfuse.observation.metadata.stopped"] == {"stringValue": "done"}
    # Never what the organiser typed, the model's reply, or the vendor message.
    for private in (MESSAGE, "decor", "caterer", "Moved", "Hello"):
        assert private not in body


async def test_a_failing_langfuse_never_breaks_anything(caplog):
    for handler in (lambda _: httpx.Response(500), lambda request: (_ for _ in ()).throw(httpx.ConnectError("down"))):
        exporter = exporter_with(handler)
        exporter(telemetry.ToolRecord("get_plan", "ok", 3))
        await exporter.close()  # logs, doesn't raise
    assert "not accepted (HTTP 500)" in caplog.text and "not sent (ConnectError)" in caplog.text
