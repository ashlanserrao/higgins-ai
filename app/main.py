"""FastAPI app: planning API plus the static frontend."""

import logging
from datetime import date, datetime
from pathlib import Path

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app.ai.ideas import IdeasGenerator
from app.ai.schema import EventIdeas
from app.config import IST, settings
from app.engine import rules
from app.engine.errors import PlanInputError
from app.engine.planner import build_plan
from app.errors import friendly_message
from app.models import Plan, PlanRequest
from app.security import SECURITY_HEADERS, RateLimiter

logger = logging.getLogger(__name__)

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"

app = FastAPI(title="Event Planning Assistant", docs_url=None, redoc_url=None, openapi_url=None)
# The rules-only plan is cheap and called on every "what if" change; AI calls are not.
plan_limiter = RateLimiter(settings.plan_rate_limit_per_minute)
ideas_limiter = RateLimiter(settings.rate_limit_per_minute)
RATE_LIMITERS = {"/api/plan": plan_limiter, "/api/ideas": ideas_limiter}
ideas_generator = IdeasGenerator(settings)


class PlanResponse(BaseModel):
    plan: Plan
    # True when an API key is configured, so the page knows to fetch ideas next.
    ai_available: bool


class IdeasResponse(BaseModel):
    # Null if this call failed; the page offers a retry while ai_available is true.
    ideas: EventIdeas | None
    ai_available: bool


def today_in_india() -> date:
    """Plans count days in India time, so a late-night plan doesn't shift by a day."""
    return datetime.now(IST).date()


def get_ideas_generator() -> IdeasGenerator:
    return ideas_generator


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
    # Report which field is wrong in plain language, without echoing the submitted values back.
    fields = []
    for err in exc.errors():
        parts = [str(part) for part in err["loc"] if part != "body"]
        field = parts[0] if parts else "body"
        fields.append({"field": field, "message": friendly_message(field, err)})
    return _error(422, "Please check the highlighted fields.", fields)


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


@app.post("/api/ideas", response_model=IdeasResponse)
def create_ideas(
    request: PlanRequest,
    today: date = Depends(today_in_india),
    generator: IdeasGenerator = Depends(get_ideas_generator),
) -> IdeasResponse:
    """AI ideas for the same inputs, fetched after the plan is already on screen."""
    ideas = generator.generate(request, build_plan(request, today))
    return IdeasResponse(ideas=ideas, ai_available=generator.available)


app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
