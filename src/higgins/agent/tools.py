"""The tools the agent's model can call. The model only chooses a tool and its arguments; the
engine computes every number and every vendor message.

Each tool works on a Draft and returns a short text for the model. A problem the model can fix
(a bad argument, an amount the organiser never said) comes back as an "Error: ..." result instead
of an exception, so the model can try again within its step limit.

Plain functions and Pydantic models, no agent framework: the loop that calls them can change
without touching the tools.
"""

import json
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from higgins.agent.draft import Draft, DraftedMessage
from higgins.ai.understand import PlanPatch, apply_patch
from higgins.engine import rules
from higgins.engine.diff import diff_plans
from higgins.engine.errors import PlanInputError
from higgins.engine.messages import vendor_message
from higgins.engine.money import amounts_in, format_inr
from higgins.engine.planner import build_plan
from higgins.schemas.common import MessageKind, VenueType
from higgins.schemas.requests import Move, PlanRequest
from higgins.schemas.validation_messages import field_errors


class ToolError(Exception):
    """A problem the model can fix. Its text goes back to the model as the tool's result."""


class _Args(BaseModel):
    model_config = ConfigDict(extra="forbid")


class GetPlanArgs(_Args):
    pass


class ChangePlanArgs(_Args):
    """The same fields as the one-shot reading (ai/understand.py), so the same server checks apply."""

    event_date: date | None = Field(None, description="New date, YYYY-MM-DD. To move it, use event_date_change_days.")
    event_date_change_days: int | None = Field(None, ge=-1100, le=1100, description="Move the date: +7 is a week on.")
    guests: int | None = Field(None, description="The new total, only if the organiser states it.")
    guests_change: int | None = Field(None, ge=-5000, le=5000, description="Add (+) or remove (-) guests.")
    budget_inr: int | None = Field(None, description="The new total budget in rupees, only if stated.")
    budget_change_inr: int | None = Field(None, description="Add (+) or cut (-) this many rupees.")
    budget_change_percent: float | None = Field(None, ge=-90, le=500, description="Change the budget by a percentage.")
    city: str | None = Field(None, max_length=60)
    venue_type: VenueType | None = None
    venue_includes_catering: bool | None = None
    households: int | None = None
    priorities: list[str] | None = Field(None, max_length=3, description="Budget line keys that matter most.")


class MoveMoneyArgs(_Args):
    from_key: str = Field(description="Budget line key to take money from, e.g. decor.")
    to_key: str = Field(description="Budget line key to give it to, e.g. food.")
    amount_inr: int = Field(description="Whole rupees, exactly the amount the organiser said.")


class DraftMessageArgs(_Args):
    task_id: str = Field(description="Booking id from the plan's checklist, e.g. caterer.")
    kind: MessageKind = Field(description="enquiry (first contact), follow_up, or confirmation.")
    include_budget: bool = Field(False, description="Only if the organiser asks to share their budget.")


def get_plan(draft: Draft, _: GetPlanArgs) -> str:
    """The plan as it stands in the draft, compact. Free-text notes stay out: they're untrusted."""
    plan, request = draft.plan(), draft.current
    return json.dumps({
        "today": draft.today.isoformat(),
        "event": {
            "type": request.event_type, "date": request.event_date.isoformat(), "days_left": plan.days_remaining,
            "city": request.city, "guests": request.guests, "venue_type": request.venue_type,
        },
        "budget": {
            "total_inr": request.budget_inr, "per_guest_inr": plan.per_guest_inr,
            "status": plan.budget_status, "level": plan.budget_level,
        },
        "budget_lines": [{"key": line.key, "label": line.label, "amount_inr": line.amount_inr}
                         for line in plan.budget_lines],
        "bookings": [{"id": item.id, "label": item.label, "status": "done" if item.done else item.status,
                      "book_by": item.book_by.isoformat(), "can_message_vendor": item.id in rules.VENDOR_ASK}
                     for item in plan.checklist],
        "warnings": plan.warnings,
    }, ensure_ascii=False)


_NOT_SET = dict.fromkeys(name for name in PlanPatch.model_fields if name != "unclear")


def change_plan(draft: Draft, args: ChangePlanArgs) -> str:
    """Change the plan's inputs. The server works out relative changes and drops any value the
    organiser's message doesn't support, exactly as for a one-shot reading."""
    patch = PlanPatch.model_validate(_NOT_SET | {"unclear": []} | args.model_dump(exclude_none=True))
    interpretation = apply_patch(patch, draft.current, draft.message, draft.today)
    if not interpretation.values:
        raise ToolError(" ".join(interpretation.unclear) or "The organiser's message doesn't support those values.")
    proposed = _validated(draft, draft.current.model_dump() | interpretation.values)
    before = draft.plan()
    draft.current = proposed
    draft.notes += interpretation.unclear
    summary = diff_plans(before, draft.plan()).summary or ["No visible change to the plan."]
    return " ".join(summary + interpretation.unclear)


def move_money(draft: Draft, args: MoveMoneyArgs) -> str:
    """Move money between two budget lines. The amount must be one the organiser said."""
    if args.amount_inr not in {amount.rupees for amount in amounts_in(draft.message)}:
        raise ToolError(f"The organiser didn't say {format_inr(args.amount_inr)}. Use an amount from their message.")
    try:
        move = Move(from_key=args.from_key, to_key=args.to_key, amount_inr=args.amount_inr)
    except ValidationError as exc:
        raise ToolError(_messages(exc)) from exc
    lines = {line.key: line for line in draft.plan().budget_lines}
    if unknown := [key for key in (move.from_key, move.to_key) if key not in lines]:
        raise ToolError(f"Not a budget line in this plan: {', '.join(unknown)}. Lines: {', '.join(lines)}.")

    data = draft.current.model_dump()
    data["progress"]["moves"].append(move.model_dump())
    proposed = _validated(draft, data)
    if len(proposed.progress.moves) - 1 in build_plan(proposed, draft.today).ignored_moves:
        raise ToolError("One of those lines is fixed by an accepted quote, so money can't move in or out of it.")
    draft.current = proposed
    after = {line.key: line.amount_inr for line in draft.plan().budget_lines}
    return (
        f"Moved {format_inr(move.amount_inr)} from {lines[move.from_key].label} to {lines[move.to_key].label}. "
        f"{lines[move.from_key].label}: {format_inr(after[move.from_key])}; "
        f"{lines[move.to_key].label}: {format_inr(after[move.to_key])}."
    )


def draft_vendor_message(draft: Draft, args: DraftMessageArgs) -> str:
    """The engine writes the message from the plan's facts; the model never writes vendor text."""
    plan = draft.plan()
    try:
        text = vendor_message(draft.current, plan, args.task_id, args.kind, args.include_budget, draft.today)
    except PlanInputError as exc:
        raise ToolError(str(exc)) from exc
    draft.messages.append(DraftedMessage(task_id=args.task_id, kind=args.kind, text=text))
    label = next(item.label for item in plan.checklist if item.id == args.task_id)
    return f"Drafted the {args.kind.replace('_', ' ')} message for \"{label}\". The organiser will see it."


def _validated(draft: Draft, data: dict[str, Any]) -> PlanRequest:
    """A changed request, validated like a form and by the engine (dates, money below ₹0), or a ToolError."""
    try:
        proposed = PlanRequest.model_validate(data)
        build_plan(proposed, draft.today)
    except ValidationError as exc:
        raise ToolError(_messages(exc)) from exc
    except PlanInputError as exc:
        raise ToolError(str(exc)) from exc
    return proposed


def _messages(exc: ValidationError) -> str:
    return " ".join(error["message"] for error in field_errors(exc.errors()))


@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    args: type[_Args]
    run: Callable[[Draft, Any], str]


TOOLS: dict[str, Tool] = {tool.name: tool for tool in (
    Tool("get_plan", "Read the current plan: budget lines, bookings with their status, and warnings. "
         "Call this first when you need keys, ids or numbers.", GetPlanArgs, get_plan),
    Tool("change_plan", "Change the plan's inputs: date, guests, budget, city, venue or priorities. "
         "Use the *_change fields for relative changes; never work out totals yourself.", ChangePlanArgs, change_plan),
    Tool("move_money", "Move an amount the organiser stated from one budget line to another.",
         MoveMoneyArgs, move_money),
    Tool("draft_vendor_message", "Draft a message to the vendor for one booking. The text is written for you.",
         DraftMessageArgs, draft_vendor_message),
)}


def tool_specs() -> list[dict[str, Any]]:
    """The tools in Chat Completions' function format, which Groq and OpenAI both accept."""
    return [
        {"type": "function", "function": {
            "name": tool.name, "description": tool.description, "parameters": tool.args.model_json_schema(),
        }}
        for tool in TOOLS.values()
    ]


ToolOutcome = Literal["ok", "error", "invalid_arguments", "unknown_tool"]


def run_tool(draft: Draft, name: str, arguments: str | dict[str, Any]) -> tuple[str, ToolOutcome]:
    """Run one tool call from the model: the text to send back, and how it went (for logs and evals)."""
    tool = TOOLS.get(name)
    if tool is None:
        return f"Error: there is no tool called {name}. Tools: {', '.join(TOOLS)}.", "unknown_tool"
    try:
        if isinstance(arguments, str):
            args = tool.args.model_validate_json(arguments)
        else:
            args = tool.args.model_validate(arguments)
    except ValidationError as exc:
        details = "; ".join(f"{'.'.join(map(str, e['loc'])) or 'arguments'}: {e['msg']}" for e in exc.errors())
        return f"Error: invalid arguments for {name}: {details}", "invalid_arguments"
    try:
        return tool.run(draft, args), "ok"
    except ToolError as exc:
        return f"Error: {exc}", "error"
