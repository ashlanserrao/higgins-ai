# 0003: No server-side database: plans live in the browser

**Status:** Accepted, Oct 2026 (to revisit in Phase 4 of the roadmap)

## Context
A hackathon build with one organiser per event. Storing guest lists and plans on a server means
accounts, a database, backups and personal data to protect.

## Decision
- The browser keeps events in `localStorage` and sends the full state (inputs and progress) with
  each request. The server is stateless apart from in-memory rate limits and the AI cache.
- The sign-in is a demo: it keeps events apart in one browser, not a security boundary.

## Consequences
- No personal data is stored on the server, and there's no database to run.
- Every request is self-contained, which keeps the API simple to test.
- Plans don't follow the organiser across devices, and can't be edited together.
- Rate limits and the cache are per process; several instances would need Redis.
