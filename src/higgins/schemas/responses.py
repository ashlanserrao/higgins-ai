"""Response bodies for the API routes.

Kept apart from the request and plan schemas because they embed AI types (EventIdeas,
QuoteDraft), and higgins.ai already imports those schemas.
"""

from typing import Any

from higgins.ai.quotes import QuoteDraft
from higgins.ai.schema import EventIdeas
from higgins.schemas.common import ApiModel, MessageKind, StopReason
from higgins.schemas.plan import Plan, PlanDiff
from higgins.schemas.requests import PlanRequest


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


class DraftedVendorMessage(ApiModel):
    task_id: str
    label: str  # who it's to, e.g. "caterer" or "decorator"
    kind: MessageKind
    text: str  # written by the engine's template, never by the model


class AskResponse(ApiModel):
    """What the agent proposes. Built from its working copy, not from its reply; nothing is
    applied until the organiser confirms."""

    ai_available: bool
    stopped: StopReason
    # True when the agent stopped early after doing some of the work: the page says so, and
    # the organiser can still confirm or discard what was done.
    partial: bool
    reply: str  # the model's short summary, or the server's when it stopped early
    fields: list[FieldChange]  # form values that change (moves show in changes.lines instead)
    # Null when the plan's inputs didn't change (a question, or only a drafted message).
    inputs: PlanRequest | None = None  # the edited request, to keep if the organiser confirms
    plan: Plan | None = None
    changes: PlanDiff | None = None
    messages: list[DraftedVendorMessage]
    notes: list[str]  # what the agent couldn't pin down


class IdeasResponse(ApiModel):
    # Null if this call failed; the page offers a retry while ai_available is true.
    ideas: EventIdeas | None
    ai_available: bool
