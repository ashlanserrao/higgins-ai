"""Turn a typed request into form values (new event) or a proposed revision with its before/after."""

from datetime import date

from pydantic import ValidationError

from app.ai.understand import REQUIRED_FIELDS, PlanInterpreter
from app.engine.diff import diff_plans
from app.engine.errors import PlanInputError
from app.engine.planner import build_plan
from app.models import PlanRequest, UnderstandRequest
from app.responses import FieldChange, FieldError, UnderstandResponse
from app.validation_messages import FIELD_LABELS, field_errors


def understand_message(body: UnderstandRequest, interpreter: PlanInterpreter, today: date) -> UnderstandResponse:
    """Nothing is saved or applied; the organiser confirms in the page."""
    current = body.current
    result = UnderstandResponse(
        ai_available=interpreter.available, understood=False, inputs={}, fields=[],
        missing=[], unclear=[], errors=[],
    )
    interpretation = interpreter.interpret(body.message, current, today)
    if interpretation is None:
        return result
    values = interpretation.values
    before = current.model_dump() if current else {}
    result.understood = bool(values)
    result.unclear = interpretation.unclear
    result.fields = [
        FieldChange(field=name, label=FIELD_LABELS.get(name, name), before=before.get(name), after=value)
        for name, value in values.items()
        if before.get(name) != value
    ]
    if current and values.get("event_type", current.event_type) != current.event_type:
        result.errors = [FieldError(
            field="event_type", message="Changing the event type starts a new plan. Use the form instead.",
        )]
        return result

    merged = before | values
    result.inputs = values if current is None else merged
    result.missing = [name for name in REQUIRED_FIELDS if merged.get(name) is None]
    if result.missing:
        return result
    try:
        proposed = PlanRequest.model_validate(merged)
        plan = build_plan(proposed, today)  # also catches dates the engine rejects
    except ValidationError as exc:
        result.errors = [FieldError(**error) for error in field_errors(exc.errors())]
        return result
    except PlanInputError as exc:
        result.errors = [FieldError(field=exc.field, message=str(exc))]
        return result
    if current:
        result.inputs = proposed.model_dump()
        result.plan, result.changes = plan, diff_plans(build_plan(current, today), plan)
    return result
