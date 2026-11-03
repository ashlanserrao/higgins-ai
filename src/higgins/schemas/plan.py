"""The rules engine's output: the plan, its parts, and the before/after of two plans."""

from datetime import date
from typing import Generic, Literal, TypeVar

from pydantic import Field, computed_field

from higgins.schemas.common import ApiModel, BookingStatus, BudgetLevel, BudgetStatus, Capacity, EventType

T = TypeVar("T")


class BudgetLine(ApiModel):
    key: str
    label: str
    percent: float
    amount_inr: int
    # The planned amount before any quote was accepted: the benchmark split plus moved money.
    estimate_inr: int
    # Money the organiser moved into (+) or out of (−) this line.
    moved_inr: int = 0
    boosted: bool = False
    source: Literal["estimate", "confirmed"] = "estimate"
    quote_id: str | None = None

    @computed_field  # type: ignore[prop-decorator]  # the pattern Pydantic documents for mypy
    @property
    def change_inr(self) -> int:
        return self.amount_inr - self.estimate_inr


class QuoteComparison(ApiModel):
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


class BudgetCut(ApiModel):
    key: str
    label: str
    amount_inr: int


class Rebalance(ApiModel):
    """How the plan absorbed accepted quotes that differ from the estimates."""

    change_inr: int  # confirmed minus estimated, across accepted quotes
    from_contingency_inr: int
    cuts: list[BudgetCut]
    over_budget_inr: int
    explanation: str


class ChecklistItem(ApiModel):
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


class TimelineEntry(ApiModel):
    date: date
    label: str
    kind: Literal["booking", "milestone", "event"]
    status: Literal["on_track", "tight", "overdue", "at_risk", "done"] = "on_track"


class Triage(ApiModel):
    active: bool
    book_today: list[str]
    cut_suggestions: list[str]


class Plan(ApiModel):
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
    # Positions of money moves that touch a line not in this plan, or one a quote confirmed.
    ignored_moves: list[int] = Field(default_factory=list)
    rebalance: Rebalance | None = None


class Pair(ApiModel, Generic[T]):
    before: T
    after: T


class LineChange(ApiModel):
    key: str
    label: str
    before_inr: int | None  # None: the line wasn't in the plan
    after_inr: int | None
    delta_inr: int


class TaskChange(ApiModel):
    id: str
    label: str
    # done, at_risk, book_today, tight or on_track; None: the task wasn't in the plan.
    before: str | None
    after: str | None


class PlanDiff(ApiModel):
    """What changes between two plans: the numbers, each budget line and each task."""

    days_remaining: Pair[int]
    per_guest_inr: Pair[int]
    budget_status: Pair[BudgetStatus]
    budget_level: Pair[BudgetLevel]
    triage_active: Pair[bool]
    over_budget_inr: Pair[int]
    lines: list[LineChange]
    tasks: list[TaskChange]
    warnings_added: list[str]
    warnings_removed: list[str]
    # The headline changes in plain words, for a confirm step or a screen reader.
    summary: list[str]
