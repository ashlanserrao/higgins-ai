"""OpenAI, the backup provider."""

from typing import Any

from higgins.ai.providers.base import Provider


class OpenAIProvider(Provider):
    """OpenAI's Responses API for structured replies, Chat Completions for tool turns; store=False
    in both, so nothing is kept on OpenAI's side."""

    name = "openai"

    def model(self, task: str) -> str:
        return self.settings.openai_model

    async def reply(
        self, *, task: str, instructions: str, prompt_input: str, response_format: dict[str, Any],
        max_output_tokens: int, timeout: float,
    ) -> str:
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
        text: str = response.output_text  # typed loosely by the SDK when options are passed as **kwargs
        return text

    def chat_options(self) -> dict[str, Any]:
        # Tool turns use Chat Completions, like Groq, so either provider can continue a conversation.
        options: dict[str, Any] = {"store": False}
        if self.settings.openai_reasoning_effort:
            options["reasoning_effort"] = self.settings.openai_reasoning_effort
        return options
