"""Request and response schemas shared by the API and the planning engine."""

from datetime import date
from typing import Annotated, Literal

from pydantic import (
    BaseModel, ConfigDict, Field, StringConstraints, computed_field, field_validator, model_validator,
)

from app.engine.rules import BASE_SPLITS

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

_CITY_EXTRA_CHARS = set(" .-'")


class TaskUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    state: TaskState
    on: date


class Quote(BaseModel):
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


class Progress(BaseModel):
    """What the organiser has done so far. Kept in the browser and sent with every plan."""

    model_config = ConfigDict(extra="forbid")

    tasks: dict[TaskId, TaskUpdate] = Field(default_factory=dict, max_length=30)
    quotes: list[Quote] = Field(default_factory=list, max_length=20)

    @model_validator(mode="after")
    def one_accepted_quote_per_category(self) -> "Progress":
        if len({q.id for q in self.quotes}) != len(self.quotes):
            raise ValueError("Each quote needs its own id.")
        accepted = [q.category for q in self.quotes if q.accepted_on]
        if len(set(accepted)) != len(accepted):
            raise ValueError("Only one quote per category can be accepted.")
        return self


class PlanRequest(BaseModel):
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


class BudgetLine(BaseModel):
    key: str
    label: str
    percent: float
    amount_inr: int
    # The benchmark amount before any quote was accepted.
    estimate_inr: int
    boosted: bool = False
    source: Literal["estimate", "confirmed"] = "estimate"
    quote_id: str | None = None

    @computed_field
    @property
    def change_inr(self) -> int:
        return self.amount_inr - self.estimate_inr


class QuoteComparison(BaseModel):
    """One quote set against the plan's estimate for its category."""

    quote_id: str
    vendor: str
    total_inr: int | None
    # True when the total is per-plate price × planned guests, not a figure on the quote.
    calculated: bool
    per_guest_inr: int | None
    capacity: Capacity
    vs_estimate_inr: int | None  # positive: over the estimate
    missing: list[str]
    accepted: bool
    expired: bool


class BudgetCut(BaseModel):
    key: str
    label: str
    amount_inr: int


class Rebalance(BaseModel):
    """How the plan absorbed accepted quotes that differ from the estimates."""

    change_inr: int  # confirmed minus estimated, across accepted quotes
    from_contingency_inr: int
    cuts: list[BudgetCut]
    over_budget_inr: int
    explanation: str


class ChecklistItem(BaseModel):
    id: str
    label: str
    lead_days: int
    book_by: date
    status: BookingStatus
    essential: bool
    done: bool = False
    booked_on: date | None = None
    # Set when a delay (its own, or a prerequisite's) pushes the booking later.
    expected_on: date | None = None
    # The task whose delay set expected_on: this task itself, or a prerequisite.
    delayed_by: str | None = None
    # Prerequisites that aren't booked yet.
    waiting_on: list[str] = Field(default_factory=list)
    # expected_on is after book_by.
    at_risk: bool = False


class TimelineEntry(BaseModel):
    date: date
    label: str
    kind: Literal["booking", "milestone", "event"]
    status: Literal["on_track", "tight", "overdue", "at_risk", "done"] = "on_track"


class Triage(BaseModel):
    active: bool
    book_today: list[str]
    cut_suggestions: list[str]


class Plan(BaseModel):
    """The deterministic, rules-based plan. AI output never changes these values."""

    event_type: EventType
    event_date: date
    today: date
    days_remaining: int
    city_tier: Literal[1, 2, 3]
    per_guest_inr: int
    floor_per_guest_inr: int
    budget_status: BudgetStatus
    budget_level: BudgetLevel
    budget_lines: list[BudgetLine]
    warnings: list[str]
    cost_saving_swaps: list[str]
    triage: Triage
    timeline: list[TimelineEntry]
    checklist: list[ChecklistItem]
    per_flat_inr: int | None = None
    # Progress for tasks that aren't in this plan (e.g. a venue after switching to "home").
    ignored_progress: list[str] = Field(default_factory=list)
    # Quotes, by category, for budget lines in this plan; ids of the others.
    quote_comparisons: dict[str, list[QuoteComparison]] = Field(default_factory=dict)
    ignored_quotes: list[str] = Field(default_factory=list)
    rebalance: Rebalance | None = None
