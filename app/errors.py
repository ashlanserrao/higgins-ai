"""Turn Pydantic validation errors into plain-language messages for the form."""

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
}


def friendly_message(field: str, error: dict) -> str:
    label = FIELD_LABELS.get(field, "value")
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
    if kind == "literal_error":
        return f"Please choose a valid {label}."
    if kind == "extra_forbidden":
        return "This field isn't recognised."
    if kind == "value_error":
        return error["msg"].removeprefix("Value error, ")
    return f"Please check the {label}."
