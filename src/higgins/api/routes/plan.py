"""Rules-only routes: they return in milliseconds and never call AI."""

from datetime import date
from typing import Any

from fastapi import APIRouter, Depends
from fastapi.exceptions import RequestValidationError
from pydantic import ValidationError

from higgins.ai.ideas import IdeasGenerator
from higgins.api.dependencies import get_ideas_generator, today_in_india
from higgins.engine import rules
from higgins.engine.diff import diff_plans
from higgins.engine.messages import vendor_message
from higgins.engine.planner import build_plan
from higgins.schemas.requests import CompareRequest, MessageRequest, PlanRequest
from higgins.schemas.responses import CompareResponse, MessageResponse, PlanResponse

router = APIRouter()


@router.get("/api/options")
def options() -> dict[str, Any]:
    """Priority choices per event type, so the form never duplicates the rules tables."""
    return {
        event_type: [
            {"key": key, "label": label}
            for key, label in labels.items()
            if key != "contingency"
        ]
        for event_type, labels in rules.CATEGORY_LABELS.items()
    }


@router.post("/api/plan", response_model=PlanResponse)
def create_plan(
    request: PlanRequest,
    today: date = Depends(today_in_india),
    generator: IdeasGenerator = Depends(get_ideas_generator),
) -> PlanResponse:
    """Rules-only plan: returns in milliseconds so the page can show it immediately."""
    return PlanResponse(plan=build_plan(request, today), ai_available=generator.available)


@router.post("/api/compare", response_model=CompareResponse)
def compare_plans(body: CompareRequest, today: date = Depends(today_in_india)) -> CompareResponse:
    """Before/after for a what-if, a money move or a typed revision. Nothing is saved."""
    try:
        proposed = body.changes.apply_to(body.base)
    except ValidationError as exc:
        raise RequestValidationError(exc.errors()) from exc
    before, after = build_plan(body.base, today), build_plan(proposed, today)
    return CompareResponse(inputs=proposed, plan=after, changes=diff_plans(before, after))


@router.post("/api/messages", response_model=MessageResponse)
def create_message(body: MessageRequest, today: date = Depends(today_in_india)) -> MessageResponse:
    """A ready-to-send enquiry, follow-up or confirmation for one booking. No AI."""
    plan = build_plan(body.inputs, today)
    return MessageResponse(text=vendor_message(body.inputs, plan, body.task_id, body.kind, body.include_budget, today))
