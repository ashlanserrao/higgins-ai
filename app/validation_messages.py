"""Turn Pydantic validation errors into plain-language messages for the form."""

from collections.abc import Sequence
from typing import Any

from app.engine.money import format_inr

FIELD_LABELS = {
    "event_type": "event type",
    "event_date": "event date",
    "guests": "number of guests",
    "budget_inr": "budget",
    "city": "city",
    "city_tier": "city size",
    "venue_type": "venue type",
    "priorities": "priorities",
    "households": "number of households",
    "preferences": "preferences",
    "must_haves": "must-haves",
    "moves": "budget move",
    "text": "quote text",
    "message": "message",
    "task_id": "booking",
    "kind": "message type",
}
# Some endpoints nest the plan inputs ("base", "current"…); errors name the form field itself.
REQUEST_WRAPPERS = {"body", "base", "changes", "inputs", "current"}
# Errors inside `progress` are named after the part that's wrong.
PROGRESS_LABELS = {"tasks": "booking status", "quotes": "quote", "moves": "budget move"}


def field_errors(errors: Sequence[Any]) -> list[dict[str, str]]:
    """Pydantic errors as [{field, message}], without echoing the submitted values back."""
    fields = []
    for err in errors:
        parts = [str(part) for part in err["loc"] if part not in REQUEST_WRAPPERS]
        field = parts[0] if parts else "body"
        fields.append({"field": field, "message": friendly_message(field, err)})
    return fields


def friendly_message(field: str, error: dict[str, Any]) -> str:
    label = FIELD_LABELS.get(field, "value")
    if field == "progress":
        part = next((str(p) for p in error["loc"] if str(p) in PROGRESS_LABELS), "")
        label = PROGRESS_LABELS.get(part, "progress")
    kind = error["type"]
    ctx = error.get("ctx", {})

    def limit(key: str) -> str:
        return format_inr(ctx[key]) if field == "budget_inr" else str(ctx[key])

    if kind == "missing" or error.get("input") in ("", None):
        return f"Please enter the {label}."
    if kind.startswith("date"):
        return "Please pick a valid date."
    if kind in ("int_parsing", "int_from_float"):
        return f"Please enter the {label} as a whole number."
    if kind == "greater_than_equal":
        return f"The {label} must be at least {limit('ge')}."
    if kind == "less_than_equal":
        return f"The {label} can be at most {limit('le')}."
    if kind == "string_too_short":
        return f"Please enter the {label}."
    if kind == "string_too_long":
        return f"Please keep the {label} under {ctx['max_length']} characters."
    if kind == "too_long":
        return f"Please pick up to {ctx['max_length']} {label}."
    if kind == "multiple_of":
        return f"The {label} must be in steps of {format_inr(ctx['multiple_of'])}."
    if kind == "literal_error":
        return f"Please choose a valid {label}."
    if kind == "extra_forbidden":
        return "This field isn't recognised."
    if kind == "value_error":
        return str(error["msg"]).removeprefix("Value error, ")
    return f"Please check the {label}."
