"""The agent loop, with a scripted fake model: tools run in order, mistakes come back to the
model, and the guardrails (step cap, time budget, backup provider) stop or rescue it."""

import asyncio
import json
from types import SimpleNamespace

import httpx
import pytest
from openai import APITimeoutError

from higgins.agent import loop
from higgins.agent.draft import Draft
from higgins.agent.loop import run_agent
from higgins.ai.providers.chain import StructuredAI
from higgins.ai.providers.groq_provider import GroqProvider
from higgins.ai.providers.openai_provider import OpenAIProvider
from higgins.core.config import Settings
from tests.conftest import TODAY, USAGE, raw_endpoint

pytestmark = pytest.mark.anyio

SETTINGS = Settings(openai_api_key="", groq_api_key="")


def call(name: str, **arguments) -> SimpleNamespace:
    """A tool call as the SDK returns it."""
    return SimpleNamespace(
        id=f"call_{name}_{len(arguments)}", type="function",
        function=SimpleNamespace(name=name, arguments=json.dumps(arguments)),
    )


def turn(content: str | None, tool_calls: list | None) -> SimpleNamespace:
    """One model turn as the SDK returns it."""
    message = SimpleNamespace(content=content, tool_calls=tool_calls)
    return SimpleNamespace(choices=[SimpleNamespace(message=message)], usage=USAGE)


def calls(*tool_calls: SimpleNamespace) -> SimpleNamespace:
    return turn(None, list(tool_calls))


def reply(text: str) -> SimpleNamespace:
    return turn(text, None)


class ScriptedModel:
    """Stands in for chat.completions: answers each turn from the script, in order (or raises)."""

    def __init__(self, script, delay=0.0):
        self.script = list(script)
        self.delay = delay
        self.calls: list[dict] = []
        self.chat = SimpleNamespace(completions=self)
        self.with_raw_response = raw_endpoint(self.create)

    async def create(self, **kwargs):
        self.calls.append({**kwargs, "messages": list(kwargs["messages"])})  # a copy: the loop keeps appending
        if self.delay:
            await asyncio.sleep(self.delay)
        step = self.script.pop(0)
        if isinstance(step, Exception):
            raise step
        return step


def make_ai(groq: ScriptedModel, openai: ScriptedModel | None = None) -> StructuredAI:
    providers = [GroqProvider(SETTINGS, groq, SETTINGS.groq_timeout_seconds)]
    if openai:
        providers.append(OpenAIProvider(SETTINGS, openai, SETTINGS.ai_timeout_seconds))
    return StructuredAI(SETTINGS, providers)


def lines(draft: Draft) -> dict[str, int]:
    return {line.key: line.amount_inr for line in draft.plan().budget_lines}


async def test_a_request_that_needs_two_tools(diwali_request):
    message = "move 2k from decor to food and write to the caterer"
    draft = Draft(message=message, today=TODAY, original=diwali_request)
    before = lines(draft)
    model = ScriptedModel([
        calls(call("move_money", from_key="decor", to_key="food", amount_inr=2000),
              call("draft_vendor_message", task_id="caterer", kind="enquiry")),
        reply("Moved ₹2,000 from decor to food and drafted an enquiry to the caterer."),
    ])

    result = await run_agent(make_ai(model), draft)

    assert (result.stopped, result.turns) == ("done", 2)
    assert (result.input_tokens, result.output_tokens) == (2 * USAGE.prompt_tokens, 2 * USAGE.completion_tokens)
    assert [(run.name, run.outcome) for run in result.tool_runs] == [
        ("move_money", "ok"), ("draft_vendor_message", "ok"),
    ]
    assert lines(draft)["food"] == before["food"] + 2000 and len(draft.messages) == 1
    assert result.reply.startswith("Moved ₹2,000")
    # Turn 1 already has the plan (no get_plan turn) and the message fenced as data.
    first = model.calls[0]
    assert '"budget_lines"' in first["messages"][1]["content"]
    assert f"<message>{message}</message>" in first["messages"][1]["content"]
    assert [spec["function"]["name"] for spec in first["tools"]][:2] == ["get_plan", "change_plan"]
    # Turn 2 carries both tool results, each matched to its call.
    tool_messages = [m for m in model.calls[1]["messages"] if m["role"] == "tool"]
    assert [m["tool_call_id"] for m in tool_messages] == ["call_move_money_3", "call_draft_vendor_message_2"]


async def test_a_mistake_goes_back_to_the_model_which_fixes_it(diwali_request):
    draft = Draft(message="move 2k from decor to food", today=TODAY, original=diwali_request)
    model = ScriptedModel([
        calls(call("move_money", from_key="decor", to_key="food", amount_inr=5000)),
        calls(call("move_money", from_key="decor", to_key="food", amount_inr=2000)),
        reply("Moved ₹2,000 from decor to food."),
    ])

    result = await run_agent(make_ai(model), draft)

    assert result.stopped == "done"
    assert [run.outcome for run in result.tool_runs] == ["error", "ok"]
    assert "didn't say ₹5,000" in model.calls[1]["messages"][-1]["content"]
    assert draft.changes() is not None


async def test_the_step_cap_stops_a_model_that_never_finishes(diwali_request):
    draft = Draft(message="what's left to book?", today=TODAY, original=diwali_request)
    model = ScriptedModel([calls(call("get_plan"))] * 5)

    result = await run_agent(make_ai(model), draft, max_turns=3)

    assert (result.stopped, result.turns, len(model.calls)) == ("step_cap", 3, 3)
    assert result.reply == ""


async def test_the_backup_continues_the_same_conversation(diwali_request):
    draft = Draft(message="add 40 guests", today=TODAY, original=diwali_request)
    groq = ScriptedModel([
        calls(call("change_plan", guests_change=40)),
        APITimeoutError(request=httpx.Request("POST", "https://api.groq.com")),
    ])
    openai = ScriptedModel([reply("Added 40 guests.")])

    result = await run_agent(make_ai(groq, openai), draft)

    assert result.stopped == "done" and draft.current.guests == 540
    # OpenAI got the whole conversation so far, tool result included, in the same format.
    assert [m["role"] for m in openai.calls[0]["messages"]] == ["system", "user", "assistant", "tool"]
    assert openai.calls[0]["store"] is False


async def test_the_time_budget_stops_the_loop_and_keeps_what_was_done(diwali_request, monkeypatch):
    monkeypatch.setattr(loop, "MIN_TURN_SECONDS", 0.4)
    draft = Draft(message="add 40 guests", today=TODAY, original=diwali_request)
    model = ScriptedModel([calls(call("change_plan", guests_change=40)), reply("never reached")], delay=0.15)

    result = await run_agent(make_ai(model), draft, time_budget=0.5)

    # 0.15 s for turn 1 leaves 0.35 s, too little for another turn.
    assert (result.stopped, result.turns, len(model.calls)) == ("time", 1, 1)
    assert draft.current.guests == 540
