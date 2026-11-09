"""The one way to AI providers: every AI feature calls StructuredAI, which runs the provider chain.

A call sends fixed instructions plus an input, asks for a strict JSON schema, and checks the
reply again with Pydantic. Providers are tried in order (Groq first when its key is set, then
OpenAI) inside one time budget: a provider that times out, errors or sends a reply that fails
the check hands over to the next. If none answers, the call returns None: every feature has a
non-AI path. The one error is AIBusyError, when the hourly cap shared by every visitor is used
up. Prompts, replies and keys are never logged; one record per attempt (core/telemetry.py)
holds the task, provider, model, time, outcome, tokens, list-price cost and rate limit left.

The agent uses the same chain one turn at a time (`turn`): tool calls or a text reply instead of
JSON, with the time budget set by the agent for its whole conversation.
"""

import asyncio
import hashlib
import logging
import time
from collections.abc import Awaitable, Callable
from typing import Any, TypeVar, cast

from openai import (
    APITimeoutError, AsyncOpenAI, AuthenticationError, BadRequestError, OpenAIError, RateLimitError,
)
from pydantic import BaseModel, ValidationError

from higgins.ai.providers.base import Provider, Turn
from higgins.ai.providers.cache import TTLCache
from higgins.ai.providers.groq_provider import GROQ_BASE_URL, GroqProvider
from higgins.ai.providers.openai_provider import OpenAIProvider
from higgins.core import telemetry
from higgins.core.config import Settings
from higgins.core.rate_limit import RateLimiter
from higgins.core.telemetry import CallRecord, Usage

logger = logging.getLogger(__name__)

M = TypeVar("M", bound=BaseModel)
T = TypeVar("T")

# A backup with less time left than this would only time out too.
MIN_BACKUP_SECONDS = 2.0
# After a 429, a provider rests for its retry-after time, capped here (default when not given).
MAX_REST_SECONDS = 60.0
DEFAULT_REST_SECONDS = 10.0


class AIBusyError(Exception):
    """The hourly cap on provider calls, shared by every visitor, is used up."""


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
    def __init__(
        self, settings: Settings, providers: list[Provider] | None = None, hourly_cap: RateLimiter | None = None,
    ) -> None:
        self.settings = settings
        self.providers = default_providers(settings) if providers is None else providers
        self.hourly_cap = hourly_cap
        self._cache: TTLCache[BaseModel] = TTLCache()

    @property
    def available(self) -> bool:
        return bool(self.providers)

    async def call(
        self, *, task: str, instructions: str, prompt_input: str, response_format: dict[str, Any],
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
        self._count(task)

        async def attempt(provider: Provider, timeout: float) -> tuple[M, Usage]:
            reply = await provider.reply(
                task=task, instructions=instructions, prompt_input=prompt_input,
                response_format=response_format, max_output_tokens=max_output_tokens, timeout=timeout,
            )
            return output.model_validate_json(reply.text), reply.usage

        result = await self._first_answer(task, time.monotonic() + self.settings.ai_timeout_seconds, attempt)
        if result is not None:
            self._cache.set(cache_key, result)
        return result

    async def turn(
        self, *, task: str, messages: list[dict[str, Any]], tools: list[dict[str, Any]],
        max_output_tokens: int, deadline: float,
    ) -> Turn | None:
        """One turn of a tool-calling conversation, or None if no provider answered by `deadline`
        (monotonic time, set by the caller for the whole conversation). Never cached: the
        conversation changes with every tool result."""
        if not self.available:
            return None
        self._count(task)

        async def attempt(provider: Provider, timeout: float) -> tuple[Turn, Usage]:
            turn = await provider.tool_turn(
                task=task, messages=messages, tools=tools, max_output_tokens=max_output_tokens, timeout=timeout,
            )
            return turn, turn.usage

        return await self._first_answer(task, deadline, attempt)

    def _count(self, task: str) -> None:
        """Use up one call from the hourly cap (after the cache, so only real calls count)."""
        if self.hourly_cap and not self.hourly_cap.allow("all"):
            logger.warning("AI %s: hourly cap reached", task)
            raise AIBusyError

    async def _first_answer(
        self, task: str, deadline: float, attempt: Callable[[Provider, float], Awaitable[tuple[T, Usage]]],
    ) -> T | None:
        """Try each provider in order until one answers, all within `deadline`. Every attempt is
        recorded (core/telemetry.py), with its token counts when the provider replied."""
        for index, provider in enumerate(self.providers):
            started = time.monotonic()
            if provider.resting_until > started:
                logger.info("AI %s: %s skipped, resting after a 429", task, provider.name)
                continue
            remaining = deadline - started
            if index and remaining < MIN_BACKUP_SECONDS:
                break
            timeout = min(provider.timeout, remaining)
            try:
                result, usage = await asyncio.wait_for(attempt(provider, timeout), timeout)
            except (OpenAIError, ValidationError, ValueError, TimeoutError) as exc:
                if isinstance(exc, RateLimitError):
                    provider.resting_until = time.monotonic() + _rest_seconds(exc)
                # The failure type only: never the prompt (personal data), the reply or the key.
                # Tokens a failed reply used aren't known here (an invalid JSON reply still used some).
                _record(task, provider, started, _failure(exc))
                continue
            _record(task, provider, started, "ok", usage)
            return result
        return None


def _record(task: str, provider: Provider, started: float, outcome: str, usage: Usage | None = None) -> None:
    ms = round((time.monotonic() - started) * 1000)
    telemetry.record(CallRecord(task, provider.name, provider.model(task), ms, outcome, usage or Usage()))


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
