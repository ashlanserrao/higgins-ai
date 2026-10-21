"""Request and response schemas shared by the API and the planning engine."""

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.engine.rules import BASE_SPLITS

EventType = Literal["wedding", "birthday", "community"]
VenueType = Literal["venue", "home", "outdoor"]
BudgetStatus = Literal["ok", "tight"]
BudgetLevel = Literal["tight", "modest", "comfortable", "generous"]

_CITY_EXTRA_CHARS = set(" .-'")


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
    boosted: bool = False


class ChecklistItem(BaseModel):
    id: str
    label: str
    lead_days: int
    book_by: date
    book_today: bool
    essential: bool


class TimelineEntry(BaseModel):
    date: date
    label: str
    kind: Literal["booking", "milestone", "event"]
    overdue: bool = False


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
