"""Run what CI would, locally (nothing is pushed, so no CI runs): python scripts/check.py [--frontend] [--eval]

Always, at no cost: ruff, mypy and pytest. With --frontend: Biome, tsc and Vitest too.

With --eval (real Groq calls): for each AI task whose prompt or model changed since its last
recorded run, the task's smoke cases run, with a hard cap on calls for the whole check
(--max-calls, default 15). A task with no recorded run counts as changed. It prints what
changed per case and fails if any case started failing. Nothing changed: no calls at all.
"""

import argparse
import asyncio
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))  # so "evals" imports when run as a script

from evals import history  # noqa: E402
from evals.run import TASKS, evaluate, load_cases  # noqa: E402
from higgins.ai.providers.chain import default_providers  # noqa: E402
from higgins.core.config import Settings  # noqa: E402

PROVIDER = "groq"
DEFAULT_MAX_CALLS = 15


def run(name: str, command: list[str], cwd: Path = ROOT) -> bool:
    print(f"== {name}", flush=True)
    ok = subprocess.run(command, cwd=cwd).returncode == 0
    print(f"   {'ok' if ok else 'FAILED'}", flush=True)
    return ok


def changed_tasks() -> list[str]:
    """Tasks whose prompt or model differs from their last recorded run on PROVIDER."""
    provider = next((p for p in default_providers(Settings()) if p.name == PROVIDER), None)
    if provider is None:
        raise SystemExit(f"--eval needs {PROVIDER.upper()}_API_KEY in .env")
    versions, entries = history.prompt_versions(), history.load()
    changed = []
    for task in TASKS:
        previous = history.last(entries, task, PROVIDER)
        if history.needs_eval(previous, versions[task], provider.model(task)):
            reason = "no recorded run" if previous is None else f"was {previous['version']} on {previous['date']}"
            print(f"   {task}: changed ({versions[task]}, {reason})")
            changed.append(task)
        else:
            print(f"   {task}: unchanged since {previous['date'] if previous else '?'} ({versions[task]})")
    return changed


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--frontend", action="store_true", help="also lint, type check and test the frontend")
    parser.add_argument("--eval", action="store_true", help="smoke-eval changed prompts (real Groq calls)")
    parser.add_argument("--max-calls", type=int, default=DEFAULT_MAX_CALLS, help="hard cap on eval calls")
    parser.add_argument("--dry-run", action="store_true", help="with --eval: say what would run, call nothing")
    args = parser.parse_args()

    python = sys.executable
    results = [
        run("ruff", [python, "-m", "ruff", "check", "."]),
        run("mypy", [python, "-m", "mypy"]),
        run("pytest", [python, "-m", "pytest", "-q"]),
    ]
    if args.frontend:
        npm = shutil.which("npm") or "npm"
        frontend = ROOT / "frontend"
        results += [run(f"frontend {name}", [npm, "run", name], frontend) for name in ("lint", "typecheck", "test")]

    regressions: list[str] = []
    if args.eval:
        print("== evals (prompt or model changes)", flush=True)
        tasks = changed_tasks()
        if tasks and args.dry_run:
            cases = sum(len(load_cases(task, smoke=True)) for task in tasks)
            print(f"   would run {cases} smoke cases of {', '.join(tasks)}, at most {args.max_calls} calls (dry run)")
        elif tasks:
            print(f"   running the smoke cases of {', '.join(tasks)}, at most {args.max_calls} calls", flush=True)
            _, _, regressions = asyncio.run(
                evaluate(PROVIDER, tasks, smoke=True, max_calls=args.max_calls, source="check"))
            print(f"   {'newly failing: ' + ', '.join(regressions) if regressions else 'no case started failing'}")
        else:
            print("   nothing changed: no calls made")

    failed = not all(results) or bool(regressions)
    print("\nAll checks passed." if not failed else "\nSome checks FAILED.")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
