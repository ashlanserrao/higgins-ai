"""Indian-style currency formatting (₹1,50,000 rather than ₹150,000)."""


def format_inr(amount: int) -> str:
    digits = str(abs(amount))
    if len(digits) > 3:
        head, tail = digits[:-3], digits[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        digits = ",".join(groups) + "," + tail
    return f"{'-' if amount < 0 else ''}₹{digits}"
