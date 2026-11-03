# 0004: One origin: Vercel forwards `/api` to Render

**Status:** Accepted, Oct 2026

## Context
The static site is best served from a CDN (Vercel); the FastAPI backend needs a Python host
(Render). Calling the API on a second domain would need CORS, and the Content Security Policy would
have to allow that domain.

## Decision
- Vercel serves `frontend/` and rewrites `/api/*` to the Render service (`frontend/vercel.json`),
  so the browser only ever talks to one origin.
- Vercel sends the same security headers as the API; a test (`tests/api/test_api.py`) fails if
  the two drift apart.
- uvicorn runs with `--proxy-headers --forwarded-allow-ips="*"`, so per-IP rate limits see the
  visitor's IP. This is only safe because the API is reachable solely through the proxy.

## Consequences
- No CORS, and the CSP keeps `connect-src 'self'`.
- One extra network hop per API call (about 0.4-0.6 s measured in total).
- Render's free plan sleeps after 15 idle minutes; an uptime monitor pings `/health`.
