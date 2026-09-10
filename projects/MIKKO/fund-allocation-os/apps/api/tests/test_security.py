from fastapi.testclient import TestClient
from sqlalchemy import select

from fund_allocation_api.config import Settings, get_settings
from fund_allocation_api.database import get_session
from fund_allocation_api.main import app
from fund_allocation_api.models import AuditLog, Consent, User
from fund_allocation_api.security import Principal, create_access_token, decode_access_token


def test_signed_token_round_trip_and_expiry() -> None:
    principal = Principal(user_id="u-1", role="advisor", email="a@example.test")
    token = create_access_token(principal, "test-secret", ttl_seconds=10, now=100)
    assert decode_access_token(token, "test-secret", now=109) == principal

    try:
        decode_access_token(token, "test-secret", now=110)
    except Exception as exc:
        assert getattr(exc, "status_code", None) == 401
    else:
        raise AssertionError("expired token was accepted")


def test_tampered_token_is_rejected(auth_headers) -> None:
    headers = auth_headers()
    headers["Authorization"] += "tampered"
    response = TestClient(app).get("/api/v1/skills", headers=headers)
    assert response.status_code == 401


def test_client_cannot_access_provider_or_skills(auth_headers) -> None:
    client = TestClient(app)
    headers = auth_headers(role="client")
    assert client.get("/api/v1/skills", headers=headers).status_code == 403
    assert client.get("/api/v1/providers/ifind/health", headers=headers).status_code == 403


def test_advisor_cannot_approve_and_actor_cannot_be_spoofed(auth_headers) -> None:
    client = TestClient(app)
    headers = auth_headers(role="advisor", user_id="advisor-1")
    denied = client.post(
        "/api/v1/recommendations/missing/transitions",
        headers=headers,
        json={"target_status": "approved", "actor_id": "advisor-1", "reason": "approve"},
    )
    assert denied.status_code == 403

    spoofed = client.post(
        "/api/v1/skills/run",
        headers=headers,
        json={
            "skill_name": "fund-metrics",
            "input": {},
            "context": {"actor_id": "another-user"},
        },
    )
    assert spoofed.status_code == 403


def test_compliance_role_passes_approval_gate(auth_headers) -> None:
    response = TestClient(app).post(
        "/api/v1/recommendations/missing/transitions",
        headers=auth_headers(role="compliance", user_id="reviewer-1"),
        json={"target_status": "approved", "actor_id": "reviewer-1", "reason": "reviewed"},
    )
    assert response.status_code == 404


def test_consent_is_self_scoped_and_audited(session, auth_headers) -> None:
    user = User(id="client-1", email="client@example.test", role="client")
    session.add(user)
    session.flush()
    app.dependency_overrides[get_session] = lambda: session
    try:
        client = TestClient(app)
        headers = auth_headers(role="client", user_id=user.id)
        created = client.post(
            "/api/v1/consents",
            headers=headers,
            json={
                "consent_type": "privacy",
                "document_version": "2026-08",
                "granted": True,
                "evidence_ref": "portal-checkbox",
            },
        )
        assert created.status_code == 201
        assert created.json()["user_id"] == user.id
        assert session.scalar(select(Consent).where(Consent.user_id == user.id)) is not None
        audit = session.scalar(select(AuditLog).where(AuditLog.action == "consent.granted"))
        assert audit is not None and audit.actor_id == user.id
        listed = client.get("/api/v1/consents", headers=headers)
        assert listed.status_code == 200 and len(listed.json()) == 1
    finally:
        app.dependency_overrides.clear()


def test_mutation_rate_limit(auth_headers) -> None:
    settings = Settings(auth_rate_limit_per_minute=1)
    app.dependency_overrides[get_settings] = lambda: settings
    try:
        headers = auth_headers(role="advisor", user_id="rate-user")
        client = TestClient(app)
        first = client.post(
            "/api/v1/skills/run",
            headers=headers,
            json={
                "skill_name": "missing",
                "input": {},
                "context": {"actor_id": "rate-user"},
            },
        )
        second = client.post(
            "/api/v1/skills/run",
            headers=headers,
            json={
                "skill_name": "missing",
                "input": {},
                "context": {"actor_id": "rate-user"},
            },
        )
        assert first.status_code == 404
        assert second.status_code == 429
    finally:
        app.dependency_overrides.clear()
