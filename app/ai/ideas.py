"""Swappable wrapper around the OpenAI call. Any failure returns None, never an error:
the rules-based plan is complete without ideas."""

import hashlib
import logging

from openai import OpenAI, OpenAIError
from pydantic import ValidationError

from app.ai.cache import TTLCache
from app.ai.prompt import INSTRUCTIONS, build_prompt_input
from app.ai.schema import RESPONSE_FORMAT, EventIdeas
from app.config import Settings
from app.models import Plan, PlanRequest

logger = logging.getLogger(__name__)

MAX_OUTPUT_TOKENS = 2500


class IdeasGenerator:
    def __init__(self, settings: Settings, client: OpenAI | None = None) -> None:
        self.settings = settings
        self._client = client
        if client is None and settings.openai_api_key:
            self._client = OpenAI(
                api_key=settings.openai_api_key,
                timeout=settings.ai_timeout_seconds,
                max_retries=0,  # one attempt keeps the total wait within the timeout
            )
        self._cache: TTLCache[EventIdeas] = TTLCache()

    @property
    def available(self) -> bool:
        return self._client is not None

    def generate(self, request: PlanRequest, plan: Plan) -> EventIdeas | None:
        if not self.available:
            return None
        prompt_input = build_prompt_input(request, plan)
        cache_key = hashlib.sha256(f"{self.settings.openai_model}\n{prompt_input}".encode()).hexdigest()
        if (cached := self._cache.get(cache_key)) is not None:
            return cached

        options = {}
        if self.settings.openai_reasoning_effort:
            options["reasoning"] = {"effort": self.settings.openai_reasoning_effort}
        try:
            response = self._client.responses.create(
                model=self.settings.openai_model,
                instructions=INSTRUCTIONS,
                input=prompt_input,
                text={"format": RESPONSE_FORMAT},
                max_output_tokens=MAX_OUTPUT_TOKENS,
                store=False,
                **options,
            )
            ideas = EventIdeas.model_validate_json(response.output_text)
        except (OpenAIError, ValidationError, ValueError) as exc:
            # Log the failure type only: never the prompt (personal data) or the key.
            logger.warning("AI ideas unavailable: %s", type(exc).__name__)
            return None

        if not plan.triage.active:
            ideas.triage_advice = ""
        self._cache.set(cache_key, ideas)
        return ideas
