"""Vendor messages: filled from the plan, no budget unless asked, no message for no-vendor tasks."""

from datetime import timedelta

import pytest

from app.engine import rules
from app.engine.money import format_inr
from app.engine.wording import day


def message(client, request, task_id, kind="enquiry", **extra):
    body = {"inputs": request.model_dump(mode="json"), "task_id": task_id, "kind": kind, **extra}
    return client.post("/api/messages", json=body)


def test_enquiry_has_the_event_facts_and_the_vendor_questions(client, diwali_request):
    text = message(client, diwali_request, "caterer").json()["text"]
    assert "a community event in Bengaluru on Sunday, 8 Nov 2026 for about 500 guests outdoors" in text
    assert "What is the per-plate price (veg and non-veg) for 500 guests?" in text
    assert "₹" not in text and "None" not in text  # the budget stays private by default


def test_budget_is_included_only_when_asked(client, diwali_request):
    food = next(line for line in client.post("/api/plan", json=diwali_request.model_dump(mode="json"))
                .json()["plan"]["budget_lines"] if line["key"] == "food")
    text = message(client, diwali_request, "caterer", include_budget=True).json()["text"]
    assert f"My budget for this is about {format_inr(food['amount_inr'])}." in text


@pytest.mark.parametrize("kind, expected", [
    ("follow_up", "I need to confirm this booking as soon as possible"),  # venue's book-by date has passed
    ("confirmation", "- Final headcount: 500 guests"),
])
def test_follow_up_and_confirmation(client, diwali_request, kind, expected):
    assert expected in message(client, diwali_request, "venue", kind).json()["text"]


def test_follow_up_gives_the_book_by_date_when_there_is_time(client, wedding_request):
    text = message(client, wedding_request, "photographer", "follow_up").json()["text"]
    assert f"by {day(wedding_request.event_date - timedelta(days=300))}" in text  # peak-season lead time


def test_no_message_for_tasks_outside_the_plan_or_without_a_vendor(client, wedding_request, diwali_request):
    for request, task_id, error in [
        (wedding_request, "caterer", "This booking isn't in your plan."),  # the venue does the catering
        (diwali_request, "permissions", "There's no vendor to message for this booking."),
    ]:
        response = message(client, request, task_id)
        assert response.status_code == 422
        assert response.json()["fields"] == [{"field": "task_id", "message": error}]


def test_every_vendor_task_has_questions():
    assert set(rules.VENDOR_ASK) == set(rules.VENDOR_QUESTIONS)
    no_vendor = set(rules.VENDOR_LABELS) - set(rules.VENDOR_ASK)
    assert no_vendor == {"permissions", "weather_backup"}
