"""Before/after comparison of two plans, for what-ifs, money moves and typed revisions."""

from app.engine.money import format_inr
from app.models import ChecklistItem, LineChange, Pair, Plan, PlanDiff, TaskChange


def task_state(item: ChecklistItem) -> str:
    if item.done:
        return "done"
    if item.at_risk:
        return "at_risk"
    return item.status


def diff_plans(before: Plan, after: Plan) -> PlanDiff:
    old_lines = {line.key: line for line in before.budget_lines}
    new_lines = {line.key: line for line in after.budget_lines}
    lines = []
    for key in [*new_lines, *(k for k in old_lines if k not in new_lines)]:
        old, new = old_lines.get(key), new_lines.get(key)
        old_amount = old.amount_inr if old else None
        new_amount = new.amount_inr if new else None
        if old_amount != new_amount:
            lines.append(LineChange(
                key=key, label=(new or old).label, before_inr=old_amount, after_inr=new_amount,
                delta_inr=(new_amount or 0) - (old_amount or 0),
            ))

    old_tasks = {item.id: item for item in before.checklist}
    new_tasks = {item.id: item for item in after.checklist}
    tasks = []
    for task_id in [*new_tasks, *(t for t in old_tasks if t not in new_tasks)]:
        old, new = old_tasks.get(task_id), new_tasks.get(task_id)
        old_state = task_state(old) if old else None
        new_state = task_state(new) if new else None
        if old_state != new_state:
            tasks.append(TaskChange(id=task_id, label=(new or old).label, before=old_state, after=new_state))

    over = Pair[int](
        before=before.rebalance.over_budget_inr if before.rebalance else 0,
        after=after.rebalance.over_budget_inr if after.rebalance else 0,
    )
    diff = PlanDiff(
        days_remaining=Pair[int](before=before.days_remaining, after=after.days_remaining),
        per_guest_inr=Pair[int](before=before.per_guest_inr, after=after.per_guest_inr),
        budget_status=Pair(before=before.budget_status, after=after.budget_status),
        budget_level=Pair(before=before.budget_level, after=after.budget_level),
        triage_active=Pair[bool](before=before.triage.active, after=after.triage.active),
        over_budget_inr=over,
        lines=lines,
        tasks=tasks,
        warnings_added=[w for w in after.warnings if w not in before.warnings],
        warnings_removed=[w for w in before.warnings if w not in after.warnings],
        summary=[],
    )
    diff.summary = _summary(diff)
    return diff


def _summary(diff: PlanDiff) -> list[str]:
    summary = []
    days = diff.days_remaining
    if days.before != days.after:
        summary.append(f"Days to go: {days.before} → {days.after}.")
    per_guest = diff.per_guest_inr
    if per_guest.before != per_guest.after:
        summary.append(f"Per guest: {format_inr(per_guest.before)} → {format_inr(per_guest.after)}.")
    level = diff.budget_level
    if level.before != level.after:
        summary.append(f"Budget level: {level.before} → {level.after}.")
    triage = diff.triage_active
    if triage.before != triage.after:
        summary.append("Some bookings now need booking today." if triage.after else "Nothing needs booking today any more.")
    over = diff.over_budget_inr
    if over.before != over.after:
        summary.append(f"Over budget: {format_inr(over.before)} → {format_inr(over.after)}." if over.after
                       else "No longer over budget.")
    if diff.lines:
        summary.append(_count(len(diff.lines), "budget line changes", "budget lines change"))
    if diff.tasks:
        summary.append(_count(len(diff.tasks), "booking changes status", "bookings change status"))
    return summary or ["Nothing changes."]


def _count(count: int, one: str, many: str) -> str:
    return f"1 {one}." if count == 1 else f"{count} {many}."
