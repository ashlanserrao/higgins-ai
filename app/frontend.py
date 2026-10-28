"""The built frontend (frontend/dist), served with a cache rule that fits how each file is named."""

from pathlib import PurePath

from starlette.responses import Response
from starlette.staticfiles import StaticFiles
from starlette.types import Scope

# Vite puts a content hash in every name under assets/, so a new build gets new URLs.
IMMUTABLE = "public, max-age=31536000, immutable"
# The page names this build's assets: revalidate it every time, so a deploy shows up at once.
REVALIDATE = "no-cache"
# Unhashed names (hm/, the favicon, theme-init.js) keep their URL across deploys.
SHORT = "public, max-age=3600"


def cache_control(path: str) -> str:
    """`path` as StaticFiles gives it: OS separators, "." for the site root."""
    path = PurePath(path).as_posix()
    if path.startswith("assets/"):
        return IMMUTABLE
    if path in (".", "index.html"):
        return REVALIDATE
    return SHORT


class FrontendFiles(StaticFiles):
    async def get_response(self, path: str, scope: Scope) -> Response:
        response = await super().get_response(path, scope)
        response.headers["Cache-Control"] = cache_control(path)
        return response
