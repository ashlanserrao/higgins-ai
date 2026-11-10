"""Prompt versions and eval history, so a prompt change shows what it did to the score.

A task's prompt version is a short fingerprint of everything the model is sent apart from the
case itself: the instructions, the reply schema or tool descriptions, and the source of the
function that builds the input. Edit any of them and the version changes; nothing to bump.

Every eval run adds one line per task to results/history.jsonl: provider, model, version, and
each case's pass or fail. `changes()` compares two runs case by case.
"""

import hashlib
import inspect
import json
from datetime import date
from pathlib import Path
from typing import Any

from higgins.agent import loop, tools
from higgins.ai import prompt, quotes, schema, understand

HISTORY = Path(__file__).resolve().parent / "results" / "history.jsonl"
Entry = dict[str, Any]


def prompt_versions() -> dict[str, str]:
    """task → 8-character fingerprint of its prompt."""
    parts: dict[str, list[Any]] = {
        "understand": [understand.INSTRUCTIONS, understand.RESPONSE_FORMAT,
                       inspect.getsource(understand.build_understand_input)],
        "quotes": [quotes.INSTRUCTIONS, quotes.response_format(["category"]),
                   inspect.getsource(quotes.build_quote_input)],
        "ideas": [prompt.INSTRUCTIONS, schema.RESPONSE_FORMAT, inspect.getsource(prompt.build_prompt_input)],
        "ask": [loop.INSTRUCTIONS, tools.tool_specs(), inspect.getsource(loop.first_messages)],
    }
    return {
        task: hashlib.sha256(json.dumps(value, sort_keys=True, default=str).encode()).hexdigest()[:8]
        for task, value in parts.items()
    }


def load(path: Path | None = None) -> list[Entry]:
    path = path or HISTORY
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def append(entry: Entry, path: Path | None = None) -> None:
    path = path or HISTORY
    path.parent.mkdir(exist_ok=True)
    with path.open("a", encoding="utf-8") as file:
        file.write(json.dumps(entry, ensure_ascii=False) + "\n")


def last(entries: list[Entry], task: str, provider: str) -> Entry | None:
    """The latest run of `task` on `provider`, or None."""
    return next((e for e in reversed(entries) if e["task"] == task and e["provider"] == provider), None)


def needs_eval(previous: Entry | None, version: str, model: str) -> bool:
    """True when there's no earlier run, or the prompt or the model changed since it."""
    return previous is None or previous["version"] != version or previous["model"] != model


def changes(previous: Entry, current: Entry) -> tuple[list[str], list[str]]:
    """Cases both runs scored: (newly failing, newly passing)."""
    before, after = previous["cases"], current["cases"]
    common = [case for case in after if case in before]
    return ([c for c in common if before[c] and not after[c]], [c for c in common if after[c] and not before[c]])


def entry(
    task: str, provider: str, model: str, cases: dict[str, bool], skipped: list[str], source: str, **numbers: Any,
) -> Entry:
    return {
        "date": date.today().isoformat(), "task": task, "provider": provider, "model": model,
        "version": prompt_versions()[task], "cases": cases, "skipped": skipped, "source": source, **numbers,
    }
