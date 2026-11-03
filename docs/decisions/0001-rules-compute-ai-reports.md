# 0001: Rules compute the plan; AI only reports and personalises

**Status:** Accepted, Oct 2026

## Context
An event plan is mostly numbers and dates: a budget split, per-guest checks, book-by dates. LLMs
get arithmetic and calendar maths wrong, and give different answers to the same question. A plan
whose lines don't add up, or a wrong booking date, destroys trust.

## Decision
- A deterministic engine (`engine/planner.py`, a pure function of the inputs and `today`)
  computes every number and date.
- AI is used only where rules can't help: personalised ideas from free-text taste, and reading
  plain-language requests and pasted quotes.
- When AI reads text, it **reports** what it read ("guests_change: +40"); code does the
  arithmetic, resolves dates ("next Sunday") and checks every value against the user's own words
  (`engine/message_checks.py`, `engine/quote_checks.py`). Nothing is applied until the user
  confirms.

## Consequences
- Plans are explainable, repeatable and testable: golden tests pin exact outputs.
- The full plan works with no API key; AI features degrade to `null`.
- The heuristics in `rules.py` need real data to be trusted (birthday and community numbers are
  still assumptions).
- Each new way the model misreads text needs a new code check, found by evals.
