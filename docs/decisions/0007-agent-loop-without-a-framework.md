# 0007: The agent loop is plain Python, not LangGraph

**Status:** Accepted, 3 Nov 2026

## Context
"Ask Higgins" becomes a tool-calling agent (Phase 1). The model calls tools on a draft of the
plan until it can reply. LangGraph was the first choice for the loop. Weighed against this
agent's needs, it brought more than it gave:
- **Dependencies:** `pip install --dry-run langgraph==1.2.19` adds 22 packages, including
  `langchain-core`, `langsmith`, `requests` and `websockets`. The backend has 5 direct
  dependencies.
- **Unused strengths:** checkpoints, human-in-the-loop interrupts and multi-agent graphs. The
  agent handles one message with 4 tools and at most 6 turns. Plans live in the browser (0003)
  and the organiser confirms in the page, so nothing needs saving between requests.
- **API churn:** 0.0.x to 1.x in about two years, with breaking changes.
- **LangChain's model wrappers would bypass the provider chain:** the hourly cap, the shared
  time budget, the rest after a 429, the Groq-to-OpenAI fallback and logs that never hold a
  prompt.

## Decision
- `agent/loop.py` is a plain `while` loop: ask the model for one turn, run any tool calls,
  send the results back, and stop on a text reply or a guardrail.
- Model turns go through the existing chain (`StructuredAI.turn`), which shares one fallback
  routine with structured calls. Both providers use Chat Completions for tool turns, so the
  backup can continue a conversation the first provider started.
- Guardrails:
  - a 6-turn cap
  - one time budget for the whole request (`AGENT_TIMEOUT_SECONDS`, 25 s)
  - every turn counts against the hourly cap
  - one log line per turn, per tool call and per request, never the prompt
- The tools (`agent/tools.py`) have no framework code. If a later need, such as multi-turn
  chat with saved state, calls for a framework, only `loop.py` changes.

## Consequences
- No new dependencies. The loop is about 40 lines, and the tests drive it directly with a
  scripted fake model.
- Saved state, step streaming and graph drawings aren't built in. We'd write them ourselves,
  or revisit this decision if Phase 4 (accounts, stored plans) needs them.
- Tracing (Phase 2) needs a few manual spans in place of a framework integration.
