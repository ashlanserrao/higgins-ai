"""Shape of the AI's ideas: a strict JSON schema for the model, re-checked with Pydantic.

OpenAI strict mode does not enforce string lengths, so the Pydantic model adds the
limits and is the final gate before anything reaches the browser.
"""

from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

IDEA_CATEGORIES = ("themes", "decor", "food", "entertainment")
MAX_IDEAS_PER_CATEGORY = 4

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
Detail = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]


class Idea(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Title
    detail: Detail


IdeaList = Annotated[list[Idea], Field(min_length=1, max_length=MAX_IDEAS_PER_CATEGORY)]


class EventIdeas(BaseModel):
    model_config = ConfigDict(extra="forbid")

    themes: IdeaList
    decor: IdeaList
    food: IdeaList
    entertainment: IdeaList
    triage_advice: Annotated[str, StringConstraints(strip_whitespace=True, max_length=600)]


_IDEA_LIST_SCHEMA = {
    "type": "array",
    "minItems": 1,
    "maxItems": MAX_IDEAS_PER_CATEGORY,
    "items": {
        "type": "object",
        "properties": {"title": {"type": "string"}, "detail": {"type": "string"}},
        "required": ["title", "detail"],
        "additionalProperties": False,
    },
}

RESPONSE_FORMAT = {
    "type": "json_schema",
    "name": "event_ideas",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            **{category: _IDEA_LIST_SCHEMA for category in IDEA_CATEGORIES},
            "triage_advice": {"type": "string"},
        },
        "required": [*IDEA_CATEGORIES, "triage_advice"],
        "additionalProperties": False,
    },
}
