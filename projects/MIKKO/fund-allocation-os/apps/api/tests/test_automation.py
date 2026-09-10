from fastapi.testclient import TestClient
from sqlalchemy import func, select

from fund_allocation_api.automation.service import JOB_SPECS, run_automation_job
from fund_allocation_api.database import get_session
from fund_allocation_api.main import app
from fund_allocation_api.models import AutomationTask, Event, JobRun


def test_all_required_job_types_are_registered() -> None:
    assert set(JOB_SPECS) == {
        "universe_update",
        "quarterly_review",
        "manager_change",
        "portfolio_drawdown",
        "allocation_deviation",
        "rating_change",
    }


def test_job_is_idempotent_and_only_creates_review_artifacts_once(session) -> None:
    first, created = run_automation_job(
        session,
        job_type="portfolio_drawdown",
        idempotency_key="drawdown:portfolio-1:2026-08-18",
        subject_type="portfolio",
        subject_id="portfolio-1",
        payload={"drawdown": -0.071, "threshold": -0.05},
    )
    second, created_again = run_automation_job(
        session,
        job_type="portfolio_drawdown",
        idempotency_key="drawdown:portfolio-1:2026-08-18",
        subject_type="portfolio",
        subject_id="portfolio-1",
        payload={"drawdown": -0.071, "threshold": -0.05},
    )
    assert created is True and created_again is False
    assert first.id == second.id and second.status == "completed"
    assert session.scalar(select(func.count()).select_from(Event)) == 1
    assert session.scalar(select(func.count()).select_from(AutomationTask)) == 1
    task = session.scalar(select(AutomationTask))
    assert task is not None and task.status == "open" and task.assigned_role == "advisor"
    assert second.output_payload["action"] == "human_review_required"


def test_failed_job_retries_then_moves_to_dead_letter(session) -> None:
    def failing_handler(_session, _run):
        raise RuntimeError("simulated provider outage")

    statuses = []
    for _ in range(3):
        run, _created = run_automation_job(
            session,
            job_type="universe_update",
            idempotency_key="universe:2026-08-18",
            subject_type="fund_universe",
            subject_id="2026-08-18",
            handler=failing_handler,
        )
        statuses.append(run.status)
    assert statuses == ["retrying", "retrying", "dead_letter"]
    assert run.attempt_count == 3
    assert "provider outage" in run.last_error

    unchanged, created = run_automation_job(
        session,
        job_type="universe_update",
        idempotency_key="universe:2026-08-18",
        subject_type="fund_universe",
        subject_id="2026-08-18",
        handler=lambda *_: {"unexpected": True},
    )
    assert created is False and unchanged.status == "dead_letter" and unchanged.attempt_count == 3


def test_failed_handler_rolls_back_partial_artifacts(session) -> None:
    def partial_handler(db, run):
        db.add(
            Event(
                event_type="Partial",
                severity="low",
                subject_type=run.subject_type,
                subject_id=run.subject_id,
                payload={},
                rule_version="test",
                dedup_key="partial-event",
            )
        )
        db.flush()
        raise RuntimeError("fail after write")

    run, _ = run_automation_job(
        session,
        job_type="rating_change",
        idempotency_key="rating:fund-1:v2",
        subject_type="fund",
        subject_id="fund-1",
        handler=partial_handler,
    )
    assert run.status == "retrying"
    assert session.scalar(select(Event).where(Event.dedup_key == "partial-event")) is None


def test_automation_api_is_operations_only(session, auth_headers) -> None:
    app.dependency_overrides[get_session] = lambda: session
    try:
        client = TestClient(app)
        denied = client.get(
            "/api/v1/automation/definitions",
            headers=auth_headers(role="advisor", user_id="advisor-1"),
        )
        assert denied.status_code == 403
        headers = auth_headers(role="operations", user_id="ops-1")
        definitions = client.get("/api/v1/automation/definitions", headers=headers)
        assert definitions.status_code == 200 and len(definitions.json()) == 6
        executed = client.post(
            "/api/v1/automation/jobs/manager_change/run",
            headers=headers,
            json={
                "idempotency_key": "manager:fund-1:2026-08-18",
                "subject_type": "fund",
                "subject_id": "fund-1",
                "payload": {"previous_manager": "A", "new_manager": "B"},
            },
        )
        assert executed.status_code == 200
        assert executed.json()["status"] == "completed"
        assert session.scalar(select(func.count()).select_from(JobRun)) == 1
    finally:
        app.dependency_overrides.clear()
