"""Vendor quotes: compare them with the plan's estimates, and re-budget when one is accepted.

An accepted quote replaces the estimate for its budget line. The difference is absorbed in
a fixed order: savings go to contingency; overruns come from contingency first, then from
the other unconfirmed lines in proportion (each giving up at most MAX_REBALANCE_CUT), and
anything still left is reported as over budget.
"""

import math
from datetime import date

from app.engine import rules
from app.engine.errors import PlanInputError
from app.engine.money import format_inr
from app.engine.wording import join_names
from app.models import BudgetCut, BudgetLine, PlanRequest, Quote, QuoteComparison, Rebalance


def quotes_in_plan(request: PlanRequest, lines: list[BudgetLine]) -> tuple[list[Quote], list[str]]:
    """Quotes for this plan's budget lines, and the ids of the others (e.g. a venue at home)."""
    keys = {line.key for line in lines}
    quotes = request.progress.quotes
    return [q for q in quotes if q.category in keys], sorted(q.id for q in quotes if q.category not in keys)


def effective_total(quote: Quote, guests: int) -> tuple[int | None, bool]:
    """The quote's total, or per-plate price × guests (flagged as calculated)."""
    if quote.total_inr is not None:
        return quote.total_inr, False
    if quote.per_plate_inr is not None:
        return quote.per_plate_inr * guests, True
    return None, False


def _confirmed_total(quote: Quote, guests: int) -> int:
    """An accepted quote's cost. The Quote model already refuses an accepted quote without a price."""
    total, _ = effective_total(quote, guests)
    if total is None:
        raise PlanInputError("A quote needs a price before it can be accepted.", field="progress")
    return total


def compare_quotes(
    request: PlanRequest, quotes: list[Quote], lines: list[BudgetLine], today: date
) -> dict[str, list[QuoteComparison]]:
    """Per category, cheapest first; quotes without a price go last."""
    estimates = {line.key: line.estimate_inr for line in lines}
    comparisons: dict[str, list[QuoteComparison]] = {}
    for quote in quotes:
        total, calculated = effective_total(quote, request.guests)
        comparisons.setdefault(quote.category, []).append(QuoteComparison(
            quote_id=quote.id, vendor=quote.vendor, total_inr=total, calculated=calculated,
            per_guest_inr=None if total is None else total // request.guests,
            capacity=capacity(quote, request.guests),
            vs_estimate_inr=None if total is None else total - estimates[quote.category],
            missing=_missing(quote), accepted=quote.accepted_on is not None,
            expired=quote.valid_until is not None and quote.valid_until < today,
        ))
    for options in comparisons.values():
        options.sort(key=lambda c: (c.total_inr is None, c.total_inr or 0, c.quote_id))
    return comparisons


def capacity(quote: Quote, guests: int) -> str:
    if quote.guests_covered is None:
        return "not_stated"
    return "fits" if quote.guests_covered >= guests else "too_small"


def _missing(quote: Quote) -> list[str]:
    checks = [
        ("price", quote.total_inr is None and quote.per_plate_inr is None),
        ("guests covered", quote.guests_covered is None),
        ("taxes", quote.taxes_included is None),
        ("inclusions", not quote.inclusions),
        ("valid until", quote.valid_until is None),
    ]
    return [name for name, is_missing in checks if is_missing]


def apply_quotes(
    request: PlanRequest, lines: list[BudgetLine], quotes: list[Quote], today: date
) -> tuple[list[BudgetLine], Rebalance | None]:
    """Confirm the accepted quotes' lines and re-budget the rest so lines sum to the budget."""
    accepted = {q.category: q for q in quotes if q.accepted_on}
    if not accepted:
        return lines, None
    labels = {line.key: line.label for line in lines}
    for key, quote in accepted.items():
        if quote.accepted_on and quote.accepted_on > today:  # always set here; narrows the type
            raise PlanInputError(
                f"The {labels[key].lower()} quote can't be accepted on a future date.", field="progress",
            )

    amounts = {line.key: line.amount_inr for line in lines}
    confirmed = {key: _confirmed_total(quote, request.guests) for key, quote in accepted.items()}
    change = sum(confirmed[key] - amounts[key] for key in confirmed)
    amounts |= confirmed

    from_contingency, over_budget = 0, 0
    cuts: dict[str, int] = {}
    if change <= 0:
        amounts["contingency"] -= change
    else:
        from_contingency = min(change, amounts["contingency"])
        amounts["contingency"] -= from_contingency
        rest = change - from_contingency
        if rest:
            donors = {k: v for k, v in amounts.items() if k not in confirmed and k != "contingency"}
            cuts, over_budget = _cut_in_proportion(donors, rest)
            for key, cut in cuts.items():
                amounts[key] -= cut
            # Cuts are whole ₹100s, so they can overshoot by under ₹100: that goes to contingency.
            amounts["contingency"] += sum(cuts.values()) + over_budget - rest

    new_lines = [
        line.model_copy(update={
            "amount_inr": amounts[line.key],
            "percent": round(amounts[line.key] * 100 / request.budget_inr, 1),
            **({"source": "confirmed", "quote_id": accepted[line.key].id} if line.key in accepted else {}),
        })
        for line in lines
    ]
    budget_cuts = [BudgetCut(key=k, label=labels[k], amount_inr=v) for k, v in cuts.items()]
    return new_lines, Rebalance(
        change_inr=change, from_contingency_inr=from_contingency, cuts=budget_cuts,
        over_budget_inr=over_budget,
        explanation=_explain(change, from_contingency, budget_cuts, over_budget, amounts["contingency"], request),
    )


def _cut_in_proportion(donors: dict[str, int], amount: int) -> tuple[dict[str, int], int]:
    """Take `amount` from the donors in proportion to their size, in whole ₹100s, each giving
    at most MAX_REBALANCE_CUT of its amount. Returns the cuts and what they couldn't cover."""
    step = rules.ROUNDING_INR
    caps = {k: int(v * rules.MAX_REBALANCE_CUT) // step for k, v in donors.items()}
    if amount >= sum(caps.values()) * step:
        return {k: c * step for k, c in caps.items() if c}, amount - sum(caps.values()) * step

    units = math.ceil(amount / step)
    pool = sum(donors.values())
    shares = {k: units * v / pool for k, v in donors.items()}
    cuts = {k: math.floor(share) for k, share in shares.items()}
    # Hand the remaining ₹100s to the largest fractional shares first (caps leave enough room).
    order = sorted(donors, key=lambda k: (cuts[k] - shares[k], k))
    leftover = units - sum(cuts.values())
    while leftover:
        for key in order:
            if leftover and cuts[key] < caps[key]:
                cuts[key] += 1
                leftover -= 1
    return {k: c * step for k, c in cuts.items() if c}, 0


def _explain(
    change: int, from_contingency: int, cuts: list[BudgetCut], over_budget: int,
    contingency: int, request: PlanRequest,
) -> str:
    if change == 0:
        return "Your accepted quotes match the estimates."
    if change < 0:
        return (
            f"Your accepted quotes came in {format_inr(-change)} under the estimates. "
            f"The difference went to contingency, which is now {format_inr(contingency)}."
        )
    text = f"Your accepted quotes came in {format_inr(change)} over the estimates."
    taken = join_names([f"{cut.label} {format_inr(-cut.amount_inr)}" for cut in cuts]) if cuts else ""
    if not cuts and not over_budget:
        text += f" Contingency covers it and is now {format_inr(contingency)}."
    elif from_contingency:
        text += f" Contingency covered {format_inr(from_contingency)}"
        text += f", and the rest came from the other categories: {taken}." if cuts else "."
    elif cuts:
        text += f" It came from the other categories: {taken}."
    if over_budget:
        text += (
            f" That still leaves you {format_inr(over_budget)} over budget: raise the budget to "
            f"{format_inr(request.budget_inr + over_budget)}, or look for a cheaper quote."
        )
    return text


def quote_bookings(request: PlanRequest, quotes: list[Quote]) -> dict[str, date]:
    """Tasks booked by accepted quotes, with the day each quote was accepted."""
    line_tasks = rules.LINE_TASKS[request.event_type] | rules.EXTRA_LINE_TASKS
    return {
        line_tasks[q.category]: q.accepted_on
        for q in quotes
        if q.accepted_on and q.category in line_tasks
    }
