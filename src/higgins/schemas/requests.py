"""What the browser sends: the organiser's form inputs, their progress and each route's body."""

from datetime import date
from typing import Literal

from pydantic import ConfigDict, Field, field_validator, model_validator

from higgins.engine.rules import BASE_SPLITS
from higgins.schemas.common import ApiModel, EventType, MessageKind, QuoteId, QuoteNote, TaskId, TaskState, VenueType

_CITY_EXTRA_CHARS = set(" .-'")


class TaskUpdate(ApiModel):
    model_config = ConfigDict(extra="forbid")

    state: TaskState
    on: date


class Quote(ApiModel):
    """A vendor's quote as the organiser entered or reviewed it. Unknown fields stay null."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    id: QuoteId
    category: TaskId  # a budget line key, e.g. "food" or "venue_food"
    vendor: str = Field(default="", max_length=80)
    total_inr: int | None = Field(default=None, ge=0, le=100_000_000)
    per_plate_inr: int | None = Field(default=None, ge=0, le=1_000_000)
    guests_covered: int | None = Field(default=None, ge=1, le=10_000)
    inclusions: list[QuoteNote] = Field(default_factory=list, max_length=12)
    exclusions: list[QuoteNote] = Field(default_factory=list, max_length=12)
    taxes_included: bool | None = None
    valid_until: date | None = None
    source: Literal["manual", "ai_extracted"] = "manual"
    # The organiser has checked the details against the vendor's quote.
    verified: bool = False
    # Accepting a quote confirms the cost and books the matching task on this date.
    accepted_on: date | None = None

    @model_validator(mode="after")
    def accepted_quotes_are_checked_and_priced(self) -> "Quote":
        if self.accepted_on and not self.verified:
            raise ValueError("Check a quote's details before accepting it.")
        if self.accepted_on and self.total_inr is None and self.per_plate_inr is None:
            raise ValueError("A quote needs a price before it can be accepted.")
        return self


class Move(ApiModel):
    """Money the organiser moved from one budget line to another."""

    model_config = ConfigDict(extra="forbid")

    from_key: TaskId
    to_key: TaskId
    amount_inr: int = Field(ge=100, le=100_000_000, multiple_of=100)

    @model_validator(mode="after")
    def two_different_lines(self) -> "Move":
        if self.from_key == self.to_key:
            raise ValueError("Pick two different categories to move money between.")
        return self


class Progress(ApiModel):
    """What the organiser has done so far. Kept in the browser and sent with every plan."""

    model_config = ConfigDict(extra="forbid")

    tasks: dict[TaskId, TaskUpdate] = Field(default_factory=dict, max_length=30)
    quotes: list[Quote] = Field(default_factory=list, max_length=20)
    moves: list[Move] = Field(default_factory=list, max_length=10)

    @model_validator(mode="after")
    def one_accepted_quote_per_category(self) -> "Progress":
        if len({q.id for q in self.quotes}) != len(self.quotes):
            raise ValueError("Each quote needs its own id.")
        accepted = [q.category for q in self.quotes if q.accepted_on]
        if len(set(accepted)) != len(accepted):
            raise ValueError("Only one quote per category can be accepted.")
        return self


class PlanRequest(ApiModel):
    """What the organizer enters in the form."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    event_type: EventType
    event_date: date
    guests: int = Field(ge=1, le=5000)
    budget_inr: int = Field(ge=1000, le=100_000_000)
    city: str = Field(min_length=2, max_length=60)
    city_tier: Literal[1, 2, 3] | None = None
    venue_type: VenueType = "venue"
    venue_includes_catering: bool = False
    priorities: list[str] = Field(default_factory=list, max_length=3)
    households: int | None = Field(default=None, ge=1, le=10_000)
    preferences: str = Field(default="", max_length=500)
    # Things the organiser insists on ("Jain food", "live dhol"); like preferences, untrusted.
    must_haves: str = Field(default="", max_length=300)
    progress: Progress = Field(default_factory=Progress)

    @field_validator("city")
    @classmethod
    def city_is_a_name(cls, value: str) -> str:
        if not all(ch.isalpha() or ch in _CITY_EXTRA_CHARS for ch in value):
            raise ValueError("City may only contain letters, spaces, dots, hyphens and apostrophes")
        return value

    @model_validator(mode="after")
    def priorities_match_event(self) -> "PlanRequest":
        allowed = set(BASE_SPLITS[self.event_type]) - {"contingency"}
        unknown = [p for p in self.priorities if p not in allowed]
        if unknown:
            raise ValueError(f"Unknown priorities for {self.event_type}: {', '.join(unknown)}")
        self.priorities = list(dict.fromkeys(self.priorities))
        if self.event_type != "community":
            self.households = None
        return self


class PlanEdit(ApiModel):
    """Fields to change in a plan; anything left out stays as it is.

    The event type and free-text preferences can't be edited: changing them is a new plan.
    """

    model_config = ConfigDict(extra="forbid")

    event_date: date | None = None
    guests: int | None = None
    budget_inr: int | None = None
    city: str | None = None
    city_tier: Literal[1, 2, 3] | None = None
    venue_type: VenueType | None = None
    venue_includes_catering: bool | None = None
    priorities: list[str] | None = None
    households: int | None = None
    # Replaces the whole list of money moves.
    moves: list[Move] | None = None

    def apply_to(self, base: PlanRequest) -> PlanRequest:
        """The edited request, validated like a new one (raises ValidationError)."""
        changes = self.model_dump(exclude_unset=True)
        data = base.model_dump()
        if "moves" in changes:
            data["progress"]["moves"] = changes.pop("moves")
        return PlanRequest.model_validate(data | changes)


class CompareRequest(ApiModel):
    model_config = ConfigDict(extra="forbid")

    base: PlanRequest
    changes: PlanEdit


class MessageRequest(ApiModel):
    model_config = ConfigDict(extra="forbid")

    inputs: PlanRequest
    task_id: TaskId
    kind: MessageKind
    include_budget: bool = False


class UnderstandRequest(ApiModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    message: str = Field(min_length=1, max_length=500)
    current: PlanRequest | None = None  # None: a new event


class AskRequest(ApiModel):
    """Ask Higgins as an agent: a request about an existing plan."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    message: str = Field(min_length=1, max_length=500)
    current: PlanRequest


class QuoteExtractRequest(ApiModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    inputs: PlanRequest
    text: str = Field(min_length=1, max_length=3000)
