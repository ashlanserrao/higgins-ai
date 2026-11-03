"""What every AI provider looks like to the chain. Each subclass turns one call into its own API."""

from dataclasses import dataclass
from typing import Any

from openai import AsyncOpenAI

from higgins.core.config import Settings


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
    ) -> str:
        raise NotImplementedError

    def chat_options(self) -> dict[str, Any]:
        """Provider-specific Chat Completions options for tool turns."""
        return {}

    async def tool_turn(
        self, *, task: str, messages: list[dict[str, Any]], tools: list[dict[str, Any]],
        max_output_tokens: int, timeout: float,
    ) -> Turn:
        """One turn of a tool-calling conversation, through Chat Completions.

        Both providers take the same message format here, so a backup can pick up a conversation
        another provider started.
        """
        request: dict[str, Any] = {
            "model": self.model(task), "messages": messages, "tools": tools,
            "max_completion_tokens": max_output_tokens, "timeout": timeout, **self.chat_options(),
        }
        response = await self.client.chat.completions.create(**request)
        if not response.choices:
            raise ValueError("no choices in the reply")
        message = response.choices[0].message
        calls = tuple(
            ToolCall(id=call.id, name=call.function.name, arguments=call.function.arguments)
            for call in message.tool_calls or [] if call.type == "function"
        )
        if not calls and not (message.content or "").strip():
            raise ValueError("neither a tool call nor a reply")
        return Turn(text=message.content or "", tool_calls=calls)
