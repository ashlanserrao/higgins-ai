# Architecture

Higgins AI turns one short form into an event plan. A deterministic rules engine computes every
number and date; AI only personalises (ideas) and reads free text (typed requests, pasted quotes).
The decisions behind this are in [decisions/](decisions/).

## Layers

```
            browser (React, on Vercel)
                      │  /api/* (Vercel forwards to Render: one origin)
                      ▼
api/        FastAPI app: routes, request guard, error handlers, dependencies
   │
   ├──► services/   joins AI reading and the engine (typed requests → before/after)
   │
   ├──► ai/         AI features; providers/ is the only code that calls an LLM
   │
   └──► engine/     pure planning rules: no AI, no network, no clock
            ▲
schemas/    request, plan and response models, shared by every layer
core/       settings, logging, rate limiting
```

**The dependency rule:** arrows only point down. `engine/` imports nothing from `ai/` or `api/`,
so the plan works with no API key, and engine tests are fast and exact. `ai/` never imports
`api/`. Anything two layers need (settings, rate limiting, schemas) lives below both.

## Where things live (`src/higgins/`)

| Folder | What it holds |
|---|---|
| `engine/` | `planner.py` (`build_plan(request, today)`, a pure function), `rules.py` (every heuristic as a named constant), progress, quotes, money moves, diffs, vendor messages, and the checks that compare an AI reading with the user's own words |
| `ai/` | One module per AI feature (`ideas`, `quotes`, `understand`), the ideas prompt and schema, and `untrusted.py` (fencing user text against prompt injection) |
| `ai/providers/` | `chain.py` (`StructuredAI`: cache, hourly cap, one time budget, fallback, validation, logging; `turn` for the agent's tool-calling turns), `base.py`, `groq_provider.py`, `openai_provider.py`, `cache.py` |
| `services/` | `understand.py`: turns an AI reading into form values or a validated revision with its before/after |
| `agent/` | Ask Higgins as an agent (Phase 1, in progress). `propose.py`: runs the agent and turns its working copy into the `POST /api/ask` proposal. `loop.py`: the model calls tools until it can reply, within a turn cap and one time budget (no framework, [decision 0007](decisions/0007-agent-loop-without-a-framework.md)). `tools.py`: the tools it can call, each running the engine on a working copy (`draft.py`). Same level as `services/`: it uses `ai/` and `engine/`, and only `api/` uses it |
| `schemas/` | `common.py` (shared types), `requests.py` (what the browser sends), `plan.py` (what the engine returns), `responses.py` (route bodies), `validation_messages.py` |
| `api/` | `main.py` (wiring only), `routes/` (health, rules-only plan routes, AI routes), `middleware.py`, `errors.py`, `dependencies.py`, `security.py` (headers), `static.py` (serving the built site) |
| `core/` | `config.py` (settings from the environment), `logging.py`, `rate_limit.py`, `telemetry.py` (one record per AI call and agent tool run, grouped into traces: tokens, list-price cost, rate limit left; logged, and passed to listeners such as the evals), `langfuse.py` (a listener that sends the records to Langfuse as OpenTelemetry spans, numbers only, when its keys are set) |

Tests mirror the layers: `tests/engine/`, `tests/ai/`, `tests/agent/`, `tests/api/`, `tests/core/`.

## The frontend (`frontend/src/`)

The same rule, one layer stack:

```
pages/        the lazy-loaded screens: onboarding, dashboard (App.tsx picks the screen)
features/     one folder per section of the app (overview, budget, tasks, vendors, shell…)
components/   shared UI: ui/ (shadcn primitives) and app/ (dialogs and notes several features open)
state/        the planner store and auth (React context)
hooks/        generic hooks: media queries, focus return, speech input
lib/          no React tree: api/ (client + types generated from OpenAPI), storage/ (browser
              storage, accounts, share links), plan helpers (tasks, guests), format, labels
```

Imports only point down, and **Biome checks it** (`frontend/biome.jsonc`): `npm run lint` fails
on an upward import, and on `../`, so a relative path can't step around the rule. Code used by one
feature lives in that feature (`features/shell/ask-hooks.ts`); code used by several lives lower.
`components/app/use-change-preview.tsx` is a hook, but it renders a dialog and reads the store, so
it stays with the dialog instead of going to `hooks/`. See [decision 0006](decisions/0006-frontend-layers-checked-by-lint.md).

## Three requests

**`POST /api/plan`** (milliseconds): the guard checks size and the per-IP limit → Pydantic
validates the body → `build_plan(request, today_in_india())` → the plan, gzipped, with security
headers.

**`POST /api/ideas`** (seconds, fetched after the plan is on screen): same checks → `build_plan`
→ `IdeasGenerator` builds the prompt from the plan's decisions and the user's fenced text →
`StructuredAI.call`: cache, then the hourly cap, then Groq (up to 5 s), then OpenAI with what's
left of 15 s → Pydantic → ideas that quote a price are dropped → ideas, or `null` if the AI
can't answer.

**`POST /api/ask`** (seconds; its own limit of 6 per IP per minute): same checks → a `Draft` of
the plan → `run_agent`: up to 6 model turns in one 25 s budget, each through `StructuredAI.turn`
(the hourly cap and fallback included); every tool call runs the engine on the draft → the
proposal from the draft: the edited request, the new plan, the before/after and the engine's
vendor messages, plus the model's short reply. If the agent stopped early after doing some work,
`partial` is true and the work is kept for the organiser to confirm or discard. Nothing is
applied on the server.
