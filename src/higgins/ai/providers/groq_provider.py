"""Groq, tried first: it answered as well or better in the evals, in about a third of the time."""

from typing import Any

from higgins.ai.providers.base import Provider

GROQ_BASE_URL = "https://api.groq.com/openai/v1"


class GroqProvider(Provider):
    """Groq's Chat Completions, where strict JSON schemas are documented (its Responses API is in beta)."""

    name = "groq"

    def model(self, task: str) -> str:
        return self.settings.groq_task_models.get(task, self.settings.groq_model)

    async def reply(
        self, *, task: str, instructions: str, prompt_input: str, response_format: dict[str, Any],
        max_output_tokens: int, timeout: float,
    ) -> str:
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
        # No choices at all fails validation like any other bad reply, so the backup gets a turn.
        if not response.choices:
            return ""
        return response.choices[0].message.content or ""
