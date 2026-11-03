"""Errors the engine raises for input that is well-formed but cannot be planned."""


class PlanInputError(ValueError):
    """E.g. a past event date, or a booking marked done in the future."""

    def __init__(self, message: str, field: str = "event_date") -> None:
        super().__init__(message)
        self.field = field
