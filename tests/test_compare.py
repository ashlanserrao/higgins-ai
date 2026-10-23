"""Money moves between budget lines, and before/after comparison of two plans."""

from datetime import timedelta

import pytest
from pydantic import ValidationError

from app.engine.errors import PlanInputError
from app.engine.planner import build_plan
from app.main import plan_limiter
from app.models import Move, Progress, Quote
from tests.conftest import TODAY


def with_progress(request, **progress):
    return request.model_copy(update={"progress": Progress(**progress)})


def move(from_key, to_key, amount):
    return Move(from_key=from_key, to_key=to_key, amount_inr=amount)


def lines_by_key(plan):
    return {line.key: line for line in plan.budget_lines}


def as_json(request) -> dict:
    return request.model_dump(mode="json")


# --- Money moves ---------------------------------------------------------------------


def test_moved_money_becomes_the_new_estimate(diwali_request):
    before = lines_by_key(build_plan(diwali_request, TODAY))
    plan = build_plan(with_progress(diwali_request, moves=[move("decor", "food", 5_000)]), TODAY)
    lines = lines_by_key(plan)

    assert lines["decor"].amount_inr == lines["decor"].estimate_inr == before["decor"].amount_inr - 5_000
    assert lines["food"].amount_inr == before["food"].amount_inr + 5_000
    assert (lines["decor"].moved_inr, lines["food"].moved_inr) == (-5_000, 5_000)
    assert lines["decor"].percent == round(lines["decor"].amount_inr * 100 / diwali_request.budget_inr, 1)
    assert lines["sound"] == before["sound"]
    assert sum(line.amount_inr for line in plan.budget_lines) == diwali_request.budget_inr


def test_quotes_are_compared_with_the_moved_estimate(diwali_request):
    progress = {"moves": [move("decor", "food", 5_000)], "quotes": [Quote(id="q1", category="food", total_inr=50_000)]}
    plan = build_plan(with_progress(diwali_request, **progress), TODAY)
    food = lines_by_key(plan)["food"].estimate_inr
    assert plan.quote_comparisons["food"][0].vs_estimate_inr == 50_000 - food


def test_contingency_keeps_its_floor(diwali_request):
    contingency = lines_by_key(build_plan(diwali_request, TODAY))["contingency"].amount_inr
    floor = diwali_request.budget_inr * 5 // 100
    spare = (contingency - floor) // 100 * 100
    build_plan(with_progress(diwali_request, moves=[move("contingency", "food", spare)]), TODAY)
    with pytest.raises(PlanInputError, match=r"Contingency can't go below 5% of the budget \(₹7,500\)"):
        build_plan(with_progress(diwali_request, moves=[move("contingency", "food", spare + 100)]), TODAY)


def test_a_line_cannot_go_below_zero(diwali_request):
    with pytest.raises(PlanInputError, match="Décor would drop below ₹0") as error:
        build_plan(with_progress(diwali_request, moves=[move("decor", "food", 20_000)]), TODAY)
    assert error.value.field == "progress"


@pytest.mark.parametrize("fields, message", [
    ({"from_key": "decor", "to_key": "decor", "amount_inr": 100}, "Pick two different categories"),
    ({"from_key": "decor", "to_key": "food", "amount_inr": 150}, "multiple of 100"),
])
def test_bad_moves_are_rejected(fields, message):
    with pytest.raises(ValidationError, match=message):
        Move(**fields)


def test_moves_touching_a_confirmed_or_missing_line_are_skipped(diwali_request, birthday_request):
    accepted = Quote(id="q1", category="food", total_inr=42_600, verified=True, accepted_on=TODAY)
    plan = build_plan(with_progress(diwali_request, quotes=[accepted], moves=[move("decor", "food", 5_000)]), TODAY)
    assert plan.ignored_moves == [0] and lines_by_key(plan)["decor"].moved_inr == 0

    at_home = build_plan(with_progress(birthday_request, moves=[move("venue", "food", 1_000)]), TODAY)
    assert at_home.ignored_moves == [0]
    assert at_home.budget_lines == build_plan(birthday_request, TODAY).budget_lines


# --- /api/compare --------------------------------------------------------------------


def compare(client, base, **changes):
    return client.post("/api/compare", json={"base": as_json(base), "changes": changes})


def test_moving_the_date_shows_what_changes(client, diwali_request):
    response = compare(client, diwali_request, event_date=str(TODAY + timedelta(days=78)))
    assert response.status_code == 200
    body = response.json()
    changes = body["changes"]

    assert changes["days_remaining"] == {"before": 18, "after": 78}
    assert changes["triage_active"] == {"before": True, "after": False}
    venue = next(t for t in changes["tasks"] if t["id"] == "venue")
    assert (venue["before"], venue["after"]) == ("book_today", "on_track")
    assert changes["lines"] == []  # the date doesn't move money
    assert changes["summary"][:2] == ["Days to go: 18 → 78.", "Nothing needs booking today any more."]
    assert body["inputs"]["event_date"] == str(TODAY + timedelta(days=78))
    assert body["plan"]["days_remaining"] == 78


def test_more_guests_reprice_a_per_plate_quote_and_keep_progress(client, wedding_request):
    wedding = wedding_request.model_copy(update={"venue_includes_catering": False})
    accepted = Quote(id="q1", category="food", per_plate_inr=1_500, verified=True, accepted_on=TODAY)
    base = with_progress(wedding, quotes=[accepted])
    changes = compare(client, base, guests=300).json()

    food = next(line for line in changes["changes"]["lines"] if line["key"] == "food")
    assert (food["before_inr"], food["after_inr"], food["delta_inr"]) == (375_000, 450_000, 75_000)
    assert changes["changes"]["per_guest_inr"] == {"before": 6_000, "after": 5_000}
    assert "Per guest: ₹6,000 → ₹5,000." in changes["changes"]["summary"]
    assert changes["inputs"]["progress"]["quotes"][0]["id"] == "q1"


def test_money_moves_through_compare(client, diwali_request):
    moves = [{"from_key": "decor", "to_key": "food", "amount_inr": 5_000}]
    lines = compare(client, diwali_request, moves=moves).json()["changes"]["lines"]
    assert {line["key"]: line["delta_inr"] for line in lines} == {"food": 5_000, "decor": -5_000}


def test_no_changes_says_so(client, diwali_request):
    changes = compare(client, diwali_request).json()["changes"]
    assert changes["summary"] == ["Nothing changes."] and changes["lines"] == changes["tasks"] == []


@pytest.mark.parametrize("changes, field, message", [
    ({"guests": 0}, "guests", "The number of guests must be at least 1."),
    ({"event_date": str(TODAY - timedelta(days=1))}, "event_date", "The event date is in the past."),
    ({"event_type": "birthday"}, "event_type", "This field isn't recognised."),
    ({"moves": [{"from_key": "decor", "to_key": "food", "amount_inr": 150}]},
     "moves", "The budget move must be in steps of ₹100."),
])
def test_bad_changes_give_clean_errors(client, diwali_request, changes, field, message):
    response = compare(client, diwali_request, **changes)
    assert response.status_code == 422
    assert {"field": field, "message": message} in response.json()["fields"]


def test_compare_shares_the_plan_rate_limit(client, diwali_request, monkeypatch):
    monkeypatch.setattr(plan_limiter, "limit", 2)
    statuses = [compare(client, diwali_request).status_code for _ in range(3)]
    assert statuses == [200, 200, 429]


def test_households_can_be_cleared(client, diwali_request):
    body = compare(client, diwali_request, households=None).json()
    assert body["inputs"]["households"] is None and body["plan"]["per_flat_inr"] is None
