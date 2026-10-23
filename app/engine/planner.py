"""Deterministic planning engine: same inputs and `today` always give the same plan."""

from datetime import date, timedelta

from app.engine import rules
from app.engine.errors import PlanInputError
from app.engine.money import format_inr
from app.engine.progress import apply_progress, delay_warnings, is_actionable
from app.engine.wording import bookings, them
from app.models import BudgetLine, ChecklistItem, Plan, PlanRequest, TimelineEntry, Triage


def build_plan(request: PlanRequest, today: date) -> Plan:
    days_remaining = (request.event_date - today).days
    if days_remaining < 0:
        raise PlanInputError("The event date is in the past.")
    if days_remaining > rules.MAX_DAYS_AHEAD:
        raise PlanInputError("The event date is more than 3 years away.")

    tier = city_tier(request.city, request.city_tier)
    per_guest = request.budget_inr // request.guests
    floor = round(rules.MIN_PER_GUEST_METRO[request.event_type] * rules.TIER_MULTIPLIER[tier])
    tight = per_guest < floor

    budget_lines = split_budget(request)
    checklist, ignored_progress = apply_progress(request, build_checklist(request, today), today)
    # Booked tasks, and tasks waiting on a delay, can't be booked today.
    open_items = [item for item in checklist if is_actionable(item, today)]
    book_today = [item.id for item in open_items if item.status == "book_today"]
    tight_count = sum(item.status == "tight" for item in open_items)
    triage = Triage(
        active=bool(book_today),
        book_today=book_today,
        cut_suggestions=[
            rules.CUT_ALTERNATIVES[item_id]
            for item_id in book_today
            if item_id not in rules.ESSENTIAL_ITEMS and item_id in rules.CUT_ALTERNATIVES
        ],
    )

    warnings = []
    if tight:
        warnings.append(
            f"{format_inr(per_guest)} per guest is below the {format_inr(floor)} minimum we "
            f"suggest for a {rules.EVENT_LABELS[request.event_type]} in a "
            f"{rules.TIER_LABELS[tier]}. Try the cost-saving swaps, a shorter guest list "
            f"or a bigger budget."
        )
    if triage.active:
        warnings.append(
            f"Your event is {days_remaining} days away. Less than half the usual lead time is "
            f"left for {bookings(len(book_today))}: book {them(len(book_today))} today."
        )
    if tight_count:
        warnings.append(
            f"{bookings(tight_count)} {'is' if tight_count == 1 else 'are'} inside the usual "
            f"lead time but still doable: book {them(tight_count)} this week."
        )
    warnings += delay_warnings(request, checklist, today)

    return Plan(
        event_type=request.event_type,
        event_date=request.event_date,
        today=today,
        days_remaining=days_remaining,
        city_tier=tier,
        per_guest_inr=per_guest,
        floor_per_guest_inr=floor,
        budget_status="tight" if tight else "ok",
        budget_level=budget_level(per_guest, floor),
        budget_lines=budget_lines,
        warnings=warnings,
        cost_saving_swaps=rules.COST_SAVING_SWAPS[request.event_type] if tight else [],
        triage=triage,
        timeline=build_timeline(request, checklist, today),
        checklist=checklist,
        per_flat_inr=(
            request.budget_inr // request.households
            if request.event_type == "community" and request.households
            else None
        ),
        ignored_progress=ignored_progress,
    )


def city_tier(city: str, override: int | None = None) -> int:
    if override:
        return override
    name = " ".join(city.lower().split())
    return 1 if name in rules.METRO_CITIES else rules.DEFAULT_TIER


def budget_level(per_guest: int, floor: int) -> str:
    ratio = per_guest / floor
    for threshold, level in rules.BUDGET_LEVEL_THRESHOLDS:
        if ratio < threshold:
            return level
    return "generous"


def split_budget(request: PlanRequest) -> list[BudgetLine]:
    """Apply venue, catering, outdoor and priority modifiers, then convert to rupees."""
    splits: dict[str, float] = dict(rules.BASE_SPLITS[request.event_type])
    labels = dict(rules.CATEGORY_LABELS[request.event_type])

    if request.venue_type == "home":
        share = splits.pop("venue") / len(rules.HOME_REDISTRIBUTE_TO)
        for key in rules.HOME_REDISTRIBUTE_TO:
            splits[key] += share
    elif request.venue_includes_catering:
        merged = splits.pop("venue") + splits.pop("food")
        splits = {rules.MERGED_VENUE_FOOD_KEY: merged, **splits}
        labels[rules.MERGED_VENUE_FOOD_KEY] = rules.MERGED_VENUE_FOOD_LABEL

    if request.venue_type == "outdoor":
        _take_proportionally(splits, rules.TENT_PERCENT, protected={"contingency"})
        splits[rules.TENT_KEY] = rules.TENT_PERCENT
        labels[rules.TENT_KEY] = rules.TENT_LABEL

    boosted = {_priority_key(p, splits) for p in request.priorities} - {None}
    if boosted:
        _take_proportionally(
            splits, rules.PRIORITY_BOOST * len(boosted), protected=boosted | {"contingency"}
        )
        for key in boosted:
            splits[key] += rules.PRIORITY_BOOST

    # Contingency is never a donor, so it never drops below MIN_CONTINGENCY_PERCENT.
    # Round each line down to ₹100; the leftover goes to contingency so lines sum exactly.
    lines = []
    allocated = 0
    for key, percent in splits.items():
        if key == "contingency":
            continue
        amount = int(request.budget_inr * percent / 100) // rules.ROUNDING_INR * rules.ROUNDING_INR
        allocated += amount
        lines.append(BudgetLine(
            key=key, label=labels[key], percent=round(percent, 1),
            amount_inr=amount, boosted=key in boosted,
        ))
    lines.append(BudgetLine(
        key="contingency", label=labels["contingency"],
        percent=round(splits["contingency"], 1), amount_inr=request.budget_inr - allocated,
    ))
    return lines


def _priority_key(priority: str, splits: dict[str, float]) -> str | None:
    """Map a priority to the budget line it boosts (food/venue may be merged or dropped)."""
    if priority in splits:
        return priority
    if priority in ("venue", "food") and rules.MERGED_VENUE_FOOD_KEY in splits:
        return rules.MERGED_VENUE_FOOD_KEY
    return None


def _take_proportionally(splits: dict[str, float], points: float, protected: set[str]) -> None:
    donors = {k: v for k, v in splits.items() if k not in protected}
    pool = sum(donors.values())
    for key, value in donors.items():
        splits[key] = value - points * value / pool


def booking_status(days_remaining: int, lead_days: int) -> str:
    if days_remaining >= lead_days:
        return "on_track"
    if days_remaining >= lead_days * rules.TIGHT_LEAD_FRACTION:
        return "tight"
    return "book_today"


def build_checklist(request: PlanRequest, today: date) -> list[ChecklistItem]:
    days_remaining = (request.event_date - today).days
    lead_times = dict(rules.LEAD_TIMES[request.event_type])
    if request.venue_type == "home":
        lead_times.pop("venue", None)
    elif request.venue_includes_catering:
        lead_times.pop("caterer", None)
    if request.event_type == "wedding" and request.event_date.month in rules.PEAK_MONTHS:
        for key in rules.PEAK_ITEMS:
            lead_times[key] += rules.PEAK_EXTRA_DAYS
    if request.venue_type == "outdoor":
        lead_times["tent"] = rules.TENT_LEAD_DAYS
        if request.event_date.month in rules.MONSOON_MONTHS:
            lead_times["weather_backup"] = rules.WEATHER_BACKUP_LEAD_DAYS

    items = []
    for item_id, lead in lead_times.items():
        book_by = request.event_date - timedelta(days=lead)
        label = rules.VENDOR_LABELS[item_id]
        if item_id == "venue" and request.venue_includes_catering:
            label = "Book the venue (with in-house catering)"
        items.append(ChecklistItem(
            id=item_id, label=label, lead_days=lead, book_by=book_by,
            status=booking_status(days_remaining, lead), essential=item_id in rules.ESSENTIAL_ITEMS,
        ))
    return sorted(items, key=lambda item: (item.book_by, item.id))


def build_timeline(
    request: PlanRequest, checklist: list[ChecklistItem], today: date
) -> list[TimelineEntry]:
    """Bookings and milestones worked backward from the event date; late ones move to today.

    Booked tasks sit on the day they were booked, delayed ones on their new date.
    """
    entries = [_booking_entry(item, today) for item in checklist]
    for days_before, label in rules.MILESTONES[request.event_type]:
        due = request.event_date - timedelta(days=days_before)
        entries.append(TimelineEntry(
            date=max(due, today), label=label, kind="milestone",
            status="overdue" if due < today else "on_track",
        ))
    entries.append(TimelineEntry(
        date=request.event_date, label=f"Your {rules.EVENT_LABELS[request.event_type]}",
        kind="event",
    ))
    kind_order = {"booking": 0, "milestone": 1, "event": 2}
    return sorted(entries, key=lambda e: (e.date, kind_order[e.kind], e.label))


_BOOKING_TIMELINE_STATUS = {"on_track": "on_track", "tight": "tight", "book_today": "overdue"}


def _booking_entry(item: ChecklistItem, today: date) -> TimelineEntry:
    if item.done:
        when, status = item.booked_on, "done"
    elif item.expected_on:
        when = item.expected_on
        status = "at_risk" if item.at_risk else _BOOKING_TIMELINE_STATUS[item.status]
    else:
        when, status = max(item.book_by, today), _BOOKING_TIMELINE_STATUS[item.status]
    return TimelineEntry(date=when, label=item.label, kind="booking", status=status)
