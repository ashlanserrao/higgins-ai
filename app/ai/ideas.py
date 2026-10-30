"""Personalised ideas and triage advice. The rules-based plan is complete without them."""

import re

from app.ai.client import StructuredAI
from app.ai.prompt import INSTRUCTIONS, build_prompt_input
from app.ai.schema import RESPONSE_FORMAT, EventIdeas
from app.models import Plan, PlanRequest

MAX_OUTPUT_TOKENS = 2500
CATEGORIES = ("themes", "decor", "food", "entertainment")
# Price talk: the plan's numbers come from the rules engine, never the AI.
PRICES = re.compile(r"₹|\brs\.?\s*\d|\binr\b|\d[\d,]*\s*(?:rupees|lakh|k\b)", re.IGNORECASE)


class IdeasGenerator:
    def __init__(self, ai: StructuredAI) -> None:
        self.ai = ai

    @property
    def available(self) -> bool:
        return self.ai.available

    async def generate(self, request: PlanRequest, plan: Plan) -> EventIdeas | None:
        ideas = await self.ai.call(
            task="ideas", instructions=INSTRUCTIONS, prompt_input=build_prompt_input(request, plan),
            response_format=RESPONSE_FORMAT, output=EventIdeas, max_output_tokens=MAX_OUTPUT_TOKENS,
        )
        return without_prices(ideas, keep_advice=plan.triage.active) if ideas else None


def without_prices(ideas: EventIdeas, keep_advice: bool) -> EventIdeas | None:
    """Ideas that quote a price are dropped; None if that empties a category.

    Triage advice is kept only while the plan is in triage. A copy, so the cached ideas stay as
    the model returned them.
    """
    kept = {name: [i for i in getattr(ideas, name) if not PRICES.search(f"{i.title} {i.detail}")]
            for name in CATEGORIES}
    if not all(kept.values()):
        return None
    advice = ideas.triage_advice if keep_advice and not PRICES.search(ideas.triage_advice) else ""
    return ideas.model_copy(update={**kept, "triage_advice": advice})
