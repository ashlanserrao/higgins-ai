from datetime import date

import pytest

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
