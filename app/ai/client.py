"""The one place that talks to the AI provider; every AI feature goes through it.

A call sends fixed instructions plus an input, asks for a strict JSON schema, and checks the
reply again with Pydantic. Any failure returns None, never an error: every feature has a
non-AI path. Prompts, replies and keys are never logged. To switch providers, change this file.
"""

import hashlib
import logging
from typing import TypeVar

from openai import OpenAI, OpenAIError
from pydantic import BaseModel, ValidationError

from app.ai.cache import TTLCache
from app.config import Settings

logger = logging.getLogger(__name__)

M = TypeVar("M", bound=BaseModel)


class StructuredAI:
    def __init__(self, settings: Settings, client: OpenAI | None = None) -> None:
        self.settings = settings
        self._client = client
        if client is None and settings.openai_api_key:
            self._client = OpenAI(
                api_key=settings.openai_api_key,
                timeout=settings.ai_timeout_seconds,
                max_retries=0,  # one attempt keeps the total wait within the timeout
            )
        self._cache: TTLCache[BaseModel] = TTLCache()

    @property
    def available(self) -> bool:
        return self._client is not None

    def call(
        self, *, instructions: str, prompt_input: str, response_format: dict,
        output: type[M], max_output_tokens: int,
    ) -> M | None:
        """One structured reply validated as `output`, or None. Repeats come from the cache."""
        if not self.available:
            return None
        name = response_format["name"]
        cache_key = hashlib.sha256(
            f"{self.settings.openai_model}\n{name}\n{instructions}\n{prompt_input}".encode()
        ).hexdigest()
        if (cached := self._cache.get(cache_key)) is not None:
            return cached

        options = {}
        if self.settings.openai_reasoning_effort:
            options["reasoning"] = {"effort": self.settings.openai_reasoning_effort}
        try:
            response = self._client.responses.create(
                model=self.settings.openai_model,
                instructions=instructions,
                input=prompt_input,
                text={"format": response_format},
                max_output_tokens=max_output_tokens,
                store=False,
                **options,
            )
            result = output.model_validate_json(response.output_text)
        except (OpenAIError, ValidationError, ValueError) as exc:
            # Log the failure type only: never the prompt (personal data) or the key.
            logger.warning("AI call %s failed: %s", name, type(exc).__name__)
            return None
        self._cache.set(cache_key, result)
        return result
