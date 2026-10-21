from datetime import date
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.ai.ideas import IdeasGenerator
from app.config import Settings
from app.main import app, get_ideas_generator, rate_limiter, today_in_india
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


class FakeResponses:
    def __init__(self, outcome):
        self.outcome = outcome
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        if isinstance(self.outcome, Exception):
            raise self.outcome
        return SimpleNamespace(output_text=self.outcome)


class FakeOpenAI:
    """Stands in for openai.OpenAI: returns `outcome` as output_text, or raises it."""

    def __init__(self, outcome):
        self.responses = FakeResponses(outcome)


def make_generator(outcome=None) -> IdeasGenerator:
    """outcome=None gives a generator with no API key configured."""
    no_key = Settings(openai_api_key="")
    return IdeasGenerator(no_key, client=FakeOpenAI(outcome) if outcome is not None else None)


@pytest.fixture
def client():
    """API client with a pinned date and no real OpenAI access."""
    app.dependency_overrides[today_in_india] = lambda: TODAY
    app.dependency_overrides[get_ideas_generator] = lambda: make_generator()
    rate_limiter.reset()
    yield TestClient(app)
    app.dependency_overrides.clear()
