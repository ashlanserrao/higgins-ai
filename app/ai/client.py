"""The one place that talks to AI providers; every AI feature goes through it.

A call sends fixed instructions plus an input, asks for a strict JSON schema, and checks the
reply again with Pydantic. Providers are tried in order (Groq first when its key is set, then
OpenAI) inside one time budget: a provider that times out, errors or sends a reply that fails
the check hands over to the next. If none answers, the call returns None, never an error:
every feature has a non-AI path. Prompts, replies and keys are never logged; one line per
call records the task, provider, model, time taken and outcome.
"""

import asyncio
import hashlib
import logging
import time
from typing import Any, TypeVar, cast

from openai import (
    APITimeoutError, AsyncOpenAI, AuthenticationError, BadRequestError, OpenAIError, RateLimitError,
)
from pydantic import BaseModel, ValidationError

from app.ai.cache import TTLCache
from app.config import Settings

logger = logging.getLogger(__name__)

M = TypeVar("M", bound=BaseModel)

GROQ_BASE_URL = "https://api.groq.com/openai/v1"
# A backup with less time left than this would only time out too.
MIN_BACKUP_SECONDS = 2.0
# After a 429, a provider rests for its retry-after time, capped here (default when not given).
MAX_REST_SECONDS = 60.0
DEFAULT_REST_SECONDS = 10.0


class Provider:
    """One provider in the chain. Subclasses turn a call into that provider's API."""

    name = ""

    def __init__(self, settings: Settings, client: AsyncOpenAI, timeout: float) -> None:
        self.settings = settings
        self.client = client
        self.timeout = timeout
        self.resting_until = 0.0  # monotonic time; set after a 429 so bursts skip straight past

    def model(self, task: str) -> str:
        raise NotImplementedError

    async def reply(
        self, *, task: str, instructions: str, prompt_input: str, response_format: dict,
        max_output_tokens: int, timeout: float,
    ) -> str:
        raise NotImplementedError


class OpenAIProvider(Provider):
    """OpenAI's Responses API, with store=False so nothing is kept for later turns."""

    name = "openai"

    def model(self, task: str) -> str:
        return self.settings.openai_model

    async def reply(self, *, task, instructions, prompt_input, response_format, max_output_tokens, timeout) -> str:
        # The SDK types these as TypedDicts and Literals; our schemas and settings are plain dicts and strings.
        options: dict[str, Any] = {"text": {"format": response_format}}
        if self.settings.openai_reasoning_effort:
            options["reasoning"] = {"effort": self.settings.openai_reasoning_effort}
        response = await self.client.responses.create(
            model=self.model(task),
            instructions=instructions,
            input=prompt_input,
            max_output_tokens=max_output_tokens,
            store=False,
            timeout=timeout,
            **options,
        )
        return response.output_text


class GroqProvider(Provider):
    """Groq's Chat Completions, where strict JSON schemas are documented (its Responses API is in beta)."""

    name = "groq"

    def model(self, task: str) -> str:
        return self.settings.groq_task_models.get(task, self.settings.groq_model)

    async def reply(self, *, task, instructions, prompt_input, response_format, max_output_tokens, timeout) -> str:
        # As above: the SDK's TypedDicts and Literals don't take our plain schema dicts and setting strings.
        options: dict[str, Any] = {"response_format": {"type": "json_schema", "json_schema": {
            "name": response_format["name"], "schema": response_format["schema"], "strict": True,
        }}}
        if self.settings.groq_reasoning_effort:
            options["reasoning_effort"] = self.settings.groq_reasoning_effort
        response = await self.client.chat.completions.create(
            model=self.model(task),
            messages=[{"role": "system", "content": instructions}, {"role": "user", "content": prompt_input}],
            max_completion_tokens=max_output_tokens,
            # Only the JSON comes back; the model's reasoning stays on Groq's side.
            extra_body={"include_reasoning": False},
            timeout=timeout,
            **options,
        )
        return response.choices[0].message.content or ""


def default_providers(settings: Settings) -> list[Provider]:
    """The chain the keys allow: Groq for speed, then OpenAI as the backup. Empty: AI is off."""
    providers: list[Provider] = []
    if settings.groq_api_key:
        client = AsyncOpenAI(api_key=settings.groq_api_key, base_url=GROQ_BASE_URL, max_retries=0)
        providers.append(GroqProvider(settings, client, settings.groq_timeout_seconds))
    if settings.openai_api_key:
        client = AsyncOpenAI(api_key=settings.openai_api_key, max_retries=0)
        providers.append(OpenAIProvider(settings, client, settings.ai_timeout_seconds))
    return providers


class StructuredAI:
    def __init__(self, settings: Settings, providers: list[Provider] | None = None) -> None:
        self.settings = settings
        self.providers = default_providers(settings) if providers is None else providers
        self._cache: TTLCache[BaseModel] = TTLCache()

    @property
    def available(self) -> bool:
        return bool(self.providers)

    async def call(
        self, *, task: str, instructions: str, prompt_input: str, response_format: dict,
        output: type[M], max_output_tokens: int,
    ) -> M | None:
        """One structured reply validated as `output`, or None. Repeats come from the cache."""
        if not self.available:
            return None
        # The chain, not the provider that answered: a backup's answer is reused like any other.
        chain = ",".join(f"{p.name}:{p.model(task)}" for p in self.providers)
        cache_key = hashlib.sha256(f"{chain}\n{task}\n{instructions}\n{prompt_input}".encode()).hexdigest()
        if (cached := self._cache.get(cache_key)) is not None:
            logger.info("AI %s: cached", task)
            return cast(M, cached)  # the key holds the task, and each task has one output type

        deadline = time.monotonic() + self.settings.ai_timeout_seconds
        for attempt, provider in enumerate(self.providers):
            started = time.monotonic()
            if provider.resting_until > started:
                logger.info("AI %s: %s skipped, resting after a 429", task, provider.name)
                continue
            remaining = deadline - started
            if attempt and remaining < MIN_BACKUP_SECONDS:
                break
            timeout = min(provider.timeout, remaining)
            try:
                text = await asyncio.wait_for(provider.reply(
                    task=task, instructions=instructions, prompt_input=prompt_input,
                    response_format=response_format, max_output_tokens=max_output_tokens, timeout=timeout,
                ), timeout)
                result = output.model_validate_json(text)
            except (OpenAIError, ValidationError, ValueError, TimeoutError) as exc:
                if isinstance(exc, RateLimitError):
                    provider.resting_until = time.monotonic() + _rest_seconds(exc)
                # The failure type only: never the prompt (personal data), the reply or the key.
                _log(logging.WARNING, task, provider, started, _failure(exc))
                continue
            _log(logging.INFO, task, provider, started, "ok")
            self._cache.set(cache_key, result)
            return result
        return None


def _log(level: int, task: str, provider: Provider, started: float, outcome: str) -> None:
    ms = round((time.monotonic() - started) * 1000)
    logger.log(level, "AI %s: %s %s %dms %s", task, provider.name, provider.model(task), ms, outcome)


def _failure(exc: Exception) -> str:
    """Why a provider's attempt failed, in one word for the log."""
    if isinstance(exc, (TimeoutError, APITimeoutError)):
        return "timeout"
    if isinstance(exc, RateLimitError):
        return "429"
    if isinstance(exc, AuthenticationError):
        return "auth"
    if isinstance(exc, BadRequestError):
        return "bad_request"
    if isinstance(exc, (ValidationError, ValueError)):
        return "invalid_json"
    return "api_error"


def _rest_seconds(exc: RateLimitError) -> float:
    """The provider's retry-after, within limits."""
    try:
        return min(float(exc.response.headers.get("retry-after", DEFAULT_REST_SECONDS)), MAX_REST_SECONDS)
    except ValueError:
        return DEFAULT_REST_SECONDS
