from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import AutomationTask, Event, JobDefinition, JobRun


AutomationHandler = Callable[[Session, JobRun], dict[str, Any]]


@dataclass(frozen=True)
class JobSpec:
    key: str
    schedule: str
    event_type: str
    title: str
    assigned_role: str
    severity: str = "medium"
    max_attempts: int = 3


JOB_SPECS: dict[str, JobSpec] = {
    "universe_update": JobSpec(
        "universe_update", "0 2 * * 1-5", "UniverseRefreshRequested",
        "更新全市场基金 Universe", "operations", "low",
    ),
    "quarterly_review": JobSpec(
        "quarterly_review", "0 8 1 */3 *", "QuarterlyReviewDue",
        "执行基金季度复核", "research", "medium",
    ),
    "manager_change": JobSpec(
        "manager_change", "0 */4 * * *", "FundManagerChanged",
        "复核基金经理变更", "research", "high",
    ),
    "portfolio_drawdown": JobSpec(
        "portfolio_drawdown", "0 18 * * 1-5", "PortfolioDrawdownThreshold",
        "复核组合回撤事件", "advisor", "high",
    ),
    "allocation_deviation": JobSpec(
        "allocation_deviation", "30 18 * * 1-5", "AllocationDeviationThreshold",
        "复核资产配置偏离", "advisor", "medium",
    ),
    "rating_change": JobSpec(
        "rating_change", "0 7 * * 1-5", "FundRatingChanged",
        "复核基金评级变化", "research", "medium",
    ),
}


class UnknownJobError(LookupError):
    pass


def ensure_job_definition(session: Session, spec: JobSpec) -> JobDefinition:
    definition = session.scalar(select(JobDefinition).where(JobDefinition.key == spec.key))
    if definition is None:
        definition = JobDefinition(
            key=spec.key,
            handler_name="create_review_task",
            schedule=spec.schedule,
            max_attempts=spec.max_attempts,
            enabled=True,
        )
        session.add(definition)
        session.flush()
    return definition


def create_review_task(session: Session, run: JobRun) -> dict[str, Any]:
    definition = session.get(JobDefinition, run.job_definition_id)
    if definition is None or definition.key not in JOB_SPECS:
        raise UnknownJobError("job definition is missing")
    spec = JOB_SPECS[definition.key]
    event_key = f"automation:{run.idempotency_key}"
    event = session.scalar(select(Event).where(Event.dedup_key == event_key))
    if event is None:
        event = Event(
            event_type=spec.event_type,
            severity=spec.severity,
            subject_type=run.subject_type,
            subject_id=run.subject_id,
            payload={**run.input_payload, "job_run_id": run.id},
            rule_version="automation-v1",
            status="open",
            dedup_key=event_key,
        )
        session.add(event)
        session.flush()
    task_key = f"review:{run.idempotency_key}"
    task = session.scalar(select(AutomationTask).where(AutomationTask.dedup_key == task_key))
    if task is None:
        task = AutomationTask(
            job_run_id=run.id,
            event_id=event.id,
            task_type=definition.key,
            subject_type=run.subject_type,
            subject_id=run.subject_id,
            title=spec.title,
            payload=run.input_payload,
            status="open",
            assigned_role=spec.assigned_role,
            dedup_key=task_key,
        )
        session.add(task)
        session.flush()
    return {"event_id": event.id, "task_id": task.id, "action": "human_review_required"}


def run_automation_job(
    session: Session,
    *,
    job_type: str,
    idempotency_key: str,
    subject_type: str,
    subject_id: str,
    payload: dict[str, Any] | None = None,
    handler: AutomationHandler = create_review_task,
) -> tuple[JobRun, bool]:
    spec = JOB_SPECS.get(job_type)
    if spec is None:
        raise UnknownJobError(f"Unknown automation job: {job_type}")
    definition = ensure_job_definition(session, spec)
    run = session.scalar(select(JobRun).where(JobRun.idempotency_key == idempotency_key))
    created = run is None
    if run is None:
        run = JobRun(
            job_definition_id=definition.id,
            idempotency_key=idempotency_key,
            subject_type=subject_type,
            subject_id=subject_id,
            status="pending",
            attempt_count=0,
            input_payload=payload or {},
        )
        session.add(run)
        session.flush()
    elif run.job_definition_id != definition.id:
        raise ValueError("idempotency_key already belongs to a different job")
    elif run.status in {"completed", "dead_letter"}:
        return run, False

    run.status = "running"
    run.attempt_count += 1
    run.started_at = run.started_at or datetime.now(timezone.utc)
    try:
        with session.begin_nested():
            output = handler(session, run)
    except Exception as exc:
        run.last_error = str(exc)[:2000]
        run.status = "dead_letter" if run.attempt_count >= definition.max_attempts else "retrying"
        if run.status == "dead_letter":
            run.finished_at = datetime.now(timezone.utc)
    else:
        run.output_payload = output
        run.last_error = None
        run.status = "completed"
        run.finished_at = datetime.now(timezone.utc)
    session.flush()
    return run, created
