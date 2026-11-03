"""FastAPI app: the planning API plus the static frontend, wired together here.

Run with: uvicorn higgins.api.main:app
"""

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.gzip import GZipMiddleware

from higgins.api.errors import add_error_handlers
from higgins.api.middleware import guard_requests
from higgins.api.routes import ai, health, plan
from higgins.api.static import FrontendFiles
from higgins.core.logging import setup_logging

setup_logging()

# The React build (cd frontend && npm run build). The API works without it, e.g. in tests or on
# Render, where Vercel serves the site. Found from this file's place in the repo, so a local run
# needs the editable install (pip install -e .).
FRONTEND_DIR = Path(__file__).resolve().parents[3] / "frontend" / "dist"

app = FastAPI(title="Higgins AI", docs_url=None, redoc_url=None, openapi_url=None)
app.middleware("http")(guard_requests)
# Added last, so it wraps the guard: every response leaves compressed with the guard's headers
# kept, its own 411/413/429 included. Bodies under 1 KB aren't worth compressing.
app.add_middleware(GZipMiddleware, minimum_size=1000)
add_error_handlers(app)
for routes in (health, plan, ai):
    app.include_router(routes.router)

# Mounted last: "/" would otherwise catch the API's paths too.
if FRONTEND_DIR.is_dir():
    app.mount("/", FrontendFiles(directory=FRONTEND_DIR, html=True), name="frontend")
