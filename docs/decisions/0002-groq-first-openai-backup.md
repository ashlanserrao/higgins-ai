# 0002: Groq first, OpenAI as the backup

**Status:** Accepted, 30 Oct 2026

## Context
The app started on OpenAI (`gpt-5-nano`). Replies took 3-5 s, and a single provider is a single
point of failure. Groq serves `openai/gpt-oss-20b` with strict JSON schemas, usually in about a
second.

## Decision
- Every AI call goes through one class, `StructuredAI` (`ai/providers/chain.py`), which tries
  providers in order inside one 15 s budget: Groq first (up to 5 s), then OpenAI with what's left.
- Any failure (timeout, 429, 5xx, bad key, invalid JSON, failed validation) hands over to the
  next provider. After a 429, a provider rests for its retry-after time.
- The order was chosen with evals (38 fixed cases, `evals/`): Groq scored as well or better on
  every task (19/20, 10/12, 6/6 against 16/20, 9/12, 6/6) at about a third of the time.

## Consequences
- Faster replies and no single point of failure.
- Two providers' quirks to handle (Chat Completions for Groq, the Responses API for OpenAI),
  hidden behind one `Provider` interface.
- The cache key includes the whole chain, so changing a model invalidates cached answers.
- Evals have to be re-run when either model changes.
