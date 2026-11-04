"""POST /api/ask: the agent's proposal comes from its working copy, partial work is kept and
labelled, and nothing is applied on the server."""

from higgins.agent.propose import FAILED_REPLY, PARTIAL_REPLY
from higgins.ai.providers.chain import StructuredAI
from higgins.ai.providers.groq_provider import GroqProvider
from higgins.api.dependencies import get_agent_ai
from higgins.api.main import app
from higgins.core.rate_limit import RateLimiter
from tests.agent.test_loop import SETTINGS, ScriptedModel, call, calls, reply


def use_model(model: ScriptedModel, hourly_cap: RateLimiter | None = None) -> None:
    ai = StructuredAI(SETTINGS, [GroqProvider(SETTINGS, model, SETTINGS.groq_timeout_seconds)], hourly_cap)
    app.dependency_overrides[get_agent_ai] = lambda: ai


def ask(client, request, message: str):
    return client.post("/api/ask", json={"message": message, "current": request.model_dump(mode="json")})


def test_a_full_proposal_changes_the_plan_and_drafts_a_message(client, diwali_request):
    use_model(ScriptedModel([
        calls(call("move_money", from_key="decor", to_key="food", amount_inr=2000),
              call("draft_vendor_message", task_id="caterer", kind="enquiry")),
        reply("Moved ₹2,000 from decor to food and drafted an enquiry to the caterer."),
    ]))

    response = ask(client, diwali_request, "move 2k from decor to food and write to the caterer")

    assert response.status_code == 200
    body = response.json()
    assert (body["stopped"], body["partial"]) == ("done", False)
    assert body["reply"].startswith("Moved ₹2,000")
    assert body["inputs"]["progress"]["moves"] == [{"from_key": "decor", "to_key": "food", "amount_inr": 2000}]
    assert body["changes"]["summary"] and body["plan"]["budget_lines"]
    [message] = body["messages"]
    assert message["task_id"] == "caterer" and message["label"] != "caterer"
    assert message["text"].startswith("Hello,")


def test_a_question_proposes_no_change(client, diwali_request):
    use_model(ScriptedModel([reply("You still need to book the caterer and the decorator.")]))

    body = ask(client, diwali_request, "what's left to book?").json()

    assert body["stopped"] == "done" and body["reply"].startswith("You still need")
    assert (body["inputs"], body["plan"], body["changes"], body["messages"]) == (None, None, None, [])


def test_stopping_early_keeps_the_work_done_and_says_so(client, diwali_request):
    # One useful change, then the model loops on get_plan until the 6-turn cap.
    use_model(ScriptedModel([calls(call("change_plan", guests_change=40))] + [calls(call("get_plan"))] * 5))

    body = ask(client, diwali_request, "add 40 guests and sort out the rest").json()

    assert (body["stopped"], body["partial"], body["reply"]) == ("step_cap", True, PARTIAL_REPLY)
    assert body["inputs"]["guests"] == 540


def test_no_answer_and_no_work_is_a_plain_failure(client, diwali_request):
    use_model(ScriptedModel([reply("")] * 2))  # empty replies fail, so no provider answers

    body = ask(client, diwali_request, "add 40 guests").json()

    assert (body["stopped"], body["partial"], body["reply"]) == ("no_answer", False, FAILED_REPLY)
    assert body["inputs"] is None


def test_busy_without_a_key_and_bad_bodies(client, diwali_request):
    use_model(ScriptedModel([]), hourly_cap=RateLimiter(0))
    assert ask(client, diwali_request, "add 40 guests").status_code == 429  # like the other AI routes

    app.dependency_overrides[get_agent_ai] = lambda: StructuredAI(SETTINGS, [])  # no API key
    body = ask(client, diwali_request, "add 40 guests").json()
    assert (body["ai_available"], body["inputs"]) == (False, None)

    assert client.post("/api/ask", json={"message": "add 40 guests"}).status_code == 422  # a plan is required
