"""Score one AI provider on fixed cases: python -m evals.run --provider groq [--task understand] [--limit N]

Each case goes through the app's real path (the feature class and StructuredAI) with only the
chosen provider in the chain, so the score is what the app would do. Today is pinned to
21 Oct 2026, as in the tests. The table prints and is saved to evals/results/. These are real
API calls: run by hand, never from pytest or CI.

The ask task runs the agent (run_agent) and checks its draft: which tools worked, what changed,
and that nothing changed where nothing was asked. One case makes one model call per turn.
"""

import argparse
import asyncio
import json
import logging
import re
import statistics
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any

from higgins.agent.draft import Draft
from higgins.agent.loop import AgentResult, run_agent
from higgins.ai.ideas import PRICES, IdeasGenerator
from higgins.ai.providers.chain import StructuredAI, default_providers
from higgins.ai.quotes import QuoteDraft, QuoteExtractor
from higgins.ai.schema import EventIdeas
from higgins.ai.understand import Interpretation, PlanInterpreter
from higgins.core.config import Settings
from higgins.engine.planner import build_plan
from higgins.schemas.requests import PlanRequest

TODAY = date(2026, 10, 21)
HERE = Path(__file__).resolve().parent
# Groq's free tier allows 30 requests a minute; a short gap keeps a run under it.
GAP_SECONDS = 2.5
MAX_TRIES = 3

PLANS = {
    "wedding": PlanRequest(
        event_type="wedding", event_date=date(2027, 12, 12), guests=250, budget_inr=1_500_000, city="Bengaluru",
        venue_type="venue", venue_includes_catering=True, priorities=["food", "photography"],
    ),
    "birthday": PlanRequest(
        event_type="birthday", event_date=date(2026, 11, 11), guests=40, budget_inr=12_000, city="Mysuru",
        venue_type="home", priorities=["decor", "entertainment"],
    ),
    "diwali": PlanRequest(
        event_type="community", event_date=date(2026, 11, 8), guests=500, budget_inr=150_000, city="Bengaluru",
        venue_type="outdoor", households=120,
    ),
}
# One line of a cases file, and what a task makes of it: the answer to await, and its checker.
Case = dict[str, Any]
Run = Callable[[Case], tuple[Awaitable[Any], Callable[[Any], list[str]]]]
LAVISH = re.compile(r"\b(?:luxury|luxurious|lavish|premium|designer|imported|extravagant)\b", re.IGNORECASE)
# Words that name each kind of vendor message, to catch a reply that names the wrong one.
KIND_WORDS = {"enquiry": ("enquir", "inquir"), "follow_up": ("follow",), "confirmation": ("confirm",)}
TASKS = ["understand", "quotes", "ideas", "ask"]


class Attempts(logging.Handler):
    """Collects StructuredAI's one log line per attempt: (task, provider, model, ms, outcome)."""

    def __init__(self) -> None:
        super().__init__()
        self.lines: list[tuple[Any, ...]] = []

    def emit(self, record: logging.LogRecord) -> None:
        if isinstance(record.args, tuple) and len(record.args) == 5:
            self.lines.append(record.args)


@dataclass
class Result:
    case: str
    passed: bool
    outcome: str
    ms: int
    problems: list[str] = field(default_factory=list)
    calls: int = 0  # provider attempts, failed ones included
    # The agent only:
    turns: int = 0
    tool_errors: int = 0  # tool calls answered with an error (a wrong amount, a made-up key)
    reply_mismatch: bool = False


def check_understand(case: Case, interpretation: Interpretation | None) -> list[str]:
    if interpretation is None:
        return ["no answer"]
    values = {k: sorted(v) if isinstance(v, list) else v for k, v in interpretation.values.items()}
    problems = [
        f"{name}: got {str(values.get(name))!r}, expected {str(want)!r}"
        for name, want in case["expect"].items()
        if str(values.get(name)) != str(sorted(want) if isinstance(want, list) else want)
    ]
    problems += [f"{name} should be unset, got {values[name]!r}" for name in case.get("absent", []) if name in values]
    if case.get("unclear") and not interpretation.unclear:
        problems.append("should have said what was unclear")
    return problems


def check_quote(case: Case, draft: QuoteDraft | None) -> list[str]:
    if case["expect"] is None:
        return [] if draft is None else ["should not read a quote here"]
    if draft is None:
        return ["no draft"]
    got = draft.model_dump(mode="json")
    return [
        f"{name}: got {got.get(name)!r}, expected {want!r}"
        for name, want in case["expect"].items()
        if _folded(got.get(name)) != _folded(want)
    ]


def _folded(value: Any) -> Any:
    """Text compared without case; anything else as it is."""
    return value.casefold() if isinstance(value, str) else value


def check_ideas(case: Case, ideas: EventIdeas | None, tight: bool) -> list[str]:
    if ideas is None:
        return ["no ideas"]
    text = " ".join(f"{i.title} {i.detail}" for cat in (ideas.themes, ideas.decor, ideas.food, ideas.entertainment)
                    for i in cat) + " " + ideas.triage_advice
    problems = [f"must-have not mentioned: {word}" for word in case["mention"] if word not in text.lower()]
    if price := PRICES.search(text):
        problems.append(f"mentions a price: {price.group(0)!r}")
    if tight and (lavish := LAVISH.search(text)):
        problems.append(f"lavish on a tight budget: {lavish.group(0)!r}")
    if case.get("triage_advice") and not ideas.triage_advice:
        problems.append("triage advice missing")
    return problems


def check_ask(case: Case, result: AgentResult) -> list[str]:
    """The agent's draft against the case: tools that worked, values, moves, messages, no change."""
    draft = result.draft
    problems = [] if result.stopped == "done" else [f"stopped: {result.stopped}"]
    worked = {run.name for run in result.tool_runs if run.outcome == "ok"}
    problems += [f"didn't use {tool}" for tool in case.get("tools", []) if tool not in worked]
    problems += [f"shouldn't use {tool}" for tool in case.get("forbid", []) if tool in worked]
    current = draft.current.model_dump(mode="json")
    problems += [
        f"{name}: got {current.get(name)!r}, expected {want!r}"
        for name, want in case.get("expect", {}).items() if current.get(name) != want
    ]
    if "moves" in case:
        new_moves = draft.current.progress.moves[len(draft.original.progress.moves):]
        moves = [[move.from_key, move.to_key, move.amount_inr] for move in new_moves]
        if moves != case["moves"]:
            problems.append(f"moves: got {moves}, expected {case['moves']}")
    if "messages" in case:
        messages = [[message.task_id, message.kind] for message in draft.messages]
        if messages != case["messages"]:
            problems.append(f"messages: got {messages}, expected {case['messages']}")
    if case.get("unchanged") and (changes := draft.changes()) is not None:
        problems.append(f"changed the plan: {'; '.join(changes.summary) or 'inputs differ'}")
    return problems


def reply_mismatch(result: AgentResult) -> bool:
    """The model's sentence names a kind of message other than the one drafted (seen live)."""
    drafted = {message.kind for message in result.draft.messages}
    reply = result.reply.lower()
    return bool(drafted) and any(
        word in reply for kind, words in KIND_WORDS.items() if kind not in drafted for word in words
    )


def runner(task: str, ai: StructuredAI) -> Run:
    """The case → (awaitable answer, checker) for one task, through the app's own feature class."""
    if task == "ask":
        return lambda case: (
            run_agent(ai, Draft(message=case["message"], today=TODAY, original=PLANS[case["plan"]])),
            lambda answer: check_ask(case, answer),
        )
    if task == "understand":
        interpreter = PlanInterpreter(ai)
        return lambda case: (
            interpreter.interpret(case["message"], PLANS.get(case.get("current", "")), TODAY),
            lambda answer: check_understand(case, answer),
        )
    if task == "quotes":
        extractor = QuoteExtractor(ai)

        def quote(case: Case) -> tuple[Awaitable[Any], Callable[[Any], list[str]]]:
            request = PLANS[case["plan"]]
            return extractor.extract(request, build_plan(request, TODAY), case["text"], TODAY), (
                lambda answer: check_quote(case, answer))
        return quote
    generator = IdeasGenerator(ai)

    def ideas(case: Case) -> tuple[Awaitable[Any], Callable[[Any], list[str]]]:
        request = PLANS[case["plan"]].model_copy(update={
            "preferences": case["preferences"], "must_haves": case["must_haves"],
        })
        plan = build_plan(request, TODAY)
        return generator.generate(request, plan), lambda answer: check_ideas(case, answer, plan.budget_level == "tight")
    return ideas


async def run_task(
    task: str, provider: str, attempts: Attempts, limit: int | None, only: list[str], gap: float | None = None,
) -> list[Result]:
    cases = [json.loads(line) for line in (HERE / "cases" / f"{task}.jsonl").read_text(encoding="utf-8").splitlines()]
    results = []
    for case in [c for c in cases if not only or c["id"] in only][:limit]:
        calls = 0  # every request sent for this case, retries included
        for _ in range(MAX_TRIES):
            # A fresh chain per case: no cache, and a 429 rest from the last case doesn't carry over.
            settings = Settings()
            chain = [p for p in default_providers(settings) if p.name == provider]
            attempts.lines.clear()
            pending, check = runner(task, StructuredAI(settings, chain))(case)
            started = time.monotonic()
            answer = await pending
            # The whole answer: for the agent, every turn and tool call; otherwise one call.
            ms = round((time.monotonic() - started) * 1000)
            calls += len(attempts.lines)
            outcome = attempts.lines[-1][4] if attempts.lines else "none"
            if outcome != "429":
                break
            print(f"  {case['id']}: rate-limited, waiting before a retry")
            await asyncio.sleep(chain[0].resting_until - time.monotonic())
        problems = check(answer)
        result = Result(case["id"], not problems, outcome, ms, problems, calls=calls)
        if isinstance(answer, AgentResult):
            result.turns = answer.turns
            result.tool_errors = sum(run.outcome != "ok" for run in answer.tool_runs)
            result.reply_mismatch = reply_mismatch(answer)
        results.append(result)
        print(f"  {'pass' if not problems else 'FAIL'} {case['id']} ({outcome}, {ms} ms, {result.calls} calls) "
              f"{'; '.join(problems)}")
        # Groq's free tier caps requests and tokens a minute: the gap grows with the calls a case
        # made, unless --gap sets it (the agent's turns are large, so its cases need a longer one).
        await asyncio.sleep(gap if gap is not None else GAP_SECONDS * max(1, result.calls))
    return results


def report(provider: str, model_names: dict[str, str], by_task: dict[str, list[Result]]) -> str:
    lines = [
        f"# Evals: {provider}, {date.today().isoformat()}", "",
        "| Task | Model | Passed | Invalid JSON | Other failures | p50 ms | p95 ms |",
        "|---|---|---:|---:|---:|---:|---:|",
    ]
    for task, results in by_task.items():
        ms = sorted(r.ms for r in results if r.outcome == "ok") or [0]
        invalid = sum(r.outcome == "invalid_json" for r in results)
        other = sum(r.outcome not in ("ok", "invalid_json") for r in results)
        p95 = ms[min(len(ms) - 1, round(0.95 * (len(ms) - 1)))]
        lines.append(
            f"| {task} | `{model_names[task]}` | {sum(r.passed for r in results)}/{len(results)} | {invalid} | {other} "
            f"| {round(statistics.median(ms))} | {p95} |"
        )
    if agent := by_task.get("ask"):
        lines += [
            "", "## Agent (ask)", "",
            "| Cases | Passed | Avg turns | Model calls | Failed tool calls | Reply names the wrong message |",
            "|---:|---:|---:|---:|---:|---:|",
            f"| {len(agent)} | {sum(r.passed for r in agent)}/{len(agent)} "
            f"| {statistics.mean(r.turns for r in agent):.1f} | {sum(r.calls for r in agent)} "
            f"| {sum(r.tool_errors for r in agent)} | {sum(r.reply_mismatch for r in agent)} |",
        ]
    failures = [(task, r) for task, results in by_task.items() for r in results if not r.passed]
    if failures:
        lines += ["", "## Failures", ""]
        lines += [f"- **{task} / {r.case}** ({r.outcome}): {'; '.join(r.problems)}" for task, r in failures]
    return "\n".join(lines) + "\n"


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--provider", choices=["groq", "openai"], required=True)
    parser.add_argument("--task", choices=TASKS, action="append")
    parser.add_argument("--limit", type=int, help="only the first N cases of each task")
    parser.add_argument("--case", action="append", default=[], help="only these case ids (repeatable)")
    parser.add_argument("--gap", type=float, help="seconds to wait after each case (default: 2.5 per call made)")
    args = parser.parse_args()
    partial = bool(args.limit or args.case)

    attempts = Attempts()
    logging.getLogger("higgins.ai.providers.chain").addHandler(attempts)
    logging.getLogger("higgins.ai.providers.chain").setLevel(logging.INFO)
    probe = next((p for p in default_providers(Settings()) if p.name == args.provider), None)
    if probe is None:
        raise SystemExit(f"No {args.provider.upper()}_API_KEY in .env")
    tasks = args.task or TASKS
    by_task = {}
    for task in tasks:
        print(f"{task}:")
        by_task[task] = await run_task(task, args.provider, attempts, args.limit, args.case, args.gap)

    text = report(args.provider, {task: probe.model(task) for task in tasks}, by_task)
    print("\n" + text)
    if not partial:  # a partial run would overwrite the full table
        # A run of some tasks only is saved apart, so it doesn't replace a full run's table.
        only = "" if set(tasks) == set(TASKS) else "-" + "-".join(tasks)
        out = HERE / "results" / f"{date.today().isoformat()}-{args.provider}{only}.md"
        out.parent.mkdir(exist_ok=True)
        out.write_text(text, encoding="utf-8")
        print(f"Saved {out.relative_to(HERE.parent)}")


if __name__ == "__main__":
    asyncio.run(main())
