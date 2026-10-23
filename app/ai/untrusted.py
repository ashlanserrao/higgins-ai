"""Organiser-typed text (preferences, pasted quotes, requests) is data, never instructions.

It goes into prompts inside one pair of tags, with characters that could close the tag or
break the JSON around it removed.
"""

import re

_MARKUP = re.compile(r"[<>{}\[\]`\\]|[\x00-\x1f\x7f]")


def sanitize(text: str) -> str:
    """Remove markup and control characters, and collapse whitespace."""
    return " ".join(_MARKUP.sub(" ", text).split())


def fence(tag: str, text: str, empty: str) -> str:
    """`<tag>clean text</tag>`, or the `empty` placeholder inside the tags."""
    return f"<{tag}>{sanitize(text) or empty}</{tag}>"
