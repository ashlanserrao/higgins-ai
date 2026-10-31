"""Booked and delayed tasks, and how a delay ripples to the bookings that depend on it."""

from datetime import date
from typing import Any

from app.engine import rules
from app.engine.errors import PlanInputError
from app.engine.wording import bookings, capitalise, day, join_names
from app.models import ChecklistItem, PlanRequest, TaskUpdate


def dependencies(request: PlanRequest, task_ids: set[str]) -> dict[str, list[str]]:
    """Prerequisites per task, limited to tasks that are in this plan."""
    table = dict(rules.DEPENDS_ON[request.event_type])
    if request.venue_type == "outdoor":
        table |= rules.OUTDOOR_DEPENDS_ON
    return {
        task_id: [p for p in table.get(task_id, ()) if p in task_ids]
        for task_id in task_ids
    }


def apply_progress(
    request: PlanRequest, items: list[ChecklistItem], today: date,
    quote_bookings: dict[str, date] | None = None,
) -> tuple[list[ChecklistItem], list[str]]:
    """Mark booked tasks done and push delayed ones (and everything after them) later.

    `quote_bookings` are tasks booked by accepting a quote; a date the organiser entered wins.
    Returns the updated items and the ids of progress entries that aren't in this plan.
    """
    by_id = {item.id: item for item in items}
    tasks = request.progress.tasks
    ignored = sorted(task_id for task_id in tasks if task_id not in by_id)
    _validate(request, {k: v for k, v in tasks.items() if k in by_id}, today)

    booked = (quote_bookings or {}) | {k: u.on for k, u in tasks.items() if u.state == "booked"}
    for task_id, on in booked.items():
        if task_id in by_id:
            by_id[task_id] = by_id[task_id].model_copy(update={"done": True, "booked_on": on})

    prerequisites = dependencies(request, set(by_id))
    resolved: dict[str, ChecklistItem] = {}

    def resolve(task_id: str) -> ChecklistItem:
        if task_id in resolved:
            return resolved[task_id]
        item = by_id[task_id]
        pres = [resolve(p) for p in prerequisites[task_id]]
        changes: dict[str, Any] = {"waiting_on": [p.id for p in pres if not p.done]}
        if not item.done:
            update = tasks.get(task_id)
            candidates: list[tuple[date, str | None]] = []
            if update and update.state == "delayed":
                # A delay date that has passed means "still not booked": it's due today.
                candidates.append((max(update.on, today), task_id))
            candidates += [(p.expected_on, p.delayed_by) for p in pres if not p.done and p.expected_on]
            if candidates:
                # On a tie, the task's own delay (listed first) is the cause.
                expected, cause = max(candidates, key=lambda candidate: candidate[0])
                # A prerequisite's delay only matters if it is later than this task's own timing.
                if cause == task_id or expected > max(item.book_by, today):
                    changes |= {
                        "expected_on": expected, "delayed_by": cause, "at_risk": expected > item.book_by,
                    }
        resolved[task_id] = item.model_copy(update=changes)
        return resolved[task_id]

    return [resolve(item.id) for item in items], ignored


def _validate(request: PlanRequest, tasks: dict[str, TaskUpdate], today: date) -> None:
    for task_id, update in tasks.items():
        name = capitalise(rules.VENDOR_NAMES[task_id])
        if update.state == "booked" and update.on > today:
            raise PlanInputError(f"{name} can't be marked booked on a future date.", field="progress")
        if update.state == "delayed" and update.on > request.event_date:
            raise PlanInputError(
                f"{name} is delayed past the event date. Look for another option or move the date.",
                field="progress",
            )


def is_actionable(item: ChecklistItem, today: date) -> bool:
    """Not booked yet, and not waiting on a delay: it can be booked now."""
    return not item.done and (item.expected_on is None or item.expected_on <= today)


def delay_warnings(request: PlanRequest, items: list[ChecklistItem], today: date) -> list[str]:
    """One warning per delayed task that makes itself or the bookings after it late."""
    warnings = []
    for root in items:
        if root.delayed_by != root.id:
            continue
        late = [i for i in items if i.at_risk and i.delayed_by == root.id and i.id != root.id]
        if not root.at_risk and not late:
            continue
        name = rules.VENDOR_NAMES[root.id]
        planned = request.progress.tasks[root.id].on
        if planned < today:
            text = f"The {name} was expected by {day(planned)} and still isn't booked"
        else:
            text = f"The {name} is delayed to {day(planned)}"
        if root.at_risk:
            text += ", past its book-by date"
        if late:
            names = join_names([rules.VENDOR_NAMES[i.id] for i in late])
            text += (
                f". {bookings(len(late))} that wait{'s' if len(late) == 1 else ''} on it "
                f"{'is' if len(late) == 1 else 'are'} now late too: {names}"
            )
        warnings.append(f"{text}. Ask the vendor to confirm sooner, or line up a backup.")
    return warnings
