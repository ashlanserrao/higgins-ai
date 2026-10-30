import asyncio
from datetime import date
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.ai.client import GroqProvider, OpenAIProvider, StructuredAI
from app.ai.ideas import IdeasGenerator
from app.ai.quotes import QuoteExtractor
from app.ai.understand import PlanInterpreter
from app.config import Settings
from app.main import (
    RATE_LIMITERS, ai, ai_total_limiter, app, get_ideas_generator, get_plan_interpreter, get_quote_extractor,
    today_in_india,
)
from app.models import PlanRequest

TODAY = date(2026, 10, 21)


@pytest.fixture
def wedding_request() -> PlanRequest:
    return PlanRequest(
        event_type="wedding", event_date=date(2027, 12, 12), guests=250, budget_inr=1_500_000,
        city="Bengaluru", venue_type="venue", venue_includes_catering=True,
        priorities=["food", "photography"],
    )


@pytest.fixture
def birthday_request() -> PlanRequest:
    return PlanRequest(
        event_type="birthday", event_date=date(2026, 11, 11), guests=40, budget_inr=12_000,
        city="Mysuru", venue_type="home", priorities=["decor", "entertainment"],
        preferences="Dinosaur theme, my son loves T-rex",
    )


@pytest.fixture
def diwali_request() -> PlanRequest:
    return PlanRequest(
        event_type="community", event_date=date(2026, 11, 8), guests=500, budget_inr=150_000,
        city="Bengaluru", venue_type="outdoor", households=120,
    )


class FakeEndpoint:
    """Stands in for responses.create (OpenAI) or chat.completions.create (Groq)."""

    def __init__(self, outcome, delay):
        self.outcome = outcome
        self.delay = delay
        self.calls = []

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        if self.delay:
            await asyncio.sleep(self.delay)
        if isinstance(self.outcome, Exception):
            raise self.outcome
        return SimpleNamespace(
            output_text=self.outcome, choices=[SimpleNamespace(message=SimpleNamespace(content=self.outcome))],
        )


class FakeClient:
    """Stands in for openai.AsyncOpenAI: returns `outcome` as the reply text, or raises it."""

    def __init__(self, outcome, delay=0.0):
        self.responses = FakeEndpoint(outcome, delay)
        self.chat = SimpleNamespace(completions=self.responses)


def make_ai(outcome=None, groq=None, settings: Settings | None = None, groq_delay=0.0) -> StructuredAI:
    """An AI whose OpenAI replies are `outcome` and Groq replies are `groq` (Groq first).
    Neither given: no API key is configured."""
    settings = settings or Settings(openai_api_key="", groq_api_key="")
    providers = []
    if groq is not None:
        providers.append(GroqProvider(settings, FakeClient(groq, groq_delay), settings.groq_timeout_seconds))
    if outcome is not None:
        providers.append(OpenAIProvider(settings, FakeClient(outcome), settings.ai_timeout_seconds))
    return StructuredAI(settings, providers)


def make_generator(outcome=None) -> IdeasGenerator:
    return IdeasGenerator(make_ai(outcome))


def make_extractor(outcome=None) -> QuoteExtractor:
    return QuoteExtractor(make_ai(outcome))


def make_interpreter(outcome=None) -> PlanInterpreter:
    return PlanInterpreter(make_ai(outcome))


def ai_calls(feature, provider="openai") -> list[dict]:
    """The requests a fake-backed feature (or StructuredAI) sent to one provider."""
    ai = getattr(feature, "ai", feature)
    return next(p for p in ai.providers if p.name == provider).client.responses.calls


@pytest.fixture
def client():
    """API client with a pinned date and no real OpenAI access."""
    app.dependency_overrides[today_in_india] = lambda: TODAY
    app.dependency_overrides[get_ideas_generator] = lambda: make_generator()
    app.dependency_overrides[get_quote_extractor] = lambda: make_extractor()
    app.dependency_overrides[get_plan_interpreter] = lambda: make_interpreter()
    for limiter in [*RATE_LIMITERS.values(), ai_total_limiter]:
        limiter.reset()
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def no_real_ai(monkeypatch):
    """Tests never reach a real AI provider (Groq or OpenAI), even with keys in .env."""
    monkeypatch.setattr(ai, "providers", [])
