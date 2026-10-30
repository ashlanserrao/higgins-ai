"""Personalised ideas and triage advice. The rules-based plan is complete without them."""

from app.ai.client import StructuredAI
from app.ai.prompt import INSTRUCTIONS, build_prompt_input
from app.ai.schema import RESPONSE_FORMAT, EventIdeas
from app.models import Plan, PlanRequest

MAX_OUTPUT_TOKENS = 2500


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
        if ideas and ideas.triage_advice and not plan.triage.active:
            # A copy, so the cached ideas stay as the model returned them.
            ideas = ideas.model_copy(update={"triage_advice": ""})
        return ideas
