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
from app.engine.planner import PlanInputError, build_plan
from app.models import Plan, PlanRequest
from app.security import SECURITY_HEADERS, RateLimiter

logger = logging.getLogger(__name__)

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"

app = FastAPI(title="Event Planning Assistant", docs_url=None, redoc_url=None, openapi_url=None)
rate_limiter = RateLimiter(settings.rate_limit_per_minute)
ideas_generator = IdeasGenerator(settings)


class PlanResponse(BaseModel):
    plan: Plan
    ideas: EventIdeas | None
    # False when no API key is configured or this request's AI call failed.
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
        if content_length and (not content_length.isdigit() or int(content_length) > settings.max_body_bytes):
            response = _error(413, "Request is too large.")
        elif request.method == "POST" and not rate_limiter.allow(request.client.host if request.client else "unknown"):
            response = _error(429, "Too many requests. Please wait a minute and try again.")
        else:
            response = await call_next(request)
    else:
        response = await call_next(request)
    response.headers.update(SECURITY_HEADERS)
    return response


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
    # Report which field is wrong and why, without echoing the submitted values back.
    fields = [
        {
            "field": ".".join(str(part) for part in err["loc"] if part != "body") or "body",
            "message": err["msg"].removeprefix("Value error, "),
        }
        for err in exc.errors()
    ]
    return _error(422, "Please check the highlighted fields.", fields)


@app.exception_handler(PlanInputError)
async def plan_input_error(_: Request, exc: PlanInputError) -> JSONResponse:
    return _error(422, str(exc), [{"field": "event_date", "message": str(exc)}])


@app.exception_handler(Exception)
async def unexpected_error(_: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error", exc_info=exc)
    return _error(500, "Something went wrong. Please try again.")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/api/plan", response_model=PlanResponse)
def create_plan(
    request: PlanRequest,
    today: date = Depends(today_in_india),
    generator: IdeasGenerator = Depends(get_ideas_generator),
) -> PlanResponse:
    plan = build_plan(request, today)
    ideas = generator.generate(request, plan) if request.include_ideas else None
    ai_available = generator.available and (ideas is not None or not request.include_ideas)
    return PlanResponse(plan=plan, ideas=ideas, ai_available=ai_available)


app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
