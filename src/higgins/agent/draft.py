"""The working copy an agent's tools change. Nothing here is saved or applied: the organiser's
plan lives in their browser, and the page applies a proposal only when they confirm it."""

from dataclasses import dataclass, field
from datetime import date

from higgins.engine.diff import diff_plans
from higgins.engine.planner import build_plan
from higgins.schemas.common import MessageKind
from higgins.schemas.plan import Plan, PlanDiff
from higgins.schemas.requests import PlanRequest


@dataclass(frozen=True)
class DraftedMessage:
    task_id: str
    kind: MessageKind
    text: str


@dataclass
class Draft:
    """One request's working copy: the plan as sent, the plan as the tools left it, and what
    they drafted. `message` is the organiser's own words, which the tools check values against."""

    message: str
    today: date
    original: PlanRequest
    current: PlanRequest = field(init=False)
    messages: list[DraftedMessage] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        # Tools replace `current` with a new validated request; they never mutate it in place.
        self.current = self.original

    def plan(self) -> Plan:
        return build_plan(self.current, self.today)

    def changes(self) -> PlanDiff | None:
        """Before/after against the plan as sent, or None if no tool changed it."""
        if self.current == self.original:
            return None
        return diff_plans(build_plan(self.original, self.today), self.plan())
