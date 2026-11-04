"""Types shared by the request and plan schemas, and the base model every API schema uses."""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, StringConstraints

EventType = Literal["wedding", "birthday", "community"]
VenueType = Literal["venue", "home", "outdoor"]
BudgetStatus = Literal["ok", "tight"]
BudgetLevel = Literal["tight", "modest", "comfortable", "generous"]
# on_track: full lead time left; tight: inside the lead time but at least half of it left;
# book_today: less than half left.
BookingStatus = Literal["on_track", "tight", "book_today"]
# booked: done on `on`; delayed: the vendor can only confirm on `on`.
TaskState = Literal["booked", "delayed"]
TaskId = Annotated[str, StringConstraints(max_length=30)]
QuoteId = Annotated[str, StringConstraints(min_length=1, max_length=40, pattern=r"^[A-Za-z0-9_-]+$")]
QuoteNote = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
Capacity = Literal["fits", "too_small", "not_stated"]
MessageKind = Literal["enquiry", "follow_up", "confirmation"]
# Why the agent stopped. done: the model replied. step_cap / time: a guardrail stopped it.
# no_answer: no provider answered a turn. busy: the hourly cap shared by every visitor is used up.
StopReason = Literal["done", "step_cap", "time", "no_answer", "busy"]


class ApiModel(BaseModel):
    # Responses always include fields that have defaults, so the OpenAPI output schemas mark
    # them required and the generated frontend types don't make them optional.
    model_config = ConfigDict(json_schema_serialization_defaults_required=True)
