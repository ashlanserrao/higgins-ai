"""Response bodies for the API routes.

Kept out of app.models because they embed AI types (EventIdeas, QuoteDraft), and app.ai already
imports app.models.
"""

from typing import Any

from app.ai.quotes import QuoteDraft
from app.ai.schema import EventIdeas
from app.models import ApiModel, Plan, PlanDiff, PlanRequest


class PlanResponse(ApiModel):
    plan: Plan
    # True when an API key is configured, so the page knows to fetch ideas next.
    ai_available: bool


class CompareResponse(ApiModel):
    inputs: PlanRequest  # the edited request, to keep if the organiser confirms
    plan: Plan
    changes: PlanDiff


class QuoteExtractResponse(ApiModel):
    # Null if nothing could be read; the organiser can still type the quote in.
    quote: QuoteDraft | None
    ai_available: bool


class MessageResponse(ApiModel):
    text: str


class FieldChange(ApiModel):
    field: str
    label: str
    before: Any  # None: not set before
    after: Any


class FieldError(ApiModel):
    field: str
    message: str


class UnderstandResponse(ApiModel):
    ai_available: bool
    understood: bool  # False: the AI failed or the message asked for nothing it could use
    inputs: dict[str, Any]  # new event: values to fill the form with; revision: the edited request
    fields: list[FieldChange]
    missing: list[str]  # required fields a new event still needs
    unclear: list[str]
    errors: list[FieldError]
    # Revisions only, when the edited request is valid: the new plan and what changes.
    plan: Plan | None = None
    changes: PlanDiff | None = None


class IdeasResponse(ApiModel):
    # Null if this call failed; the page offers a retry while ai_available is true.
    ideas: EventIdeas | None
    ai_available: bool
