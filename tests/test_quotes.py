"""Vendor quotes: comparison, confirmed costs, and re-budgeting when quotes are accepted."""

from datetime import date, timedelta

import pytest
from pydantic import ValidationError

from app.engine import rules
from app.engine.errors import PlanInputError
from app.engine.planner import build_plan
from app.models import PlanRequest, Progress, Quote
from tests.conftest import TODAY


@pytest.fixture
def wedding():
    """The golden wedding, but with a separate caterer so "food" is its own line."""
    return PlanRequest(
        event_type="wedding", event_date=date(2027, 12, 12), guests=250, budget_inr=1_500_000,
        city="Bengaluru", priorities=["food", "photography"],
    )


def quote(id="q1", category="food", **fields) -> Quote:
    return Quote(id=id, category=category, **fields)


def accepted(id="q1", category="food", **fields) -> Quote:
    return quote(id, category, verified=True, accepted_on=TODAY, **fields)


def with_quotes(request, *quotes):
    return request.model_copy(update={"progress": Progress(quotes=list(quotes))})


def lines_by_key(plan):
    return {line.key: line for line in plan.budget_lines}


def estimate(request, key):
    return lines_by_key(build_plan(request, TODAY))[key].amount_inr


def test_no_quotes_leaves_every_line_an_estimate(wedding):
    plan = build_plan(wedding, TODAY)
    assert plan.rebalance is None and plan.quote_comparisons == {}
    assert all(line.source == "estimate" and line.estimate_inr == line.amount_inr for line in plan.budget_lines)


def test_quotes_are_compared_cheapest_first(wedding):
    food = estimate(wedding, "food")
    plan = build_plan(with_quotes(
        wedding,
        quote("full", total_inr=400_000, guests_covered=300, inclusions=["Service staff"],
              taxes_included=False, valid_until=TODAY - timedelta(days=1)),
        quote("plate", per_plate_inr=1_500),
        quote("small", total_inr=300_000, guests_covered=200),
    ), TODAY)
    options = plan.quote_comparisons["food"]

    assert [o.quote_id for o in options] == ["small", "plate", "full"]
    small, plate, full = options
    assert (plate.total_inr, plate.calculated, plate.per_guest_inr) == (375_000, True, 1_500)
    assert (full.capacity, small.capacity, plate.capacity) == ("fits", "too_small", "not_stated")
    assert full.vs_estimate_inr == 400_000 - food
    assert full.expired and full.missing == []
    assert plate.missing == ["guests covered", "taxes", "inclusions", "valid until"]


def test_accepting_a_quote_confirms_its_line_and_books_the_task(wedding):
    plan = build_plan(with_quotes(wedding, accepted(per_plate_inr=1_500)), TODAY)
    lines = lines_by_key(plan)
    assert lines["food"].source == "confirmed" and lines["food"].quote_id == "q1"
    assert lines["food"].amount_inr == 375_000
    assert all(line.source == "estimate" for key, line in lines.items() if key != "food")
    caterer = next(item for item in plan.checklist if item.id == "caterer")
    assert caterer.done and caterer.booked_on == TODAY


def test_saving_goes_to_contingency(wedding):
    food = estimate(wedding, "food")
    before = lines_by_key(build_plan(wedding, TODAY))
    plan = build_plan(with_quotes(wedding, accepted(total_inr=food - 20_000)), TODAY)
    lines = lines_by_key(plan)
    assert lines["contingency"].amount_inr == before["contingency"].amount_inr + 20_000
    assert all(lines[k].amount_inr == before[k].amount_inr for k in before if k not in ("food", "contingency"))
    assert "₹20,000 under the estimates" in plan.rebalance.explanation
    assert sum(line.amount_inr for line in plan.budget_lines) == wedding.budget_inr


def test_small_overrun_comes_out_of_contingency_only(wedding):
    food = estimate(wedding, "food")
    before = lines_by_key(build_plan(wedding, TODAY))
    plan = build_plan(with_quotes(wedding, accepted(total_inr=food + 50_000)), TODAY)
    lines = lines_by_key(plan)

    assert plan.rebalance.from_contingency_inr == 50_000 and plan.rebalance.cuts == []
    assert lines["contingency"].amount_inr == before["contingency"].amount_inr - 50_000
    assert all(lines[k].amount_inr == before[k].amount_inr for k in before if k not in ("food", "contingency"))
    assert "Contingency covers it" in plan.rebalance.explanation
    assert plan.rebalance.explanation not in plan.warnings  # nothing else had to give
    assert plan.budget_status == "ok"


def test_large_overrun_uses_contingency_then_cuts_other_lines_in_proportion(wedding):
    before = lines_by_key(build_plan(wedding, TODAY))
    contingency = before["contingency"].amount_inr
    overrun = contingency + 100_000
    plan = build_plan(with_quotes(wedding, accepted(total_inr=before["food"].amount_inr + overrun)), TODAY)
    lines, rebalance = lines_by_key(plan), plan.rebalance

    assert rebalance.from_contingency_inr == contingency and rebalance.over_budget_inr == 0
    cut = sum(c.amount_inr for c in rebalance.cuts)
    assert 100_000 <= cut < 100_100  # whole ₹100s; the overshoot goes back to contingency
    assert lines["contingency"].amount_inr == cut - 100_000
    donors = {k: line.amount_inr for k, line in before.items() if k not in ("food", "contingency")}
    for c in rebalance.cuts:
        exact_share = 100_000 * donors[c.key] / sum(donors.values())
        assert c.amount_inr % 100 == 0 and abs(c.amount_inr - exact_share) < 100
        assert lines[c.key].change_inr == -c.amount_inr
    assert sum(line.amount_inr for line in plan.budget_lines) == wedding.budget_inr
    assert "Contingency covered" in rebalance.explanation and "Décor -₹" in rebalance.explanation
    assert rebalance.explanation in plan.warnings


def test_quotes_beyond_the_budget_are_reported_as_over_budget(wedding):
    before = lines_by_key(build_plan(wedding, TODAY))
    plan = build_plan(with_quotes(wedding, accepted(total_inr=3_000_000)), TODAY)
    lines, rebalance = lines_by_key(plan), plan.rebalance

    assert lines["contingency"].amount_inr == 0
    for c in rebalance.cuts:  # every other line gives up its maximum, never more
        assert c.amount_inr == int(before[c.key].amount_inr * rules.MAX_REBALANCE_CUT) // 100 * 100
    assert rebalance.over_budget_inr > 0
    assert sum(line.amount_inr for line in plan.budget_lines) == wedding.budget_inr + rebalance.over_budget_inr
    assert plan.budget_status == "tight" and plan.cost_saving_swaps
    assert "raise the budget to ₹34,50,000" in rebalance.explanation


def test_too_small_accepted_quote_is_flagged(wedding):
    plan = build_plan(with_quotes(wedding, accepted(total_inr=300_000, guests_covered=200)), TODAY)
    assert "The accepted catering quote covers 200 guests, but you're planning for 250." in plan.warnings


def test_merged_venue_and_catering_quote_books_the_venue(wedding_request):
    plan = build_plan(with_quotes(wedding_request, accepted(category="venue_food", total_inr=800_000)), TODAY)
    assert lines_by_key(plan)["venue_food"].source == "confirmed"
    assert next(item for item in plan.checklist if item.id == "venue").done


def test_quotes_for_lines_not_in_the_plan_are_ignored(birthday_request):
    plan = build_plan(with_quotes(birthday_request, accepted(category="venue", total_inr=5_000)), TODAY)
    assert plan.ignored_quotes == ["q1"] and plan.rebalance is None
    assert plan.budget_lines == build_plan(birthday_request, TODAY).budget_lines


@pytest.mark.parametrize("fields, message", [
    ({"total_inr": 1}, "Check a quote's details before accepting it."),
    ({"verified": True}, "A quote needs a price before it can be accepted."),
])
def test_unchecked_or_unpriced_quotes_cannot_be_accepted(fields, message):
    with pytest.raises(ValidationError, match=message):
        quote(accepted_on=TODAY, **fields)


@pytest.mark.parametrize("quotes, message", [
    ([accepted("a", total_inr=1), accepted("b", total_inr=2)], "Only one quote per category can be accepted."),
    ([quote("a"), quote("a")], "Each quote needs its own id."),
])
def test_progress_rejects_conflicting_quotes(quotes, message):
    with pytest.raises(ValidationError, match=message):
        Progress(quotes=quotes)


def test_future_acceptance_is_rejected(wedding):
    future = quote(total_inr=1, verified=True, accepted_on=TODAY + timedelta(days=1))
    with pytest.raises(PlanInputError, match="catering quote can't be accepted on a future date") as error:
        build_plan(with_quotes(wedding, future), TODAY)
    assert error.value.field == "progress"


def test_every_line_task_exists_for_its_event():
    for event_type, mapping in rules.LINE_TASKS.items():
        assert set(mapping) <= set(rules.BASE_SPLITS[event_type])
        assert set(mapping.values()) <= set(rules.LEAD_TIMES[event_type])
