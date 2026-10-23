"""Money the organiser moves between budget lines, applied before any quote is accepted."""

from app.engine import rules
from app.engine.errors import PlanInputError
from app.engine.money import format_inr
from app.models import BudgetLine, PlanRequest


def apply_moves(
    request: PlanRequest, lines: list[BudgetLine], confirmed: set[str]
) -> tuple[list[BudgetLine], list[int]]:
    """Move money between lines; the moved amounts become the new estimates.

    A move that touches a line not in this plan, or one a quote has confirmed (its amount is
    the quote's), is skipped: its position is returned so the page can say so.
    """
    amounts = {line.key: line.amount_inr for line in lines}
    moved = dict.fromkeys(amounts, 0)
    ignored = []
    for index, move in enumerate(request.progress.moves):
        keys = (move.from_key, move.to_key)
        if any(key not in amounts or key in confirmed for key in keys):
            ignored.append(index)
            continue
        moved[move.from_key] -= move.amount_inr
        moved[move.to_key] += move.amount_inr

    labels = {line.key: line.label for line in lines}
    for key, delta in moved.items():
        if amounts[key] + delta < 0:
            raise PlanInputError(f"{labels[key]} would drop below ₹0. Move a smaller amount.", field="progress")
    floor = request.budget_inr * rules.MIN_CONTINGENCY_PERCENT // 100
    if moved["contingency"] < 0 and amounts["contingency"] + moved["contingency"] < floor:
        raise PlanInputError(
            f"Contingency can't go below {rules.MIN_CONTINGENCY_PERCENT}% of the budget ({format_inr(floor)}).",
            field="progress",
        )

    new_lines = []
    for line in lines:
        delta = moved[line.key]
        if delta:
            amount = line.amount_inr + delta
            line = line.model_copy(update={
                "amount_inr": amount, "estimate_inr": amount, "moved_inr": delta,
                "percent": round(amount * 100 / request.budget_inr, 1),
            })
        new_lines.append(line)
    return new_lines, ignored
