"""Checks on what the AI read from an organiser's message, against the message's own words.

The model reports values; these keep only what the message supports and give each relative
change the direction the organiser actually said. Each check fixes something seen going wrong
live. Plain values in and out, so the rules stay independent of the AI layer.
"""

import re
import unicodedata
from collections.abc import Mapping
from datetime import date, timedelta
from typing import Any

from app.engine import rules
from app.engine.wording import day

_WEEKDAY_PREFIXES = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
_RELATIVE_WEEKDAY = re.compile(
    r"\b(?:this|next|coming)\s+(mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:rs(?:day)?)?"
    r"|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b",
    re.IGNORECASE,
)
_COUNT_WORDS = {"a": 1, "an": 1, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7,
                "eight": 8, "nine": 9, "ten": 10}
_COUNT = rf"(\d{{1,3}}|{'|'.join(_COUNT_WORDS)})"
# Dates counted from today. Vague ones ("next week", "next month") stay out: they name no day.
_FROM_TODAY = re.compile(
    rf"\b(?:day after tomorrow|tomorrow|today|in {_COUNT} (days?|weeks?)|{_COUNT} (days?|weeks?) from (?:today|now))\b",
    re.IGNORECASE,
)
# Label words too generic to count as naming a category ("first" in "first aid").
_LABEL_STOPWORDS = {"first"}
# The model must not invent priorities: keep them only if the message talks about them.
_PRIORITY_WORDS = re.compile(r"priorit|matters?\b|important|focus|\bmost\b|\bmain\b", re.IGNORECASE)
# Which way a relative change goes, read from the organiser's own words about that field.
# Seen live: "reduce budget by 1 lakh" came back as +1 lakh.
_LESS = re.compile(
    r"\b(?:reduce|cut|lower|less|fewer|remove|drop|decrease|minus|subtract|trim|slash|down|"
    r"forward|earlier|sooner|prepone)\b", re.IGNORECASE,
)
_MORE = re.compile(
    r"\b(?:add|more|extra|increase|raise|plus|up|boost|bump|back|later|postpone|delay)\b", re.IGNORECASE,
)
_BUDGET_WORDS = re.compile(r"budget|lakh|crore|₹|\brs\b|rupees?|\d\s*k\b|money|spend", re.IGNORECASE)
_CHANGE_TOPICS = {
    "guests_change": re.compile(r"guest|people|persons?|pax|heads?", re.IGNORECASE),
    "budget_change_inr": _BUDGET_WORDS,
    "budget_change_percent": _BUDGET_WORDS,
    "event_date_change_days": re.compile(
        r"date|days?|weeks?|months?|forward|back|earlier|later|postpone|prepone", re.IGNORECASE,
    ),
}


def keep_what_the_message_says(values: dict[str, Any], message: str, today: date) -> list[str]:
    """Drop values the message doesn't support (each was seen invented live); return notes."""
    notes = []
    if weekday := _RELATIVE_WEEKDAY.search(message):
        # "next Saturday" is resolved here, not by the model, and the reading is shown.
        values["event_date"] = _next_weekday(weekday.group(1)[:3], today)
        notes.append(f"I took \"{weekday.group(0)}\" as {day(values['event_date'])}.")
    elif (
        "event_date" in values and (counted := date_from_today(message, today))
        and not _date_is_in_message(values["event_date"], message.replace(counted[0], " "), today)
    ):
        # Only when the model says the message sets the date ("I'll confirm tomorrow" doesn't),
        # and no other day is named ("budget today is 5 lakh, event on 15 Nov" keeps the 15th).
        phrase, values["event_date"] = counted
        notes.append(f"I took \"{phrase}\" as {day(values['event_date'])}.")
    elif "event_date" in values and not _date_is_in_message(values["event_date"], message, today):
        del values["event_date"]  # e.g. "Feb 2027" came back as 1 Feb
        notes.append("Which day? Please give the exact date.")
    if "city" in values and _plain(values["city"]) not in _plain(message):
        del values["city"]  # a message with no city came back as "India"
    if "priorities" in values:
        talks_priorities = bool(_PRIORITY_WORDS.search(message))
        named = [p for p in values["priorities"] if talks_priorities and _is_named(p, message)]
        if named:
            values["priorities"] = named
        else:
            del values["priorities"]
    return notes


def date_from_today(message: str, today: date) -> tuple[str, date] | None:
    """A date the message counts from today ("next Saturday", "tomorrow", "in 2 weeks"), with the words used."""
    if weekday := _RELATIVE_WEEKDAY.search(message):
        return weekday.group(0), _next_weekday(weekday.group(1)[:3], today)
    found = _FROM_TODAY.search(message)
    if not found:
        return None
    phrase = found.group(0)
    if (words := phrase.lower()) in ("today", "tomorrow", "day after tomorrow"):
        return phrase, today + timedelta(days=("today", "tomorrow", "day after tomorrow").index(words))
    count, unit = (found.group(1), found.group(2)) if found.group(1) else (found.group(3), found.group(4))
    days = int(count) if count.isdigit() else _COUNT_WORDS[count.lower()]
    return phrase, today + timedelta(days=days * (7 if unit.lower().startswith("week") else 1))


def signs_from_the_message(changes: Mapping[str, Any], message: str) -> dict[str, float]:
    """The relative changes whose sign the organiser's words contradict, flipped."""
    flipped = {}
    for name, topic in _CHANGE_TOPICS.items():
        value = changes.get(name)
        if value and (direction := _direction(message, topic)) and (value > 0) != (direction > 0):
            flipped[name] = -value
    return flipped


def _direction(message: str, topic: re.Pattern) -> int:
    """+1 or -1 when every part of the message about this field points the same way, else 0."""
    found = set()
    for part in re.split(r"[,;.]|\band\b|\bbut\b|\bthen\b", message, flags=re.IGNORECASE):
        if topic.search(part):
            less, more = bool(_LESS.search(part)), bool(_MORE.search(part))
            if less != more:
                found.add(-1 if less else 1)
    return found.pop() if len(found) == 1 else 0


def _next_weekday(name: str, today: date) -> date:
    """The first such weekday after today ("sat" on a Saturday is a week later)."""
    target = _WEEKDAY_PREFIXES.index(name.lower())
    return today + timedelta(days=(target - today.weekday() - 1) % 7 + 1)


def _plain(text: str) -> str:
    """Lower case without accents, so "Décor" matches "decor"."""
    return "".join(ch for ch in unicodedata.normalize("NFKD", text.lower()) if not unicodedata.combining(ch))


def _is_named(priority: str, message: str) -> bool:
    """The message names the category: its key or a word of its label ("photos" → Photo & video)."""
    labels = [labels[priority] for labels in rules.CATEGORY_LABELS.values() if priority in labels]
    words = {priority.replace("_", " ")} | {
        word for label in labels for word in re.findall(r"[a-z]{4,}", _plain(label)) if word not in _LABEL_STOPWORDS
    }
    text = _plain(message)
    return any(word in text for word in words)


def _date_is_in_message(value: date, message: str, today: date) -> bool:
    """The message names the day: its number ("5 Jan", "15th"), its weekday, today or tomorrow."""
    text = message.lower()
    named_day = re.search(rf"(?<!\d){value.day}(st|nd|rd|th)?(?!\d)", text)
    weekday = value.strftime("%A").lower()
    return bool(
        named_day or weekday in text or weekday[:3] in re.findall(r"[a-z]+", text)
        or (value == today and "today" in text) or (value == today + timedelta(days=1) and "tomorrow" in text)
    )
