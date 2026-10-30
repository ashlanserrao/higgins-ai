"""Golden scenarios and rule checks for the deterministic planning engine."""

from datetime import date, timedelta

import pytest
from pydantic import ValidationError

from app.engine import rules
from app.engine.errors import PlanInputError
from app.engine.money import amounts_in, format_inr
from app.engine.planner import build_plan
from app.models import PlanRequest
from tests.conftest import TODAY


def lines_by_key(plan):
    return {line.key: line for line in plan.budget_lines}


def test_golden_wedding_happy_path(wedding_request):
    plan = build_plan(wedding_request, TODAY)
    lines = lines_by_key(plan)

    assert plan.days_remaining == 417
    assert plan.per_guest_inr == 6000
    assert plan.budget_status == "ok" and plan.budget_level == "generous" and plan.warnings == []
    assert "venue" not in lines and "food" not in lines
    assert lines["venue_food"].percent == 55 and lines["venue_food"].boosted
    assert lines["photography"].percent == 15 and lines["photography"].boosted
    assert sum(line.amount_inr for line in plan.budget_lines) == 1_500_000

    checklist = {item.id: item for item in plan.checklist}
    assert "caterer" not in checklist  # booked with the venue
    assert checklist["venue"].book_by == date(2027, 12, 12) - timedelta(days=330)
    assert checklist["photographer"].book_by == date(2027, 12, 12) - timedelta(days=300)
    assert not plan.triage.active


def test_golden_tight_birthday(birthday_request):
    plan = build_plan(birthday_request, TODAY)
    lines = lines_by_key(plan)

    assert plan.city_tier == 2
    assert "venue" not in lines
    assert lines["decor"].percent == 30  # 15 base + 10 from venue + 5 priority
    # A 17% share is ₹2,040, rounded down to ₹2,000: the percent shown is of the rupees shown.
    assert (lines["entertainment"].amount_inr, lines["entertainment"].percent) == (2_000, 16.7)
    assert lines["contingency"].percent == round(lines["contingency"].amount_inr * 100 / 12_000, 1)
    assert plan.budget_status == "tight" and plan.budget_level == "tight"
    assert (plan.per_guest_inr, plan.floor_per_guest_inr) == (300, 400)
    assert "₹300 per guest is below the ₹400 minimum" in plan.warnings[0]
    assert plan.cost_saving_swaps
    assert not plan.triage.active
    assert sum(line.amount_inr for line in plan.budget_lines) == 12_000


def test_golden_diwali_triage(diwali_request):
    plan = build_plan(diwali_request, TODAY)

    assert plan.days_remaining == 18
    statuses = {item.id: item.status for item in plan.checklist}
    # Venue (45-day lead) has less than half its lead time left; 21-30-day leads are tight.
    assert plan.triage.active and plan.triage.book_today == ["venue"]
    assert {k for k, v in statuses.items() if v == "tight"} == {
        "permissions", "performers", "sound", "caterer",
    }
    assert statuses["security"] == statuses["tent"] == "on_track"
    assert plan.triage.cut_suggestions == []  # the venue is essential: booked, never cut
    assert plan.per_flat_inr == 1250
    assert "tent" in lines_by_key(plan)
    ids = {item.id for item in plan.checklist}
    assert "weather_backup" not in ids  # November is outside the monsoon
    assert plan.budget_status == "ok"  # ₹300/guest is above the ₹250 metro floor


def test_wedding_five_months_out_is_tight_not_triage():
    request = PlanRequest(
        event_type="wedding", event_date=TODAY + timedelta(days=150), guests=200,
        budget_inr=2_000_000, city="Pune",
    )
    plan = build_plan(request, TODAY)
    statuses = {item.id: item.status for item in plan.checklist}
    assert not plan.triage.active
    assert {k for k, v in statuses.items() if v == "tight"} == {"venue", "photographer", "caterer"}
    assert "3 bookings are inside the usual lead time" in plan.warnings[0]


def test_late_cut_suggestions_skip_essentials(diwali_request):
    nine_days = diwali_request.model_copy(update={"event_date": TODAY + timedelta(days=9)})
    plan = build_plan(nine_days, TODAY)
    assert {"venue", "permissions", "performers", "sound", "caterer"} <= set(plan.triage.book_today)
    assert set(plan.triage.cut_suggestions) == {
        rules.CUT_ALTERNATIVES["performers"], rules.CUT_ALTERNATIVES["sound"],
    }


def test_monsoon_outdoor_event_gets_weather_backup(diwali_request):
    july = diwali_request.model_copy(update={"event_date": date(2027, 7, 15)})
    ids = {item.id for item in build_plan(july, TODAY).checklist}
    assert {"tent", "weather_backup"} <= ids


@pytest.mark.parametrize("event_type", ["wedding", "birthday", "community"])
def test_three_priorities_keep_contingency_floor(event_type):
    priorities = [k for k in rules.BASE_SPLITS[event_type] if k != "contingency"][:3]
    request = PlanRequest(
        event_type=event_type, event_date=date(2027, 3, 1), guests=100, budget_inr=500_000,
        city="Pune", venue_type="outdoor", priorities=priorities,
    )
    contingency = lines_by_key(build_plan(request, TODAY))["contingency"]
    assert contingency.percent >= rules.MIN_CONTINGENCY_PERCENT


def test_event_tomorrow_puts_everything_in_triage(diwali_request):
    tomorrow = diwali_request.model_copy(update={"event_date": TODAY + timedelta(days=1)})
    plan = build_plan(tomorrow, TODAY)
    assert len(plan.triage.book_today) == len(plan.checklist)
    assert all(entry.date >= TODAY for entry in plan.timeline)


def test_past_date_is_rejected(diwali_request):
    past = diwali_request.model_copy(update={"event_date": TODAY - timedelta(days=1)})
    with pytest.raises(PlanInputError):
        build_plan(past, TODAY)


def test_unknown_priority_is_rejected():
    with pytest.raises(ValidationError):
        PlanRequest(
            event_type="birthday", event_date=date(2027, 1, 1), guests=10, budget_inr=10_000,
            city="Pune", priorities=["fireworks"],
        )


def test_unknown_city_defaults_to_tier_2_and_override_wins(birthday_request):
    assert build_plan(birthday_request, TODAY).city_tier == 2
    override = birthday_request.model_copy(update={"city_tier": 3})
    assert build_plan(override, TODAY).city_tier == 3


@pytest.mark.parametrize("amount, expected", [
    (999, "₹999"), (150_000, "₹1,50,000"), (1_500_000, "₹15,00,000"), (12_345_678, "₹1,23,45,678"),
])
def test_format_inr(amount, expected):
    assert format_inr(amount) == expected


def test_amounts_are_read_the_indian_way():
    text = "1.5L budget, ₹1,85,000 + 18% GST, 8k, 2 crore, 30 kids on the 5th"
    assert [(a.rupees, a.unit) for a in amounts_in(text)] == [
        (150_000, True), (185_000, False), (18, False), (8_000, True), (20_000_000, True), (30, False),
    ]
