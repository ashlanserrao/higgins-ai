"""The provider chain: Groq first, OpenAI as the backup, inside one time budget."""

import json
import re

import httpx
import pytest
from openai import APITimeoutError, AuthenticationError, RateLimitError

from app.ai import client as ai_client
from app.ai.schema import RESPONSE_FORMAT, EventIdeas
from app.config import Settings
from tests.conftest import ai_calls, make_ai
from tests.test_ai import VALID

pytestmark = pytest.mark.anyio

GOOD = json.dumps(VALID)


def refused(error_class, status, headers=None):
    response = httpx.Response(status, headers=headers, request=httpx.Request("POST", "https://api.groq.com"))
    return error_class("refused", response=response, body=None)


async def ask(ai, prompt="Plan summary for the test"):
    return await ai.call(
        task="ideas", instructions="Suggest ideas.", prompt_input=prompt,
        response_format=RESPONSE_FORMAT, output=EventIdeas, max_output_tokens=100,
    )


async def test_groq_answers_first_with_a_strict_schema():
    ai = make_ai(GOOD, groq=GOOD)
    assert await ask(ai) == EventIdeas(**VALID)
    call = ai_calls(ai, "groq")[0]
    assert call["response_format"]["json_schema"]["strict"] is True
    assert call["response_format"]["json_schema"]["schema"] == RESPONSE_FORMAT["schema"]
    assert [m["role"] for m in call["messages"]] == ["system", "user"]
    assert call["extra_body"] == {"include_reasoning": False}
    assert ai_calls(ai, "openai") == []


@pytest.mark.parametrize("failure, reason", [
    (APITimeoutError(request=httpx.Request("POST", "https://api.groq.com")), "timeout"),
    (refused(RateLimitError, 429), "429"),
    (refused(AuthenticationError, 401), "auth"),
    ("not json", "invalid_json"),
    (json.dumps(VALID | {"food": []}), "invalid_json"),  # valid JSON, fails the Pydantic check
])
async def test_openai_answers_when_groq_fails(failure, reason, caplog):
    ai = make_ai(GOOD, groq=failure)
    with caplog.at_level("INFO", logger="app.ai.client"):
        assert await ask(ai) == EventIdeas(**VALID)
    assert re.search(rf"AI ideas: groq \S+ \d+ms {reason}\n", caplog.text + "\n")
    assert re.search(r"AI ideas: openai \S+ \d+ms ok", caplog.text)
    assert "Plan summary" not in caplog.text  # never the prompt


async def test_after_a_429_groq_rests_and_calls_go_straight_to_openai():
    ai = make_ai(GOOD, groq=refused(RateLimitError, 429, {"retry-after": "30"}))
    await ask(ai, "first")
    await ask(ai, "second")  # a different input, so not from the cache
    assert (len(ai_calls(ai, "groq")), len(ai_calls(ai, "openai"))) == (1, 2)


async def test_a_slow_groq_hands_over_within_the_time_budget(monkeypatch):
    monkeypatch.setattr(ai_client, "MIN_BACKUP_SECONDS", 0.05)
    budget = Settings(openai_api_key="", groq_api_key="", groq_timeout_seconds=0.1, ai_timeout_seconds=1)
    assert await ask(make_ai(GOOD, groq=GOOD, settings=budget, groq_delay=5)) == EventIdeas(**VALID)

    # Too little time left after Groq: give up rather than start a backup that can't finish.
    tight = Settings(openai_api_key="", groq_api_key="", groq_timeout_seconds=0.1, ai_timeout_seconds=0.12)
    out_of_time = make_ai(GOOD, groq=GOOD, settings=tight, groq_delay=5)
    assert await ask(out_of_time) is None
    assert ai_calls(out_of_time, "openai") == []


async def test_groq_alone_failing_gives_no_answer():
    assert await ask(make_ai(groq="not json")) is None
