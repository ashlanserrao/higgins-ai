# 0005: A `src/higgins` package, organised by layer

**Status:** Accepted, 2 Nov 2026

## Context
The hackathon backend lived in a generic `app/` folder. The layers were already right (`engine/`,
`ai/`, `services/`), but the surface wasn't: `main.py` did five jobs (logging, middleware,
dependency wiring, error handlers, all the routes); request and response models, security and
static serving sat loose next to it; one `client.py` held every provider and the fallback chain;
and the package couldn't be installed, so scripts added the repo root to `sys.path`.

## Decision
- An installable package, `higgins`, in a `src/` layout, with dependencies read from
  `requirements.txt` by `pyproject.toml` (one list of pins).
- Folders by layer: `api/` (with `routes/`), `services/`, `ai/` (with `providers/`), `engine/`,
  `schemas/`, `core/`. Tests mirror them.
- Code shared by two layers moves below both: the rate limiter is used by the AI chain and the API,
  so it lives in `core/`; validation messages are used by a service and the API, so they live in
  `schemas/`.
- Folders are added when a feature needs them (agents, RAG, a database), not ahead of time.
- No behaviour changes: the exported OpenAPI schema stayed byte-for-byte identical, and every test
  passed unchanged.

## Consequences
- Each file has one job, and the layering rule is visible in the folder names.
- With a `src/` layout, tests run against the installed package, not whatever happens to be in the
  current directory.
- Local runs need `pip install -e .` once; the start command becomes
  `uvicorn higgins.api.main:app`.
- `main.py` finds `frontend/dist` from its own place in the repo, so serving the site needs the
  editable install. A container image (Phase 4) will settle this properly.
- Log lines now name `higgins.*` modules instead of `app.*`.
