"""The guard every request passes: body size, rate limits and security headers."""

from collections.abc import Awaitable, Callable

from fastapi import Request
from fastapi.responses import Response

from higgins.api.dependencies import RATE_LIMITERS
from higgins.api.errors import error_response
from higgins.api.security import HSTS, SECURITY_HEADERS
from higgins.core.config import settings


async def guard_requests(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
    response: Response
    if request.url.path.startswith("/api/"):
        content_length = request.headers.get("content-length")
        if request.method == "POST" and not content_length:
            # Requiring a declared length stops chunked bodies from bypassing the size cap.
            response = error_response(411, "Request must include a Content-Length header.")
        elif content_length and (not content_length.isdigit() or int(content_length) > settings.max_body_bytes):
            response = error_response(413, "Request is too large.")
        # Behind a proxy this is the real client IP only when uvicorn runs with
        # --proxy-headers --forwarded-allow-ips (see README > Deploying).
        elif (
            request.method == "POST"
            and (limiter := RATE_LIMITERS.get(request.url.path))
            and not limiter.allow(request.client.host if request.client else "unknown")
        ):
            response = error_response(429, "Too many requests. Please wait a minute and try again.")
        else:
            response = await call_next(request)
    else:
        response = await call_next(request)
    response.headers.update(SECURITY_HEADERS)
    # Behind a proxy, the scheme is the visitor's only with --proxy-headers (see README > Deploying).
    if request.url.scheme == "https":
        response.headers["Strict-Transport-Security"] = HSTS
    return response
