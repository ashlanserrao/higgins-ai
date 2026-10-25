"""Ready-to-send vendor messages, filled from the plan's own facts. No AI: same plan, same text.

The budget is left out unless asked for: telling a vendor your maximum weakens the
organiser's position when they negotiate.
"""

from datetime import date

from app.engine import rules
from app.engine.errors import PlanInputError
from app.engine.money import format_inr
from app.engine.wording import day
from app.models import MessageKind, Plan, PlanRequest

_WHERE = {"venue": "", "home": " at home", "outdoor": " outdoors"}


def vendor_message(
    request: PlanRequest, plan: Plan, task_id: str, kind: MessageKind, include_budget: bool, today: date,
) -> str:
    item = next((i for i in plan.checklist if i.id == task_id), None)
    if item is None:
        raise PlanInputError("This booking isn't in your plan.", field="task_id")
    if task_id not in rules.VENDOR_ASK:
        raise PlanInputError("There's no vendor to message for this booking.", field="task_id")

    ask = rules.VENDOR_ASK[task_id]
    when = f"{request.event_date:%A}, {day(request.event_date)}"
    event = (
        f"a {rules.EVENT_LABELS[request.event_type]} in {request.city} on {when} "
        f"for about {request.guests} guests{_WHERE[request.venue_type]}"
    )
    if kind == "enquiry":
        questions = [f"Are you available on {when}?"] + [
            q.format(guests=request.guests) for q in rules.VENDOR_QUESTIONS[task_id]
        ]
        lines = [f"I'm planning {event}, and I'm looking for {ask}. Could you send me a quote?", ""]
        if include_budget and (budget := _line_budget(request, plan, task_id)) is not None:
            lines += [f"My budget for this is about {format_inr(budget)}.", ""]
        lines += ["Could you tell me:", *(f"- {q}" for q in questions), "",
                  "Please share a written quote with what's included and what isn't."]
    elif kind == "follow_up":
        deadline = f"by {day(item.book_by)}" if item.book_by >= today else "as soon as possible"
        lines = [
            f"I'm following up on my enquiry about {ask} for {event}.",
            f"I need to confirm this booking {deadline} to stay on schedule. "
            "Could you confirm your availability and send your quote?",
        ]
    else:  # confirmation
        lines = [
            f"Thank you for confirming {ask} for {event}. To finalise, could you confirm:",
            f"- Final headcount: {request.guests} guests",
            "- Arrival and setup time on the day",
            "- What's included, as per your quote",
            "- Payment terms: the advance paid, the balance and when it's due",
        ]
    return "\n".join(["Hello,", "", *lines, "", "Thank you!"])


def _line_budget(request: PlanRequest, plan: Plan, task_id: str) -> int | None:
    """The planned amount of the budget line this task books, if it has one."""
    line_tasks = rules.LINE_TASKS[request.event_type] | rules.EXTRA_LINE_TASKS
    keys = [key for key, task in line_tasks.items() if task == task_id]
    return next((line.amount_inr for line in plan.budget_lines if line.key in keys), None)
