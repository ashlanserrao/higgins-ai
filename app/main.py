"""FastAPI app: planning API plus the static frontend."""

import logging
from datetime import date, datetime
from pathlib import Path

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import ValidationError

from app.ai.client import StructuredAI
from app.ai.ideas import IdeasGenerator
from app.ai.quotes import QuoteExtractor
from app.ai.understand import PlanInterpreter
from app.config import IST, settings
from app.engine import rules
from app.engine.diff import diff_plans
from app.engine.errors import PlanInputError
from app.engine.messages import vendor_message
from app.engine.planner import build_plan
from app.models import CompareRequest, MessageRequest, PlanRequest, QuoteExtractRequest, UnderstandRequest
from app.responses import (
    CompareResponse, IdeasResponse, MessageResponse, PlanResponse, QuoteExtractResponse, UnderstandResponse,
)
from app.security import SECURITY_HEADERS, RateLimiter
from app.services.understand import understand_message
from app.validation_messages import field_errors

logger = logging.getLogger(__name__)

# The React build (cd frontend && npm run build). The API works without it, e.g. in tests.
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend" / "dist"

app = FastAPI(title="Event Planning Assistant", docs_url=None, redoc_url=None, openapi_url=None)
# The rules-only plan is cheap and called on every "what if" change; AI calls are not.
plan_limiter = RateLimiter(settings.plan_rate_limit_per_minute)
ai_limiter = RateLimiter(settings.rate_limit_per_minute)
RATE_LIMITERS = {
    "/api/plan": plan_limiter, "/api/compare": plan_limiter, "/api/messages": plan_limiter,
    "/api/ideas": ai_limiter, "/api/quotes/extract": ai_limiter, "/api/understand": ai_limiter,
}
ai = StructuredAI(settings)
ideas_generator = IdeasGenerator(ai)
quote_extractor = QuoteExtractor(ai)
plan_interpreter = PlanInterpreter(ai)


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


@app.post("/api/messages", response_model=MessageResponse)
def create_message(body: MessageRequest, today: date = Depends(today_in_india)) -> MessageResponse:
    """A ready-to-send enquiry, follow-up or confirmation for one booking. No AI."""
    plan = build_plan(body.inputs, today)
    return MessageResponse(text=vendor_message(body.inputs, plan, body.task_id, body.kind, body.include_budget, today))


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
    return understand_message(body, interpreter, today)


if FRONTEND_DIR.is_dir():
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
