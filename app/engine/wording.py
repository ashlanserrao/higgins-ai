"""Small helpers for the engine's plain-language warnings."""

from datetime import date


def bookings(count: int) -> str:
    return "1 booking" if count == 1 else f"{count} bookings"


def them(count: int) -> str:
    return "it" if count == 1 else "them"


def join_names(names: list[str]) -> str:
    """["a", "b", "c"] → "a, b and c"."""
    return names[0] if len(names) == 1 else f"{', '.join(names[:-1])} and {names[-1]}"


def day(value: date) -> str:
    """2026-10-30 → "30 Oct 2026" (no platform-specific strftime flags)."""
    return f"{value.day} {value:%b %Y}"


def capitalise(text: str) -> str:
    """Upper-case the first letter only ("music / DJ" → "Music / DJ")."""
    return text[:1].upper() + text[1:]
