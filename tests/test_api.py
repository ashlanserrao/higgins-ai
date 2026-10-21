"""HTTP-level checks: routes, validation errors, rate limiting and security headers."""

from datetime import timedelta

import pytest

from app.main import rate_limiter
from tests.conftest import TODAY


def as_json(request) -> dict:
    return request.model_dump(mode="json")


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_diwali_plan_over_http(client, diwali_request):
    response = client.post("/api/plan", json=as_json(diwali_request))
    assert response.status_code == 200
    body = response.json()
    assert body["ai_available"] is False
    assert set(body["plan"]["triage"]["book_today"]) == {
        "venue", "permissions", "performers", "sound", "caterer",
    }


def test_past_date_gives_clean_error(client, diwali_request):
    payload = as_json(diwali_request) | {"event_date": str(TODAY - timedelta(days=1))}
    response = client.post("/api/plan", json=payload)
    assert response.status_code == 422
    assert response.json()["fields"] == [
        {"field": "event_date", "message": "The event date is in the past."}
    ]


@pytest.mark.parametrize("change", [
    {"guests": 0},
    {"budget_inr": -5},
    {"event_type": "funeral"},
    {"preferences": "x" * 501},
    {"city": "<script>"},
    {"admin": True},
])
def test_invalid_input_is_rejected_without_echo(client, diwali_request, change):
    response = client.post("/api/plan", json=as_json(diwali_request) | change)
    assert response.status_code == 422
    body = response.json()
    assert body["fields"] and all(set(f) == {"field", "message"} for f in body["fields"])
    assert "<script>" not in response.text


def test_oversized_body_is_rejected(client, diwali_request):
    payload = as_json(diwali_request) | {"preferences": "x" * 20_000}
    assert client.post("/api/plan", json=payload).status_code == 413


def test_rate_limit(client, diwali_request):
    payload = as_json(diwali_request)
    statuses = [client.post("/api/plan", json=payload).status_code for _ in range(rate_limiter.limit + 1)]
    assert statuses[:-1] == [200] * rate_limiter.limit
    assert statuses[-1] == 429


def test_security_headers_on_static_and_api(client):
    for path in ("/", "/health"):
        headers = client.get(path).headers
        assert "default-src 'self'" in headers["content-security-policy"]
        assert headers["x-content-type-options"] == "nosniff"
        assert headers["referrer-policy"] == "no-referrer"


def test_options_list_priorities_without_contingency(client):
    options = client.get("/api/options").json()
    assert set(options) == {"wedding", "birthday", "community"}
    assert {"key": "decor", "label": "Décor"} in options["birthday"]
    assert all(o["key"] != "contingency" for event in options.values() for o in event)


@pytest.mark.parametrize("change, field, message", [
    ({"event_date": ""}, "event_date", "Please enter the event date."),
    ({"guests": 0}, "guests", "The number of guests must be at least 1."),
    ({"budget_inr": 500}, "budget_inr", "The budget must be at least ₹1,000."),
    ({"preferences": "x" * 501}, "preferences", "Please keep the preferences under 500 characters."),
])
def test_validation_messages_are_plain_language(client, diwali_request, change, field, message):
    response = client.post("/api/plan", json=as_json(diwali_request) | change)
    assert {"field": field, "message": message} in response.json()["fields"]


def test_chunked_body_without_length_is_rejected(client):
    response = client.post(
        "/api/plan", content=iter([b"{}"]), headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 411
