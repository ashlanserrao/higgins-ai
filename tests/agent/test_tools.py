"""The agent's tools: the engine does the work, values the organiser never said are refused, and
every problem comes back to the model as text it can act on."""

import json

from higgins.agent.draft import Draft
from higgins.agent.tools import TOOLS, run_tool, tool_specs
from tests.conftest import TODAY


def draft_for(request, message: str) -> Draft:
    return Draft(message=message, today=TODAY, original=request)


def lines(draft: Draft) -> dict[str, int]:
    return {line.key: line.amount_inr for line in draft.plan().budget_lines}


def test_get_plan_shows_keys_and_ids_but_not_the_organisers_free_text(birthday_request):
    result, outcome = run_tool(draft_for(birthday_request, "what's left to book?"), "get_plan", {})
    plan = json.loads(result)
    assert outcome == "ok"
    assert {"decor", "food", "contingency"} <= {line["key"] for line in plan["budget_lines"]}
    assert any(booking["can_message_vendor"] for booking in plan["bookings"])
    # Preferences are untrusted text (prompt injection); the model doesn't need them to plan.
    assert "Dinosaur" not in result


def test_change_plan_reuses_the_one_shot_checks(diwali_request):
    draft = draft_for(diwali_request, "add 40 guests")
    # The model also "fills in" a city the message never named; the existing check drops it.
    result, outcome = run_tool(draft, "change_plan", {"guests_change": 40, "city": "Mumbai"})
    assert outcome == "ok", result
    assert draft.current.guests == 540  # the server adds; the model never works out the total
    assert draft.current.city == "Bengaluru"
    assert draft.changes() is not None


def test_move_money_only_moves_an_amount_the_organiser_said(diwali_request):
    draft = draft_for(diwali_request, "move 2k from decor to food")
    before = lines(draft)

    result, outcome = run_tool(draft, "move_money", {"from_key": "decor", "to_key": "food", "amount_inr": 5000})
    assert (outcome, draft.current) == ("error", diwali_request)
    assert "didn't say ₹5,000" in result

    result, outcome = run_tool(draft, "move_money", {"from_key": "decor", "to_key": "food", "amount_inr": 2000})
    assert outcome == "ok", result
    after = lines(draft)
    assert (after["decor"], after["food"]) == (before["decor"] - 2000, before["food"] + 2000)
    assert diwali_request.progress.moves == []  # the plan as sent is never mutated


def test_engine_errors_come_back_as_text_and_leave_the_draft_alone(diwali_request):
    draft = draft_for(diwali_request, "move 1 lakh from decor to food")
    result, outcome = run_tool(draft, "move_money", {"from_key": "decor", "to_key": "food", "amount_inr": 100_000})
    assert outcome == "error"
    assert "below ₹0" in result
    assert draft.current == diwali_request and draft.changes() is None


def test_vendor_messages_are_written_by_the_engine(diwali_request):
    draft = draft_for(diwali_request, "write to the caterer")
    # The model's "confirmation" isn't in the organiser's words, so the booking's state picks the
    # kind, as on the page: 18 days to go and a caterer needs 21, so it's a follow-up.
    result, outcome = run_tool(draft, "draft_vendor_message", {"task_id": "caterer", "kind": "confirmation"})
    assert outcome == "ok", result
    [message] = draft.messages
    assert message.kind == "follow_up"
    assert message.text.startswith("Hello,") and "Bengaluru" in message.text
    assert "budget" not in message.text.lower()  # left out unless the organiser asks

    result, outcome = run_tool(draft, "draft_vendor_message", {"task_id": "unicorn", "kind": "enquiry"})
    assert outcome == "error" and "isn't in your plan" in result


def test_bad_calls_are_answered_not_raised(diwali_request):
    draft = draft_for(diwali_request, "add 40 guests")
    assert run_tool(draft, "delete_everything", {})[1] == "unknown_tool"
    assert run_tool(draft, "change_plan", '{"guests_change": "lots"}')[1] == "invalid_arguments"
    assert run_tool(draft, "change_plan", {"event_type": "wedding"})[1] == "invalid_arguments"  # not a tool field
    assert draft.current == diwali_request


def test_every_tool_has_a_schema_the_providers_accept():
    specs = tool_specs()
    assert [spec["function"]["name"] for spec in specs] == list(TOOLS)
    for spec in specs:
        assert spec["type"] == "function" and spec["function"]["description"]
        assert spec["function"]["parameters"]["type"] == "object"
