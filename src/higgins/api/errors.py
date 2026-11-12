"""Every error leaves as plain-language JSON: {"error": ..., "fields": [...]}, never echoing input."""

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from higgins.ai.providers.chain import AIBusyError
from higgins.engine.errors import PlanInputError
from higgins.schemas.validation_messages import field_errors

logger = logging.getLogger(__name__)


def error_response(status: int, message: str, fields: list[dict[str, str]] | None = None) -> JSONResponse:
    body: dict[str, Any] = {"error": message}
    if fields:
        body["fields"] = fields
    return JSONResponse(status_code=status, content=body)


def add_error_handlers(app: FastAPI) -> None:
    def rejected(request: Request, message: str, fields: list[dict[str, str]]) -> JSONResponse:
        # Field names and our own messages only, never the values sent.
        logger.warning("Rejected %s: %s", request.url.path,
                       "; ".join(f"{f['field']}: {f['message']}" for f in fields) or message)
        return error_response(422, message, fields)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        return rejected(request, "Please check the highlighted fields.", field_errors(exc.errors()))

    @app.exception_handler(PlanInputError)
    async def plan_input_error(request: Request, exc: PlanInputError) -> JSONResponse:
        return rejected(request, str(exc), [{"field": exc.field, "message": str(exc)}])

    @app.exception_handler(AIBusyError)
    async def ai_busy(_: Request, __: AIBusyError) -> JSONResponse:
        return error_response(429, "The AI helper is busy right now. Please try again in a few minutes.")

    @app.exception_handler(Exception)
    async def unexpected_error(_: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled error", exc_info=exc)
        return error_response(500, "Something went wrong. Please try again.")
