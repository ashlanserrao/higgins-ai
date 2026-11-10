"""Eval history and the call cap (evals/history.py, evals/run.py), offline with the scripted model:
a prompt edit changes only its task's version, runs are compared case by case, and a capped run
never makes more calls than the cap."""

import pytest

from evals import history
from evals import run as eval_run
from higgins.agent import loop
from higgins.ai.providers.groq_provider import GroqProvider
from tests.agent.test_loop import SETTINGS, ScriptedModel, reply

pytestmark = pytest.mark.anyio


def test_a_prompt_edit_changes_only_its_tasks_version(monkeypatch):
    before = history.prompt_versions()
    assert before == history.prompt_versions()  # stable
    monkeypatch.setattr(loop, "INSTRUCTIONS", loop.INSTRUCTIONS + " Be brief.")
    after = history.prompt_versions()
    assert [task for task in before if before[task] != after[task]] == ["ask"]


def test_runs_are_compared_case_by_case():
    previous = {"version": "a", "model": "m", "cases": {"one": True, "two": False, "three": True}}
    current = {"version": "b", "model": "m", "cases": {"one": False, "two": True, "four": True}}
    assert history.changes(previous, current) == (["one"], ["two"])  # "three" and "four" weren't in both
    assert history.needs_eval(None, "a", "m")
    assert not history.needs_eval(previous, "a", "m")
    assert history.needs_eval(previous, "b", "m") and history.needs_eval(previous, "a", "other")


async def test_a_capped_run_never_exceeds_the_cap_and_is_recorded(monkeypatch, tmp_path):
    model = ScriptedModel([reply("Here's your plan.")] * 10)  # one call per case
    monkeypatch.setattr(eval_run, "default_providers", lambda _: [GroqProvider(SETTINGS, model, 5)])
    monkeypatch.setattr(history, "HISTORY", tmp_path / "history.jsonl")

    results, _, _ = await eval_run.evaluate("groq", ["ask"], smoke=True, max_calls=2, gap=0)

    assert len(model.calls) == 2  # the cap, not one call more
    assert [r.skipped for r in results["ask"]] == [False, False, True, True]
    [entry] = history.load()
    assert (entry["task"], entry["calls"], len(entry["cases"]), len(entry["skipped"])) == ("ask", 2, 2, 2)
    assert entry["version"] == history.prompt_versions()["ask"]
