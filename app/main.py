"""FastAPI app: planning API plus the static frontend."""

import logging
from datetime import date, datetime
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ValidationError

from app.ai.client import StructuredAI
from app.ai.ideas import IdeasGenerator
from app.ai.quotes import QuoteDraft, QuoteExtractor
from app.ai.understand import REQUIRED_FIELDS, PlanInterpreter
from app.ai.schema import EventIdeas
from app.config import IST, settings
from app.engine import rules
from app.engine.errors import PlanInputError
from app.engine.diff import diff_plans
from app.engine.planner import build_plan
from app.errors import FIELD_LABELS, field_errors
from app.models import CompareRequest, Plan, PlanDiff, PlanRequest, QuoteExtractRequest, UnderstandRequest
from app.security import SECURITY_HEADERS, RateLimiter

logger = logging.getLogger(__name__)

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"

app = FastAPI(title="Event Planning Assistant", docs_url=None, redoc_url=None, openapi_url=None)
# The rules-only plan is cheap and called on every "what if" change; AI calls are not.
plan_limiter = RateLimiter(settings.plan_rate_limit_per_minute)
ai_limiter = RateLimiter(settings.rate_limit_per_minute)
RATE_LIMITERS = {
    "/api/plan": plan_limiter, "/api/compare": plan_limiter,
    "/api/ideas": ai_limiter, "/api/quotes/extract": ai_limiter, "/api/understand": ai_limiter,
}
ai = StructuredAI(settings)
ideas_generator = IdeasGenerator(ai)
quote_extractor = QuoteExtractor(ai)
plan_interpreter = PlanInterpreter(ai)


class PlanResponse(BaseModel):
    plan: Plan
    # True when an API key is configured, so the page knows to fetch ideas next.
    ai_available: bool


class CompareResponse(BaseModel):
    inputs: PlanRequest  # the edited request, to keep if the organiser confirms
    plan: Plan
    changes: PlanDiff


class QuoteExtractResponse(BaseModel):
    # Null if nothing could be read; the organiser can still type the quote in.
    quote: QuoteDraft | None
    ai_available: bool


class FieldChange(BaseModel):
    field: str
    label: str
    before: Any  # None: not set before
    after: Any


class FieldError(BaseModel):
    field: str
    message: str


class UnderstandResponse(BaseModel):
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


class IdeasResponse(BaseModel):
    # Null if this call failed; the page offers a retry while ai_available is true.
    ideas: EventIdeas | None
    ai_available: bool


def today_in_india() -> date:
    """Plans count days in India time, so a late-night plan doesn't shift by a day."""
    return datetime.now(IST).date()


def get_ideas_generator() -> IdeasGenerator:
    return ideas_generator


def get_quote_extractor() -> QuoteExtractor:
    return quote_extractor


def get_plan_interpreter() -> PlanInterpreter:
    return plan_interpreter


def _error(status: int, message: str, fields: list[dict] | None = None) -> JSONResponse:
    body: dict = {"error": message}
    if fields:
        body["fields"] = fields
    return JSONResponse(status_code=status, content=body)


@app.middleware("http")
async def guard_requests(request: Request, call_next):
    if request.url.path.startswith("/api/"):
        content_length = request.headers.get("content-length")
        if request.method == "POST" and not content_length:
            # Requiring a declared length stops chunked bodies from bypassing the size cap.
            response = _error(411, "Request must include a Content-Length header.")
        elif content_length and (not content_length.isdigit() or int(content_length) > settings.max_body_bytes):
            response = _error(413, "Request is too large.")
        # Behind a proxy this is the real client IP only when uvicorn runs with
        # --proxy-headers --forwarded-allow-ips (see README > Deploying).
        elif (
            request.method == "POST"
            and (limiter := RATE_LIMITERS.get(request.url.path))
            and not limiter.allow(request.client.host if request.client else "unknown")
        ):
            response = _error(429, "Too many requests. Please wait a minute and try again.")
        else:
            response = await call_next(request)
    else:
        response = await call_next(request)
    response.headers.update(SECURITY_HEADERS)
    return response


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
    return _error(422, "Please check the highlighted fields.", field_errors(exc.errors()))


@app.exception_handler(PlanInputError)
async def plan_input_error(_: Request, exc: PlanInputError) -> JSONResponse:
    return _error(422, str(exc), [{"field": exc.field, "message": str(exc)}])


@app.exception_handler(Exception)
async def unexpected_error(_: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error", exc_info=exc)
    return _error(500, "Something went wrong. Please try again.")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/options")
def options() -> dict:
    """Priority choices per event type, so the form never duplicates the rules tables."""
    return {
        event_type: [
            {"key": key, "label": label}
            for key, label in labels.items()
            if key != "contingency"
        ]
        for event_type, labels in rules.CATEGORY_LABELS.items()
    }


@app.post("/api/plan", response_model=PlanResponse)
def create_plan(
    request: PlanRequest,
    today: date = Depends(today_in_india),
    generator: IdeasGenerator = Depends(get_ideas_generator),
) -> PlanResponse:
    """Rules-only plan: returns in milliseconds so the page can show it immediately."""
    return PlanResponse(plan=build_plan(request, today), ai_available=generator.available)


@app.post("/api/compare", response_model=CompareResponse)
def compare_plans(body: CompareRequest, today: date = Depends(today_in_india)) -> CompareResponse:
    """Before/after for a what-if, a money move or a typed revision. Nothing is saved."""
    try:
        proposed = body.changes.apply_to(body.base)
    except ValidationError as exc:
        raise RequestValidationError(exc.errors()) from exc
    before, after = build_plan(body.base, today), build_plan(proposed, today)
    return CompareResponse(inputs=proposed, plan=after, changes=diff_plans(before, after))


@app.post("/api/ideas", response_model=IdeasResponse)
def create_ideas(
    request: PlanRequest,
    today: date = Depends(today_in_india),
    generator: IdeasGenerator = Depends(get_ideas_generator),
) -> IdeasResponse:
    """AI ideas for the same inputs, fetched after the plan is already on screen."""
    ideas = generator.generate(request, build_plan(request, today))
    return IdeasResponse(ideas=ideas, ai_available=generator.available)



@app.post("/api/quotes/extract", response_model=QuoteExtractResponse)
def extract_quote(
    body: QuoteExtractRequest,
    today: date = Depends(today_in_india),
    extractor: QuoteExtractor = Depends(get_quote_extractor),
) -> QuoteExtractResponse:
    """Read a pasted quote into a draft for the organiser to check. Nothing is saved."""
    draft = extractor.extract(body.inputs, build_plan(body.inputs, today), body.text, today)
    return QuoteExtractResponse(quote=draft, ai_available=extractor.available)



@app.post("/api/understand", response_model=UnderstandResponse)
def understand(
    body: UnderstandRequest,
    today: date = Depends(today_in_india),
    interpreter: PlanInterpreter = Depends(get_plan_interpreter),
) -> UnderstandResponse:
    """Turn a typed request into form values (new event) or a proposed revision with its
    before/after. Nothing is saved or applied."""
    current = body.current
    result = UnderstandResponse(
        ai_available=interpreter.available, understood=False, inputs={}, fields=[],
        missing=[], unclear=[], errors=[],
    )
    interpretation = interpreter.interpret(body.message, current, today)
    if interpretation is None:
        return result
    values = interpretation.values
    before = current.model_dump() if current else {}
    result.understood = bool(values)
    result.unclear = interpretation.unclear
    result.fields = [
        FieldChange(field=name, label=FIELD_LABELS.get(name, name), before=before.get(name), after=value)
        for name, value in values.items()
        if before.get(name) != value
    ]
    if current and values.get("event_type", current.event_type) != current.event_type:
        result.errors = [FieldError(
            field="event_type", message="Changing the event type starts a new plan. Use the form instead.",
        )]
        return result

    merged = before | values
    result.inputs = values if current is None else merged
    result.missing = [name for name in REQUIRED_FIELDS if merged.get(name) is None]
    if result.missing:
        return result
    try:
        proposed = PlanRequest.model_validate(merged)
        plan = build_plan(proposed, today)  # also catches dates the engine rejects
    except ValidationError as exc:
        result.errors = [FieldError(**error) for error in field_errors(exc.errors())]
        return result
    except PlanInputError as exc:
        result.errors = [FieldError(field=exc.field, message=str(exc))]
        return result
    if current:
        result.inputs = proposed.model_dump()
        result.plan, result.changes = plan, diff_plans(build_plan(current, today), plan)
    return result


app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
