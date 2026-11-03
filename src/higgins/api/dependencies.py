"""What the routes depend on: today's date, the rate limiters and the AI helpers.

Routes take these through FastAPI's Depends, so tests swap in fakes with app.dependency_overrides.
"""

from datetime import date, datetime

from higgins.ai.ideas import IdeasGenerator
from higgins.ai.providers.chain import StructuredAI
from higgins.ai.quotes import QuoteExtractor
from higgins.ai.understand import PlanInterpreter
from higgins.core.config import IST, settings
from higgins.core.rate_limit import RateLimiter

# The rules-only plan is cheap and called on every "what if" change; AI calls are not.
plan_limiter = RateLimiter(settings.plan_rate_limit_per_minute)
ai_limiter = RateLimiter(settings.rate_limit_per_minute)
RATE_LIMITERS = {
    "/api/plan": plan_limiter, "/api/compare": plan_limiter, "/api/messages": plan_limiter,
    "/api/ideas": ai_limiter, "/api/quotes/extract": ai_limiter, "/api/understand": ai_limiter,
}
# One shared bucket for every visitor's AI calls, so many IPs together can't run up the bill.
# StructuredAI counts it, so cached replies and requests that fail validation don't use it up.
ai_total_limiter = RateLimiter(settings.ai_total_limit_per_hour, window=3600)
ai = StructuredAI(settings, hourly_cap=ai_total_limiter)
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
