# Event Planning Assistant

A GenAI-powered planning assistant that helps people organise **weddings, birthdays and community events** with a budget split, a timeline worked backward from the date, a vendor checklist with "book by" dates, a triage mode for late planners, and personalised theme, décor and food ideas.

## Chosen vertical

**Event planning assistant** for the persona we call *the default organizer*.

Priya, 29, is a working professional in Bengaluru. She isn't a planner, but family, friends and her housing society keep handing her events: her cousin's wedding, her son's 5th birthday, the society's Diwali celebration. She has a date, a rough guest count and a fixed budget. She doesn't know how to price vendors or when to book them.

She opens the assistant at two moments:

1. **The event was just decided.** "Where do I start, and can this budget actually work?" She wants a realistic plan in minutes that she can share with family or the committee the same day.
2. **The event is 2–3 weeks away and she's behind.** "What's still possible, what do I cut, what do I book today?"

What she doesn't want is a chatbot she has to interrogate, or a tool that assumes she has a professional planner's knowledge. So the app is **one short form → one complete plan**.

## Approach and logic

The core design decision: **rules decide, AI personalises.**

| Part of the plan | Who decides | Why |
|---|---|---|
| Budget split, warnings, per-flat contribution | Rules engine | Numbers must be explainable, repeatable and never invented |
| Timeline, "book by" dates, triage | Rules engine | Dates come from lead-time arithmetic, not guesses |
| Themes, décor, food/menu, entertainment ideas | GenAI | Free-text taste ("pastel colours, my son loves dinosaurs") is what rules can't do well |
| Wording of triage advice | GenAI | Turns the rules' decisions into friendly advice, but cannot change them |

The engine (`app/engine/planner.py`) is a pure function, `build_plan(request, today)`. The same inputs on the same day always give the same plan, which is what makes share links and golden tests possible.

### Decision logic based on the user's context

1. **Base split per event type.** Each event type has its own category table (e.g. wedding: venue 20%, catering 30%, décor 12%, …).
2. **Venue type.** *At home* drops the venue line and gives its share to food and décor. *Outdoor* adds a 5% "tent & weather backup" line, plus a monsoon backup task if the date falls in June–September. *Venue includes catering* merges venue and catering into one line, as many Indian venues price per plate.
3. **Priorities (up to 3).** Each one gains +5 percentage points, taken proportionally from the non-priority categories. Contingency is never a donor, so it never drops below 5%.
4. **Rupees.** Lines are rounded down to ₹100. The leftover goes to contingency, so lines always add up exactly to the budget.
5. **Too-tight check.** Budget per guest is compared with a minimum per guest (metro: wedding ₹1,500, birthday ₹500, community ₹250), scaled by city size (metro ×1.0, tier-2 ×0.8, smaller town ×0.65). Below the floor, the plan warns and suggests cost-saving swaps.
6. **Budget level.** Budget per guest ÷ floor gives *tight* (< 1), *modest* (< 2), *comfortable* (< 4) or *generous* (≥ 4). This tells the AI how ambitious its ideas may be.
7. **Timeline.** Every vendor has an ideal lead time. Book-by date = event date − lead time. **Peak wedding season (Nov–Feb)** adds 60 days to the venue and photographer.
8. **Triage in three stages.** Each booking is **on track** (the full lead time is left), **tight but doable** (inside the lead time, but at least half of it left: "Book this week"), or **book today** (less than half left). Only "book today" items switch the plan into triage, so a wedding planned 5 months ahead reads as tight, not as an emergency. Essentials (venue, permissions, caterer) are flagged, never cut. Other "book today" items get a cheaper alternative (e.g. hired performers → resident talent).
9. **Community events.** If the number of households is given, the plan shows a per-flat contribution (budget ÷ households), which is how committees actually raise money.

## How the solution works

```
Browser (form, what-if sliders, localStorage, share links)
   │ 1. POST /api/plan  (milliseconds)        │ 2. POST /api/ideas  (seconds, in background)
   ▼                                          ▼
validate (Pydantic) → rules engine     validate → rules engine → cache hit?
(pure, today in Asia/Kolkata) → plan        → OpenAI Structured Outputs (15 s timeout) → Pydantic
                                              ↳ no key / timeout / invalid JSON → ideas: null
```

The plan is on screen as soon as the rules engine returns. The ideas card shows a loading placeholder and fills in a few seconds later.

- **Backend:** Python + FastAPI. `POST /api/plan` returns the rules-only `{plan, ai_available}` in milliseconds. `POST /api/ideas` takes the same inputs and returns `{ideas, ai_available}`. `ai_available` means an API key is configured; if one AI call fails, `ideas` is null and the page offers "Try again". `GET /api/options` lists the priority choices, so the form never duplicates the rules. `GET /health` is a health check.
- **AI layer (`app/ai/`):** the model gets the computed plan summary plus the organiser's preferences and must return JSON matching a strict schema. That JSON is then re-validated with Pydantic, including length limits. The plan's numbers are never taken from the AI. The model name comes from `.env`, so it can be swapped.
- **Frontend (`static/`):** plain HTML/CSS/JS modules, no build step, no third-party scripts.
- **No accounts, no database.** The latest plan and checklist ticks are kept in the browser's `localStorage`.
- **Sharing:** the link holds the plan inputs in the query string and the AI ideas, compressed, in the `#fragment`. Browsers never send the fragment to the server. Free-text preferences are never put in the link. Whoever opens the link sees the same budget and the same ideas, with the countdown and triage recalculated for *their* today. A "Plan created on …" note shows the original date.
- **What if…:** guest and budget sliders (¼× to 2× her own numbers) re-run the rules engine as she drags, with no AI call, so "what if we invite 150 instead of 200?" is answered instantly. Ideas made for the old numbers are marked as such, with a "Refresh ideas" button.
- **Download as PDF:** a print stylesheet, so the browser's "Save as PDF" gives a clean document.

## Demo scenarios

These are real engine output with `today = 2026-10-21`. Each is also a golden test in `tests/test_engine.py`.

### 1. Happy path: cousin's wedding
Bengaluru (metro) · 250 guests · ₹15,00,000 · 12 Dec 2027 · venue includes catering · priorities: food, photography

**417 days to go · ₹6,000 per guest (floor ₹1,500) · budget OK · level: generous**

| Line | Amount | Share |
|---|---:|---:|
| Venue & catering *(priority, merged)* | ₹8,25,000 | 55.0% |
| Photo & video *(priority)* | ₹2,25,000 | 15.0% |
| Décor | ₹1,28,500 | 8.6% |
| Attire & styling | ₹1,07,100 | 7.1% |
| Music & entertainment | ₹53,500 | 3.6% |
| Invitations & gifts | ₹53,500 | 3.6% |
| Logistics | ₹32,100 | 2.1% |
| Contingency | ₹75,300 | 5.0% |

Book the venue by **16 Jan 2027** and the photographer by **15 Feb 2027**. December is peak season, so both moved 60 days earlier. Then décor and makeup (Aug 2027), outfits and music (Sep 2027), invitations (Oct 2027). No triage.

### 2. Tight budget: son's 5th birthday
Mysuru (tier-2, not in the metro list) · at home · 40 guests · ₹12,000 · 11 Nov 2026 · priorities: décor, activities

**21 days to go · ₹300 per guest · level: tight**

> ⚠ ₹300 per guest is below the ₹400 minimum we suggest for a birthday party in a tier-2 city. Try the cost-saving swaps, a shorter guest list or a bigger budget.

No venue line, because its 20% moved to food and décor: Food & cake ₹4,400 · Décor ₹3,600 (priority, 30%) · Entertainment & activities ₹2,000 (priority) · Return gifts ₹700 · Photography ₹400 · Contingency ₹900. The swaps include homemade snacks with a bakery cake, DIY décor and self-run games. The AI is told the budget level is *tight*, so its ideas stay low-cost.

### 3. Triage: society Diwali celebration
Bengaluru · outdoor · 500 attendees · 120 households · ₹1,50,000 · 8 Nov 2026

**18 days to go · ₹300 per guest (above the ₹250 floor) · per-flat contribution ₹1,250**

> ⚠ Your event is 18 days away. Less than half the usual lead time is left for 1 booking: book it today.
>
> ⚠ 4 bookings are inside the usual lead time but still doable: book them this week.

- **Book today:** venue (45-day lead time, only 18 days left)
- **Book this week:** permissions, performers, sound & lighting, caterer (21–30-day lead times, at least half left)
- **On track:** security & first aid, tent (by 25 Oct 2026)
- **Cut or swap:** none, because the venue is an essential and is never suggested as a cut. Nine days out, performers and sound would also be "book today", and the plan would suggest resident talent and a basic PA package instead.
- A "Tent & weather backup" line is added (outdoor). There's **no** monsoon task, because November is outside June–September.

## Running it

Requires Python 3.11+.

```bash
python -m venv venv
# Windows: venv\Scripts\activate    macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # optional: add OPENAI_API_KEY for AI ideas
uvicorn app.main:app
```

Open http://127.0.0.1:8000. **No API key? It still works.** You get the full rules-based plan, and the ideas section says ideas are unavailable.

| Variable | Default | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | *(empty)* | Enables AI ideas. Server-side only, never sent to the browser |
| `OPENAI_MODEL` | `gpt-5-nano` | Cheapest current OpenAI model with Structured Outputs |
| `OPENAI_REASONING_EFFORT` | `minimal` | Keeps reasoning models fast. Leave empty for non-reasoning models |
| `AI_TIMEOUT_SECONDS` | `15` | One attempt, no retries |
| `RATE_LIMIT_PER_MINUTE` | `20` | AI idea requests per IP per minute |
| `PLAN_RATE_LIMIT_PER_MINUTE` | `120` | Rules-only plan requests (including slider updates) per IP per minute |

## Deploying

Behind a hosting proxy (Render, Cloud Run, a load balancer), tell uvicorn to trust the proxy's `X-Forwarded-For` header. Otherwise every visitor shares the proxy's IP and the per-IP rate limit applies to everyone together:

```bash
uvicorn app.main:app --host 0.0.0.0 --port $PORT --proxy-headers --forwarded-allow-ips="*"
```

Only use `--forwarded-allow-ips="*"` when the app is reachable *only* through that proxy; otherwise list the proxy's IPs. Set `OPENAI_API_KEY` as a platform secret, not in a committed file.

## Testing

```bash
pip install -r requirements-dev.txt
pytest
```

45 tests, offline and free (the OpenAI client is faked):

- **`test_engine.py`:** the three golden scenarios, the monsoon rule, the contingency floor with 3 priorities, an event tomorrow, past dates, invalid priorities, city tiers, Indian number formatting
- **`test_api.py`:** the plan over HTTP, plain-language 422 errors that don't echo input, 413 for oversized bodies, 411 for chunked bodies, 429 rate limiting per endpoint (the AI limit never blocks plans), security headers, options
- **`test_ai.py`:** valid ideas are attached and leave the plan unchanged. Bad JSON, extra fields, over-long text, empty lists and timeouts all fall back to the rules plan. Also: no key, caching, triage advice dropped outside triage, preference fencing

## Security

- The OpenAI key lives only in the server's `.env` (git-ignored). The browser never calls OpenAI.
- Strict input validation: typed fields, ranges, length limits, a city-name character check, unknown fields rejected, and a 10 KB request cap. API requests must declare `Content-Length`, so a chunked body can't bypass the cap. Validation errors are returned in plain language ("Please enter the event date.").
- **Prompt injection:** preferences are treated as untrusted data. Markup characters are stripped, the text is fenced in `<preferences>` tags, and the model is told to ignore any instructions inside. Output must pass a strict schema and Pydantic validation. The plan's numbers never come from the AI.
- Everything (AI output, shared links) is rendered with `textContent`, never `innerHTML`. Shared ideas are checked for shape and size before display.
- Security headers on every response: strict `Content-Security-Policy` (same-origin scripts and styles only), `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` (plan inputs in the URL never leak to other sites), `Permissions-Policy`.
- Per-IP rate limiting, strict for the AI endpoint and looser for the cheap rules endpoint (behind a proxy, see [Deploying](#deploying)). Errors never expose stack traces or submitted values. Logs record only the AI failure type, never prompts or keys.
- No personal data is stored on the server.

## Efficiency

- The rules engine runs in microseconds, so the plan appears immediately and the what-if sliders can re-run it freely (debounced, outdated responses discarded). Only the ideas need an AI call: one per plan, in the background, with no retries.
- An in-memory LRU cache (1 hour) means a repeated plan doesn't repeat the AI call. A shared link restores ideas from the URL instead of calling the AI again.
- The cheapest suitable model, minimal reasoning effort and capped output tokens.
- No frontend framework, no build step, no external requests. The whole app is a few small static files.

## Accessibility

- Every input has a `<label>`; radio and checkbox groups use `<fieldset>`/`<legend>`.
- Fully keyboard-operable, with a visible focus ring and a skip link.
- Results are announced through an `aria-live` status region, and focus moves to the plan heading.
- Field errors are linked with `aria-describedby` and `aria-invalid`.
- Colors meet WCAG AA contrast in both light and dark mode. Status never relies on color alone ("Book today", "(overdue)", "priority" tags). Touch targets are at least 44 px. The layout is phone-first.

## Assumptions

- **Heuristics are planning guidance, not market quotes.** All of them are named constants with comments in `app/engine/rules.py`.
- **Wedding numbers were checked** against Indian sources (Oct 2026):
  - The planner-guide ranges for wedding budgets are venue 20–28%, catering 18–25%, décor 10–16% and photography 7–10% ([Samaro](https://samaro.ai/blogs/how-to-plan-a-wedding-budget-india-2025), [Panache](https://panachehautecouture.com/blogs/indian-weddings/ultimate-guide-to-budget-planning-for-an-indian-wedding-costs-savings-tips)).
  - Bengaluru caterers list starting prices of about ₹200–500 per plate for veg and ₹300–650 for non-veg ([WedMeGood listings](https://www.wedmegood.com/profile/Kiran-Catering-Services-1979248)). That makes ₹1,500 per guest, with ₹450 per plate at 30%, a sensible floor.
  - Planning guides suggest booking the venue 10–12 months ahead, the photographer about 10 months and the caterer 6–10 months ([Junebug](https://junebugweddings.com/vendors/india/), [The Knot](https://www.theknot.com/content/indian-brides-wedding-planning)).
- **Birthday and community numbers are unverified assumptions.** No reliable published data was found. Only the constants would need to change.
- **City size:** a small built-in metro list. Other cities default to tier-2, and the form lets the user override this.
- **"Today" is India time** (Asia/Kolkata), so a plan made late at night doesn't shift by a day.
- **Single process:** the rate limiter and cache are in memory. Running several server instances would need a shared store such as Redis.
- **Shared plans are live:** they recalculate the countdown on the day they're opened.
- Amounts are whole rupees. Budget ₹1,000 to ₹10 crore, 1–5,000 guests, events up to 3 years ahead.

## Future improvements

- Accounts and saved plan history
- Live deployment (Render / Cloud Run) with a shared rate-limit store
- Regional cost data per city and vendor category, and verified benchmarks for birthdays and community events
- Multiple events per organiser, and expense tracking against the plan
- Vendor contact lists and WhatsApp reminders for book-by dates

## Project structure

```
app/
  main.py            FastAPI app, routes, error handling, security middleware
  models.py          Request/response schemas and input validation
  config.py          Settings from environment / .env
  security.py        Rate limiter and security headers
  engine/
    rules.py         All planning heuristics as named, commented constants
    planner.py       Pure planning engine: build_plan(request, today)
    money.py         Indian rupee formatting
  ai/
    ideas.py         OpenAI wrapper with timeout, cache and fallback
    prompt.py        Prompt building and preference sanitising
    schema.py        Strict JSON schema + Pydantic validation of AI output
    cache.py         Small thread-safe TTL/LRU cache
static/
  index.html, styles.css
  js/                app (controller), form, render, share, api, format
tests/               pytest suite (engine, API, AI layer)
```
