"""What every AI provider looks like to the chain. Each subclass turns one call into its own API."""

from typing import Any

from openai import AsyncOpenAI

from higgins.core.config import Settings


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
