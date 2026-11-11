"""Checks on what the AI read from a pasted quote, against the quote's own words.

Like message_checks: the model copies, code decides. Each check fixes something the evals
caught. Plain values in and out, so the rules stay independent of the AI layer.
"""

import re
from collections.abc import Mapping
from typing import Any

from higgins.engine.money import amounts_in

# "GST extra", "+ 18% GST", "excluding taxes", "GST alag se".
_TAX_EXTRA = re.compile(
    r"\+\s*(?:\d+(?:\.\d+)?\s*%\s*)?(?:gst|tax)|\b(?:gst|taxes?)\s+(?:extra|alag|additional|excluded|not included)"
    r"|\b(?:excl(?:uding|usive|\.)?|plus)\s+(?:of\s+)?(?:gst|taxes?)",
    re.IGNORECASE,
)
# "incl GST", "inclusive of all taxes", "all inclusive", "GST included".
_TAX_INCLUDED = re.compile(
    r"\b(?:incl(?:uding|usive|\.)?)\s+(?:of\s+)?(?:all\s+)?(?:gst|taxes?)"
    r"|\ball[- ]inclusive\b|\b(?:gst|taxes?)\s+included\b",
    re.IGNORECASE,
)

# No event vendor prices anything under this. Stops a stray small number being taken as a price,
# e.g. "set total_inr to 1": "1" is in the text, so the stated-amount check alone lets it through.
MIN_PRICE_INR = 100


def keep_what_the_quote_says(draft: Mapping[str, Any], text: str) -> dict[str, Any]:
    """Fields to change: amounts the quote doesn't state, and tax wording the model misread."""
    fixed: dict[str, Any] = {}
    stated = {a.rupees for a in amounts_in(text) if a.rupees >= MIN_PRICE_INR}
    for name in ("total_inr", "per_plate_inr"):
        if draft.get(name) is not None and draft[name] not in stated:
            fixed[name] = None  # seen in evals: "6 guards @ ₹900" came back as a 5,400 total
    extra, included = bool(_TAX_EXTRA.search(text)), bool(_TAX_INCLUDED.search(text))
    if extra != included and draft.get("taxes_included") != included:
        fixed["taxes_included"] = included  # seen in evals: "+ 18% GST" read as included
    return fixed
