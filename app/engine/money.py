"""Indian-style money: formatting (₹1,50,000 rather than ₹150,000) and reading amounts from text."""

import re
from typing import NamedTuple

_UNITS = {"l": 100_000, "lakh": 100_000, "lac": 100_000, "k": 1_000, "thousand": 1_000,
          "cr": 10_000_000, "crore": 10_000_000}
# A number, an optional unit, and no letter straight after ("5th" and "30 kids" aren't amounts).
_AMOUNT = re.compile(r"(\d+(?:,\d+)*(?:\.\d+)?)\s*(lakhs?|lacs?|l|k|thousand|crores?|cr)?(?![a-z])", re.IGNORECASE)


class Amount(NamedTuple):
    rupees: int
    unit: bool  # written with lakh, k or crore: the kind a model scales wrongly


def amounts_in(text: str) -> list[Amount]:
    """Every number in the text in rupees: "1.5L" is 1,50,000, "8k" is 8,000, "1,85,000" is 185000."""
    found = []
    for number, unit in _AMOUNT.findall(text):
        scale = _UNITS[unit.lower().rstrip("s")] if unit else 1
        found.append(Amount(round(float(number.replace(",", "")) * scale), bool(unit)))
    return found


def format_inr(amount: int) -> str:
    digits = str(abs(amount))
    if len(digits) > 3:
        head, tail = digits[:-3], digits[-3:]
        groups: list[str] = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        digits = ",".join(groups) + "," + tail
    return f"{'-' if amount < 0 else ''}₹{digits}"
