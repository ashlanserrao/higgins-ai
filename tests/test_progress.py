"""Booked and delayed tasks, dependencies, and how delays ripple through the plan."""

from datetime import date, timedelta

import pytest

from app.ai.prompt import build_prompt_input
from app.engine import rules
from app.engine.errors import PlanInputError
from app.engine.planner import build_plan
from app.models import Progress, TaskUpdate
from tests.conftest import TODAY


def with_tasks(request, **tasks):
    """Copy a request with progress, e.g. venue=("delayed", date(...))."""
    progress = Progress(tasks={k: TaskUpdate(state=state, on=on) for k, (state, on) in tasks.items()})
    return request.model_copy(update={"progress": progress})


def items_by_id(plan):
    return {item.id: item for item in plan.checklist}


def test_bookings_wait_on_their_prerequisites(diwali_request, wedding_request):
    diwali = items_by_id(build_plan(diwali_request, TODAY))
    for task_id in ("permissions", "sound", "caterer", "tent"):
        assert diwali[task_id].waiting_on == ["venue"]
    assert diwali["security"].waiting_on == ["permissions"]
    assert diwali["performers"].waiting_on == []

    wedding = items_by_id(build_plan(wedding_request, TODAY))
    assert "caterer" not in wedding  # in-house catering: no caterer task, no dependency on it
    assert wedding["decor"].waiting_on == ["venue"]
    assert wedding["photographer"].waiting_on == []


def test_booking_the_venue_unblocks_and_shows_as_done(wedding_request):
    plan = build_plan(with_tasks(wedding_request, venue=("booked", date(2026, 10, 20))), TODAY)
    items = items_by_id(plan)
    assert items["venue"].done and items["venue"].booked_on == date(2026, 10, 20)
    assert items["decor"].waiting_on == []
    venue_entry = next(e for e in plan.timeline if e.label == items["venue"].label)
    assert (venue_entry.date, venue_entry.status) == (date(2026, 10, 20), "done")


def test_venue_at_home_has_no_dependencies(birthday_request):
    items = build_plan(birthday_request, TODAY).checklist
    assert all(item.waiting_on == [] for item in items)


def test_booked_tasks_leave_triage(diwali_request):
    nine_days = diwali_request.model_copy(update={"event_date": TODAY + timedelta(days=9)})
    before = build_plan(nine_days, TODAY)
    assert {"venue", "permissions"} <= set(before.triage.book_today)

    booked = with_tasks(nine_days, venue=("booked", TODAY), permissions=("booked", TODAY))
    after = build_plan(booked, TODAY)
    assert set(after.triage.book_today) == set(before.triage.book_today) - {"venue", "permissions"}
    assert f"for {len(after.triage.book_today)} bookings" in after.warnings[0]


def test_late_venue_delay_ripples_to_dependent_bookings(diwali_request):
    plan = build_plan(with_tasks(diwali_request, venue=("delayed", date(2026, 10, 30))), TODAY)
    items = items_by_id(plan)

    assert items["venue"].expected_on == date(2026, 10, 30) and items["venue"].at_risk
    # security waits on permissions, which waits on the venue: the delay carries through.
    for task_id in ("permissions", "sound", "caterer", "tent", "security"):
        assert items[task_id].expected_on == date(2026, 10, 30), task_id
        assert items[task_id].at_risk and items[task_id].delayed_by == "venue", task_id
    assert not items["performers"].at_risk and items["performers"].expected_on is None

    # Nothing waiting on the delay can be booked today; only performers are still open.
    assert plan.triage.book_today == [] and not plan.triage.active
    assert plan.warnings[0].startswith("1 booking is inside the usual lead time")
    warning = plan.warnings[1]
    assert warning.startswith("The venue is delayed to 30 Oct 2026, past its book-by date.")
    assert "5 bookings that wait on it are now late too" in warning
    venue_entry = next(e for e in plan.timeline if e.label == items["venue"].label)
    assert (venue_entry.date, venue_entry.status) == (date(2026, 10, 30), "at_risk")


def test_delay_within_lead_time_is_not_a_risk(wedding_request):
    plan = build_plan(with_tasks(wedding_request, venue=("delayed", date(2026, 12, 1))), TODAY)
    items = items_by_id(plan)
    assert items["venue"].expected_on == date(2026, 12, 1) and not items["venue"].at_risk
    # The decorator books in August 2027 anyway, so a December venue doesn't move it.
    assert items["decor"].expected_on is None and not items["decor"].at_risk
    assert plan.warnings == []


@pytest.mark.parametrize("venue_on, backup_at_risk", [
    (date(2027, 7, 1), False),  # before the weather backup's book-by date (3 Jul)
    (date(2027, 7, 5), True),
])
def test_delay_carries_through_two_steps(diwali_request, venue_on, backup_at_risk):
    july = diwali_request.model_copy(update={"event_date": date(2027, 7, 10)})
    items = items_by_id(build_plan(with_tasks(july, venue=("delayed", venue_on)), TODAY))
    assert items["tent"].at_risk  # book-by 26 Jun
    assert items["weather_backup"].waiting_on == ["tent"]
    assert items["weather_backup"].at_risk is backup_at_risk
    assert items["weather_backup"].delayed_by == ("venue" if backup_at_risk else None)


def test_passed_delay_date_means_book_today(diwali_request):
    plan = build_plan(with_tasks(diwali_request, venue=("delayed", date(2026, 10, 15))), TODAY)
    items = items_by_id(plan)
    assert items["venue"].expected_on == TODAY and items["venue"].at_risk
    assert plan.triage.book_today == ["venue"]
    assert items["caterer"].expected_on is None  # it can follow today, still within its timing
    assert any(w.startswith("The venue was expected by 15 Oct 2026 and still isn't booked") for w in plan.warnings)


@pytest.mark.parametrize("task, message", [
    (("booked", TODAY + timedelta(days=1)), "Venue can't be marked booked on a future date."),
    (("delayed", date(2026, 11, 9)), "Venue is delayed past the event date."),
])
def test_impossible_progress_is_rejected(diwali_request, task, message):
    with pytest.raises(PlanInputError, match=message) as error:
        build_plan(with_tasks(diwali_request, venue=task), TODAY)
    assert error.value.field == "progress"


def test_progress_for_tasks_not_in_the_plan_is_ignored(birthday_request):
    plan = build_plan(with_tasks(birthday_request, venue=("booked", TODAY)), TODAY)
    assert plan.ignored_progress == ["venue"]
    assert plan.checklist == build_plan(birthday_request, TODAY).checklist


@pytest.mark.parametrize("event_type", list(rules.DEPENDS_ON))
def test_dependency_table_matches_tasks_and_has_no_cycles(event_type):
    table = rules.DEPENDS_ON[event_type] | rules.OUTDOOR_DEPENDS_ON
    known = set(rules.LEAD_TIMES[event_type]) | set(rules.OUTDOOR_DEPENDS_ON)
    assert {t for t in rules.DEPENDS_ON[event_type]} <= known
    assert {p for pres in table.values() for p in pres} <= known

    def reaches(start, target, seen=()):
        return any(p == target or (p not in seen and reaches(p, target, (*seen, p))) for p in table.get(start, ()))

    assert not any(reaches(task, task) for task in table)


def test_every_task_has_a_short_name():
    assert set(rules.VENDOR_NAMES) == set(rules.VENDOR_LABELS)


def test_ai_is_only_told_about_tasks_still_to_book(diwali_request):
    nine_days = diwali_request.model_copy(update={"event_date": TODAY + timedelta(days=9)})
    booked = with_tasks(nine_days, venue=("booked", TODAY))
    prompt_input = build_prompt_input(booked, build_plan(booked, TODAY))
    assert rules.VENDOR_LABELS["venue"] not in prompt_input
    assert rules.VENDOR_LABELS["permissions"] in prompt_input
