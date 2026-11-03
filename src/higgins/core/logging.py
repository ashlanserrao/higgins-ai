"""Logging for the app's own modules: one line per AI call, in uvicorn's style."""

import logging


def setup_logging() -> None:
    """uvicorn sets up only its own loggers. Show the app's (one line per AI call) in the same
    style, without turning on other libraries' INFO logs."""
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(levelname)s:     %(name)s %(message)s"))
    logging.getLogger("higgins").addHandler(handler)
    logging.getLogger("higgins").setLevel(logging.INFO)
