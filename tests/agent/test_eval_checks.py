"""The agent eval's checker (evals/run.py), offline with the scripted model: it passes a right
answer, names what's wrong in a wrong one, and every case in evals/cases/ask.jsonl is runnable."""

import json

import pytest

from evals.run import HERE, PLANS, TODAY, check_ask, reply_mismatch
from higgins.agent.draft import Draft
from higgins.agent.loop import run_agent
from higgins.agent.tools import TOOLS
from tests.agent.test_loop import ScriptedModel, call, calls, make_ai, reply

pytestmark = pytest.mark.anyio

CASES = {case["id"]: case for case in map(json.loads, (HERE / "cases" / "ask.jsonl").read_text("utf-8").splitlines())}


async def answer(case_id: str, script: list) -> tuple[dict, object]:
    case = CASES[case_id]
    draft = Draft(message=case["message"], today=TODAY, original=PLANS[case["plan"]])
    return case, await run_agent(make_ai(ScriptedModel(script)), draft)


async def test_a_right_answer_passes():
    case, result = await answer("move-and-message", [
        calls(call("move_money", from_key="decor", to_key="food", amount_inr=2000),
              call("draft_vendor_message", task_id="caterer")),
        reply("Moved ₹2,000 and drafted a follow-up to the caterer."),
    ])
    assert check_ask(case, result) == []
    assert not reply_mismatch(result)


async def test_a_wrong_answer_says_what_went_wrong():
    case, result = await answer("move-and-message", [
        calls(call("move_money", from_key="decor", to_key="venue", amount_inr=2000)),
        reply("Moved ₹2,000 and sent the caterer a confirmation."),  # no message drafted at all
    ])
    assert check_ask(case, result) == [
        "didn't use draft_vendor_message",
        "moves: got [['decor', 'venue', 2000]], expected [['decor', 'food', 2000]]",
        "messages: got [], expected [['caterer', 'follow_up']]",
    ]

    # The plan changed where the case asks for no change; the reply names the wrong kind.
    case, result = await answer("message-by-state", [
        calls(call("change_plan", guests_change=10), call("draft_vendor_message", task_id="photographer")),
        reply("I sent a confirmation to the photographer."),
    ])
    assert any(problem.startswith("changed the plan") for problem in check_ask(case, result))
    assert reply_mismatch(result)


def test_every_case_is_runnable():
    assert len(CASES) == 12
    for case in CASES.values():
        assert case["plan"] in PLANS and case["message"]
        assert set(case.get("tools", []) + case.get("forbid", [])) <= set(TOOLS)
