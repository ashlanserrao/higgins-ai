# Higgins AI: event planning assistant

[![CI](https://github.com/ashlanserrao/higgins-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/ashlanserrao/higgins-ai/actions/workflows/ci.yml)

**Live demo: [higgins-ai.vercel.app](https://higgins-ai.vercel.app)**. Press **Use the demo account** to sign in.

A GenAI-powered planning assistant that helps people organise **weddings, birthdays and community events**. One short form gives you a budget split, a timeline worked backward from the date, a vendor checklist with "book by" dates, a triage mode for late planners, and personalised theme, décor and food ideas.

![The Overview of a sample wedding plan: days to go, the budget breakdown and the next booking to make](frontend/public/sample-plan.webp)

**Quick start** (Python 3.11+, Node 22):

```bash
pip install -r requirements.txt
cd frontend && npm ci && npm run build && cd ..
uvicorn app.main:app        # open http://127.0.0.1:8000 and sign in with test / test
```

No API key needed: the full rules-based plan works without one. Keys only switch on the AI parts (see [Running it](#running-it)).

## Who it's for

**Priya, 29, a working professional in Bengaluru.** She isn't a planner, but family, friends and her housing society keep handing her events: her cousin's wedding, her son's 5th birthday, the society's Diwali celebration. She has a date, a rough guest count and a fixed budget, but doesn't know how to price vendors or when to book them.

She opens the assistant at two moments:

1. **The event was just decided.** "Where do I start, and can this budget work?" She wants a realistic plan in minutes that she can share the same day.
2. **The event is 2-3 weeks away and she's behind.** "What's still possible, what do I cut, what do I book today?"

She doesn't want a chatbot to interrogate. So the app is **one short form → one complete plan**.

## Approach: rules decide, AI personalises

| Part of the plan | Who decides | Why |
|---|---|---|
| Budget split, warnings, per-flat contribution | Rules engine | Numbers must be explainable, repeatable and never invented |
| Timeline, "book by" dates, triage | Rules engine | Dates come from lead-time arithmetic, not guesses |
| Themes, décor, food/menu, entertainment ideas | GenAI | Free-text taste ("pastel colours, my son loves dinosaurs") is what rules can't do well |
| Wording of triage advice | GenAI | Turns the rules' decisions into friendly advice, but cannot change them |

The engine (`app/engine/planner.py`) is a pure function, `build_plan(request, today)`: the same inputs on the same day always give the same plan. That is what makes share links and golden tests possible.

**How the rules work, in short:**

- **Budget split:** each event type has its own category table. *At home* moves the venue share to food and décor; *outdoor* adds a 5% tent and weather backup (plus a monsoon task for June-September); *venue includes catering* merges the two lines. Up to 3 priorities gain +5 points each, taken from non-priority lines. Contingency never drops below 5%, and lines always add up exactly to the budget.
- **Too-tight check:** budget per guest is compared with a minimum (metro: wedding ₹1,500, birthday ₹500, community ₹250), scaled by city size. Below the floor, the plan warns and suggests cost-saving swaps. The same ratio sets a budget level (*tight* → *generous*) that tells the AI how ambitious its ideas may be.
- **Timeline:** book-by date = event date − vendor lead time. Peak wedding season (Nov-Feb) adds 60 days to the venue and photographer.
- **Triage in three stages:** *on track*, *tight but doable* ("book this week") and *book today*. Only "book today" items switch on triage. Essentials (venue, permissions, caterer) are flagged, never cut; other items get a cheaper alternative.
- **Community events:** with a household count, the plan shows a per-flat contribution, which is how committees actually raise money.

All heuristics are named, commented constants in `app/engine/rules.py`.

## How it works

```
Browser (form, change previews, localStorage, share links)
   │ 1. POST /api/plan  (milliseconds)        │ 2. POST /api/ideas  (seconds, in background)
   ▼                                          ▼
validate (Pydantic) → rules engine     validate → rules engine → cache hit?
(pure, today in Asia/Kolkata) → plan        → Groq (5 s) ─fails→ OpenAI (rest of 15 s) → Pydantic
                                              ↳ no key / both fail → ideas: null
```

The plan appears as soon as the rules engine returns; the ideas card fills in a few seconds later.

**Stack:** FastAPI + Pydantic v2 backend; React 19, TypeScript, Vite, Tailwind and shadcn/ui frontend, served from the same origin with no third-party scripts or CDNs. No server-side accounts or database: events live in the browser's `localStorage`.

**Features:**

- **What if…:** one-tap or typed changes ("what if we invite 150 instead of 200?") show a before/after from the rules engine before anything is applied.
- **Ask Higgins:** plain-language intake and revisions. The AI reports the change; the server does the maths.
- **Vendor quotes:** paste a quote, get a checked draft that can't be accepted until the organiser verifies it.
- **Vendor messages:** ready-to-send enquiry, follow-up or confirmation, filled from the plan.
- **Share links:** inputs in the query string, ideas compressed in the `#fragment` (never sent to the server). Free-text preferences are never put in the link.
- **Print / PDF:** a one-page A4 family summary, safe in black and white.
- **Voice typing:** browser speech recognition on the longer text boxes.

### AI providers and guardrails

Every AI call goes through one class, `StructuredAI` (`app/ai/client.py`), which tries a provider chain within one 15 s budget.

- **Groq first, OpenAI as backup.** Groq (`openai/gpt-oss-20b`) usually answers in about a second. On a timeout, error (429, 5xx, bad key, rejected schema) or invalid JSON, OpenAI gets the rest of the budget. No key means AI is off and the rules-based plan still works in full.
- **The AI reports, code computes.** Relative changes ("add 40 guests"), dates counted from today ("in 2 weeks") and amounts ("1.5L" = ₹1,50,000) are worked out in code, and each reading is shown to the user. Vague dates are asked about, never guessed. Ideas never carry prices: one that quotes a price is dropped.
- **Untrusted input:** everything the user types or pastes is stripped of markup, fenced in tags, and the model is told to ignore instructions inside it. Output must pass a strict schema and Pydantic validation.
- **Graceful failure:** the three AI routes return `null`, not an error. The page always has a non-AI path.
- **Logging:** one line per call (task, provider, model, time, outcome). Never prompts, replies or keys.

### Evals: why Groq goes first

`evals/` holds 38 fixed cases (20 typed requests, 12 pasted quotes, 6 ideas requests). They make real API calls, so they run by hand: `python -m evals.run --provider groq`.

Results on 30 Oct 2026 ([Groq](evals/results/2026-10-30-groq.md), [OpenAI](evals/results/2026-10-30-openai.md)):

| Task | Groq `gpt-oss-20b` | Typical time | OpenAI `gpt-5-nano` | Typical time |
|---|---:|---:|---:|---:|
| Typed requests | 19/20 | 1.2 s | 16/20 | 3.1 s |
| Quotes | 10/12 | 1.1 s | 9/12 | 3.4 s |
| Ideas | 6/6 | 1.6 s | 6/6 | 5.0 s |

- **Groq was as good or better on every task, at about a third of the time.**
- **The evals caught a bug in our code:** for "change it to next Sunday", OpenAI also sent a 7-day move that overrode the computed Sunday. A named day now wins over a relative move, with a test.
- **Groq's three misses became code checks** (budgets and quote totals must be stated in the text; tax wording is read by code). All three cases now pass.

## Demo scenarios

Real engine output with `today = 2026-10-21`; each is also a golden test in `tests/test_engine.py`.

**1. Happy path: cousin's wedding.** Bengaluru · 250 guests · ₹15,00,000 · 12 Dec 2027 · venue includes catering · priorities: food, photography.
417 days to go, ₹6,000 per guest, level *generous*. Venue & catering gets ₹8,25,000 (55%), photo & video ₹2,25,000 (15%). Because December is peak season, the venue is due by **16 Jan 2027** and the photographer by **15 Feb 2027**. No triage.

**2. Tight budget: son's 5th birthday.** Mysuru (tier-2) · at home · 40 guests · ₹12,000 · 11 Nov 2026 · priorities: décor, activities.
21 days to go, ₹300 per guest, level *tight*. The plan warns that this is below the ₹400 minimum and offers swaps (homemade snacks with a bakery cake, DIY décor, self-run games). The AI is told the budget is tight, so its ideas stay low-cost.

**3. Triage: society Diwali celebration.** Bengaluru · outdoor · 500 attendees · 120 households · ₹1,50,000 · 8 Nov 2026.
18 days to go, per-flat contribution **₹1,250**. The venue is **book today** (45-day lead time, 18 days left); permissions, performers, sound & lighting and the caterer are **book this week**; security and the tent are on track. The venue is an essential, so it is never suggested as a cut.

## Running it

Requires Python 3.11+ and Node 22.

```bash
python -m venv venv
# Windows: venv\Scripts\activate    macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # optional: add GROQ_API_KEY and/or OPENAI_API_KEY

cd frontend && npm ci && npm run build && cd ..
uvicorn app.main:app
```

Open http://127.0.0.1:8000 and press **Use the demo account** (`test` / `test`). For frontend work, `npm run dev` in `frontend/` gives hot reload and forwards `/api` to port 8000.

**Without an API key** the questionnaire, budget, bookings, typed-in quotes, vendor messages and one-tap changes all work. Features that read free text (the "describe your event" box, Ask Higgins, pasted quotes, ideas) need a key.

| Variable | Default | Purpose |
|---|---|---|
| `GROQ_API_KEY` | *(empty)* | Enables Groq, tried first. Server-side only |
| `OPENAI_API_KEY` | *(empty)* | Enables OpenAI, the backup. Server-side only |
| `GROQ_MODEL` | `openai/gpt-oss-20b` | Groq model with strict JSON schema support |
| `OPENAI_MODEL` | `gpt-5-nano` | Cheapest current OpenAI model with Structured Outputs |
| `AI_TIMEOUT_SECONDS` | `15` | Total time per AI call, backup included |
| `RATE_LIMIT_PER_MINUTE` | `20` | AI requests per IP per minute |

More options (per-task models, reasoning effort, hourly spend cap) are documented in `.env.example`.

**Deploying.** The live site is on Vercel (`frontend/vercel.json`, root `frontend`), which forwards `/api/*` to the API on Render (`render.yaml`, New > Blueprint), so the browser sees one origin and the CSP stays `connect-src 'self'`. Vercel sends the same security headers as the API, and a test fails if they drift apart. API keys are Render secrets. Render runs
`uvicorn app.main:app --host 0.0.0.0 --port $PORT --proxy-headers --forwarded-allow-ips="*"`
so per-IP rate limits see real visitor IPs. Only use `"*"` when the app is reachable solely through that proxy. Render's free plan sleeps after 15 idle minutes, so an uptime monitor calls `/health` every 10 minutes.

## Testing

```bash
pip install -r requirements-dev.txt
ruff check && mypy && pytest          # backend: 165 tests

cd frontend
npm run lint && npm test              # frontend: 38 tests (Vitest)
npm run typecheck && npm run contrast
npm run build && npm run test:e2e     # end to end: 3 tests (Playwright)
```

Everything runs offline and free: both AI providers are faked (a guard blocks real calls even with keys in `.env`), and golden tests pin today to 21 Oct 2026. GitHub Actions runs it all on every push.

## Security

- API keys live only in the server's `.env`. The browser never calls an AI provider.
- Only the plan summary and what the user types or pastes reach an AI provider, never guest lists, accounts or progress. OpenAI calls use `store=False`.
- Strict input validation: typed fields, ranges, length limits, unknown fields rejected, 64 KB request cap, plain-language errors that never echo input.
- Untrusted text is fenced against prompt injection; AI output is schema-validated and rendered as text by React, never as HTML.
- Strict CSP (no `'unsafe-inline'`), plus `X-Frame-Options`, `Referrer-Policy: no-referrer` and HSTS over HTTPS.
- Per-IP rate limits, plus an hourly cap on total AI calls to limit spend.
- No personal data is stored on the server. **The sign-in is a demo, not a security boundary:** accounts live in the browser to keep events apart, not to protect them.

## Accessibility and performance

- Labelled inputs, full keyboard operation, visible focus, skip link, `aria-live` announcements, linked field errors.
- WCAG AA contrast in light and dark mode; status never relies on colour alone; phone-first layout with 44 px touch targets.
- Lighthouse (production build, 28 Oct 2026): **100 for Accessibility, Best Practices and SEO** on every page; Performance 98-99 on desktop, 78-85 on mobile.

## Assumptions

- **Heuristics are planning guidance, not market quotes.** Wedding numbers were checked against Indian planner guides and Bengaluru caterer listings (Oct 2026); birthday and community numbers are **unverified assumptions**, and only the constants would need to change.
- "Today" is India time (Asia/Kolkata). Other cities default to tier-2, and the form lets the user override this.
- The rate limiter and cache are in memory, so running several instances would need a shared store such as Redis.
- Budget ₹1,000 to ₹10 crore, 1-5,000 guests, events up to 3 years ahead.

## Future improvements

- Server-side accounts, so plans follow the organiser across devices and can be shared for editing
- A shared rate-limit store (such as Redis), so the API can run on several instances
- Regional cost data per city and vendor category, and verified benchmarks for birthdays and community events
- Expense tracking against the plan
- Vendor contact lists and WhatsApp reminders for book-by dates

## Project structure

```
app/          FastAPI + Pydantic v2
  engine/     Deterministic rules, no AI (rules.py, planner.py, progress, quotes, diff, messages)
  ai/         All AI calls: Groq, then OpenAI (client.py, ideas, quotes, understand, prompts)
  services/   Plain-language intake and revisions
evals/        Manual evals against real providers (cases, runner, saved results)
tests/        pytest suite (offline, AI faked)
frontend/     React + TypeScript + Vite + Tailwind + shadcn/ui
  src/features/   One folder per domain (overview, budget, tasks, vendors, guests, ideas, print…)
  e2e/            Playwright end-to-end test
```

API types in the frontend are generated from the backend's Pydantic models (`python scripts/export_openapi.py`, then `npm run gen:types` in `frontend/`).

## License

[MIT](LICENSE)