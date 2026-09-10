from fastapi.testclient import TestClient

from fund_allocation_api.main import app
from fund_allocation_api.database import get_session
from fund_allocation_api.models import User


def test_service_health() -> None:
    response = TestClient(app).get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_ifind_health_contract(monkeypatch, auth_headers) -> None:
    async def fake_health(_settings):
        return {
            "status": "ready",
            "compatible": True,
            "checkedAt": "2026-08-17T00:00:00Z",
            "source": "iFinD MCP",
            "toolCount": 19,
        }

    monkeypatch.setattr("fund_allocation_api.main.check_ifind_health", fake_health)
    response = TestClient(app).get("/api/v1/providers/ifind/health", headers=auth_headers())
    assert response.status_code == 200
    assert response.json()["compatible"] is True
    assert response.json()["details"]["toolCount"] == 19


def test_ifind_universe_preview_contract(monkeypatch, auth_headers) -> None:
    async def fake_universe(_settings, limit):
        return {
            "status": "ready",
            "source": "iFinD MCP",
            "totalRows": 27625,
            "rows": [{"fundCode": "519702.OF", "fundName": "示例基金"}][:limit],
        }

    monkeypatch.setattr("fund_allocation_api.main.get_ifind_universe", fake_universe)
    response = TestClient(app).get(
        "/api/v1/providers/ifind/universe?limit=1", headers=auth_headers()
    )
    assert response.status_code == 200
    assert response.json()["totalRows"] == 27625
    assert response.json()["rows"][0]["fundCode"] == "519702.OF"


def test_skill_registry_and_execution_api(session, auth_headers) -> None:
    session.add(User(id="auth-user", email="admin@example.test", role="admin"))
    session.flush()
    app.dependency_overrides[get_session] = lambda: session
    try:
        client = TestClient(app)
        headers = auth_headers()
        listed = client.get("/api/v1/skills", headers=headers)
        assert listed.status_code == 200
        assert len(listed.json()) == 14
        assert all(item["enabled"] for item in listed.json())

        executed = client.post(
            "/api/v1/skills/run",
            json={
                "skill_name": "fund-universe-screener",
                "input": {
                    "minimum_group_size": 2,
                    "candidates": [
                        {
                            "fund_code": "A.OF",
                            "peer_group": "equity",
                            "aum": 200000000,
                            "history_days": 1000,
                            "annualized_return": 0.12,
                            "annualized_volatility": 0.18,
                            "max_drawdown": 0.22,
                            "sharpe": 0.7,
                        },
                        {
                            "fund_code": "B.OF",
                            "peer_group": "equity",
                            "aum": 200000000,
                            "history_days": 1000,
                            "annualized_return": 0.08,
                            "annualized_volatility": 0.16,
                            "max_drawdown": 0.18,
                            "sharpe": 0.6,
                        },
                    ],
                },
            },
            headers=headers,
        )
        assert executed.status_code == 200
        assert executed.json()["status"] == "warning"
        assert executed.json()["structured_output"]["eligible_funds"] == 2
    finally:
        app.dependency_overrides.clear()


def test_five_workflow_routes_are_exposed() -> None:
    paths = TestClient(app).get("/openapi.json").json()["paths"]
    assert {
        "/api/v1/workflows/fund-discovery",
        "/api/v1/workflows/fund-research",
        "/api/v1/workflows/portfolio-diagnosis",
        "/api/v1/workflows/fund-pool-maintenance",
        "/api/v1/workflows/post-investment-companion",
    } <= set(paths)
