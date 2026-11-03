"""AI routes. Each returns null rather than an error when the AI can't answer: the page always
has a non-AI path.

They are async: a provider call waits on the network for seconds, and awaiting it frees the
server for other requests instead of holding a worker thread.
"""

from datetime import date

from fastapi import APIRouter, Depends

from higgins.ai.ideas import IdeasGenerator
from higgins.ai.quotes import QuoteExtractor
from higgins.ai.understand import PlanInterpreter
from higgins.api.dependencies import get_ideas_generator, get_plan_interpreter, get_quote_extractor, today_in_india
from higgins.engine.planner import build_plan
from higgins.schemas.requests import PlanRequest, QuoteExtractRequest, UnderstandRequest
from higgins.schemas.responses import IdeasResponse, QuoteExtractResponse, UnderstandResponse
from higgins.services.understand import understand_message

router = APIRouter()


@router.post("/api/ideas", response_model=IdeasResponse)
async def create_ideas(
    request: PlanRequest,
    today: date = Depends(today_in_india),
    generator: IdeasGenerator = Depends(get_ideas_generator),
) -> IdeasResponse:
    """AI ideas for the same inputs, fetched after the plan is already on screen."""
    ideas = await generator.generate(request, build_plan(request, today))
    return IdeasResponse(ideas=ideas, ai_available=generator.available)


@router.post("/api/quotes/extract", response_model=QuoteExtractResponse)
async def extract_quote(
    body: QuoteExtractRequest,
    today: date = Depends(today_in_india),
    extractor: QuoteExtractor = Depends(get_quote_extractor),
) -> QuoteExtractResponse:
    """Read a pasted quote into a draft for the organiser to check. Nothing is saved."""
    draft = await extractor.extract(body.inputs, build_plan(body.inputs, today), body.text, today)
    return QuoteExtractResponse(quote=draft, ai_available=extractor.available)


@router.post("/api/understand", response_model=UnderstandResponse)
async def understand(
    body: UnderstandRequest,
    today: date = Depends(today_in_india),
    interpreter: PlanInterpreter = Depends(get_plan_interpreter),
) -> UnderstandResponse:
    """Turn a typed request into form values (new event) or a proposed revision with its
    before/after. Nothing is saved or applied."""
    return await understand_message(body, interpreter, today)
