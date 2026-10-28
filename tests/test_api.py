"""HTTP-level checks: routes, validation errors, rate limiting and security headers."""

import json
from datetime import timedelta
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.frontend import FrontendFiles
from app.main import ai_limiter, app, plan_limiter
from tests.conftest import TODAY


def as_json(request) -> dict:
    return request.model_dump(mode="json")


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_schema_is_exported_for_the_frontend_not_served(client):
    saved = Path(__file__).resolve().parent.parent / "frontend" / "openapi.json"
    assert json.loads(saved.read_text(encoding="utf-8")) == app.openapi(), (
        "API changed: run python scripts/export_openapi.py, then npm run gen:types in frontend/"
    )
    for path in ("/openapi.json", "/docs", "/redoc"):
        assert client.get(path).status_code == 404


def test_diwali_plan_over_http(client, diwali_request):
    response = client.post("/api/plan", json=as_json(diwali_request))
    assert response.status_code == 200
    assert response.headers["content-encoding"] == "gzip"  # a plan is well over the 1 KB minimum
    body = response.json()
    assert body["ai_available"] is False
    assert body["plan"]["triage"]["book_today"] == ["venue"]


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
    payload = as_json(diwali_request) | {"preferences": "x" * 70_000}
    assert client.post("/api/plan", json=payload).status_code == 413


@pytest.mark.parametrize("path, limiter", [("/api/plan", plan_limiter), ("/api/ideas", ai_limiter)])
def test_rate_limit_per_endpoint(client, diwali_request, path, limiter, monkeypatch):
    monkeypatch.setattr(limiter, "limit", 3)
    payload = as_json(diwali_request)
    statuses = [client.post(path, json=payload).status_code for _ in range(limiter.limit + 1)]
    assert statuses[:-1] == [200] * limiter.limit
    assert statuses[-1] == 429


def test_ai_limit_does_not_block_plans(client, diwali_request, monkeypatch):
    monkeypatch.setattr(ai_limiter, "limit", 3)
    payload = as_json(diwali_request)
    for _ in range(ai_limiter.limit + 1):
        client.post("/api/ideas", json=payload)
    assert client.post("/api/plan", json=payload).status_code == 200


def test_security_headers_on_static_and_api(client):
    for path in ("/", "/health"):
        headers = client.get(path).headers
        assert "default-src 'self'" in headers["content-security-policy"]
        assert "'unsafe-inline'" not in headers["content-security-policy"]
        assert headers["x-content-type-options"] == "nosniff"
        assert headers["referrer-policy"] == "no-referrer"


def test_built_files_are_cached_by_how_they_are_named(tmp_path):
    # A stand-in for frontend/dist, so this runs without a frontend build.
    for name in ("index.html", "assets/index-3f9c2a1b.js", "hm/loader.js"):
        (tmp_path / name).parent.mkdir(exist_ok=True)
        (tmp_path / name).write_text("x")
    site = FastAPI()
    site.mount("/", FrontendFiles(directory=tmp_path, html=True))
    client = TestClient(site)
    assert client.get("/assets/index-3f9c2a1b.js").headers["cache-control"] == "public, max-age=31536000, immutable"
    assert client.get("/").headers["cache-control"] == "no-cache"
    assert client.get("/hm/loader.js").headers["cache-control"] == "public, max-age=3600"


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


@pytest.mark.parametrize("progress, message", [
    ({"tasks": {"venue": {"state": "cancelled", "on": str(TODAY)}}}, "Please choose a valid booking status."),
    ({"quotes": [{"id": "q1", "category": "food", "total_inr": 1, "accepted_on": str(TODAY)}]},
     "Check a quote's details before accepting it."),
    ({"moves": [{"from_key": "decor", "to_key": "food", "amount_inr": 150}]},
     "The budget move must be in steps of ₹100."),
])
def test_bad_progress_gives_clean_error(client, diwali_request, progress, message):
    response = client.post("/api/plan", json=as_json(diwali_request) | {"progress": progress})
    assert response.status_code == 422
    assert {"field": "progress", "message": message} in response.json()["fields"]


def test_accepted_quote_over_http(client, diwali_request):
    quote = {"id": "q1", "category": "food", "total_inr": 50_000, "verified": True, "accepted_on": str(TODAY)}
    payload = as_json(diwali_request) | {"progress": {"quotes": [quote]}}
    response = client.post("/api/plan", json=payload)
    assert response.status_code == 200
    plan = response.json()["plan"]
    food = next(line for line in plan["budget_lines"] if line["key"] == "food")
    assert food["source"] == "confirmed" and food["change_inr"] == food["amount_inr"] - food["estimate_inr"]
    assert plan["quote_comparisons"]["food"][0]["accepted"] is True
