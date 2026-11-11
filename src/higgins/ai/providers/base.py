"""What every AI provider looks like to the chain. Each subclass turns one call into its own API."""

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from openai import AsyncOpenAI

from higgins.core.config import Settings
from higgins.core.telemetry import Usage


@dataclass(frozen=True)
class Reply:
    """A structured reply's text, and what the provider reports it used."""

    text: str
    usage: Usage = Usage()


@dataclass(frozen=True)
class ToolCall:
    """One tool the model asked to run. `arguments` is the JSON text exactly as the model sent it."""

    id: str
    name: str
    arguments: str


@dataclass(frozen=True)
class Turn:
    """One model turn in a tool-calling conversation: tool calls to run, or a final text reply."""

    text: str
    tool_calls: tuple[ToolCall, ...] = ()
    usage: Usage = Usage()


def _int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def usage_from(response: Any, headers: Mapping[str, str]) -> Usage:
    """Token counts from the body (Chat Completions or Responses naming), and what's left of
    the rate limit from the headers."""
    counts = getattr(response, "usage", None)
    return Usage(
        input_tokens=_int(getattr(counts, "prompt_tokens", None) or getattr(counts, "input_tokens", None)),
        output_tokens=_int(getattr(counts, "completion_tokens", None) or getattr(counts, "output_tokens", None)),
        tokens_left=_int(headers.get("x-ratelimit-remaining-tokens")),
        requests_left=_int(headers.get("x-ratelimit-remaining-requests")),
    )


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
        self, *, task: str, instructions: str, prompt_input: str, response_format: dict[str, Any],
        max_output_tokens: int, timeout: float,
    ) -> Reply:
        raise NotImplementedError

    def chat_options(self) -> dict[str, Any]:
        """Provider-specific Chat Completions options for tool turns."""
        return {}

    @staticmethod
    async def create(endpoint: Any, **request: Any) -> tuple[Any, Usage]:
        """Call an SDK endpoint (chat.completions or responses) through `with_raw_response`, so
        the rate-limit headers can be read: the parsed reply, and its usage."""
        raw = await endpoint.with_raw_response.create(**request)
        response = raw.parse()  # synchronous: the body has already been read
        return response, usage_from(response, raw.headers)

    async def tool_turn(
        self, *, task: str, messages: list[dict[str, Any]], tools: list[dict[str, Any]],
        max_output_tokens: int, timeout: float,
    ) -> Turn:
        """One turn of a tool-calling conversation, through Chat Completions.

        Both providers take the same message format here, so a backup can pick up a conversation
        another provider started.
        """
        response, usage = await self.create(
            self.client.chat.completions, model=self.model(task), messages=messages, tools=tools,
            max_completion_tokens=max_output_tokens, timeout=timeout, **self.chat_options(),
        )
        if not response.choices:
            raise ValueError("no choices in the reply")
        message = response.choices[0].message
        calls = tuple(
            ToolCall(id=call.id, name=call.function.name, arguments=call.function.arguments)
            for call in message.tool_calls or [] if call.type == "function"
        )
        if not calls and not (message.content or "").strip():
            raise ValueError("neither a tool call nor a reply")
        return Turn(text=message.content or "", tool_calls=calls, usage=usage)
