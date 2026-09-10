from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_session
from ..models import JobRun
from ..security import Principal, mutation_rate_limit, require_permission
from .service import JOB_SPECS, UnknownJobError, run_automation_job


router = APIRouter(prefix="/api/v1/automation", tags=["automation"])


class AutomationRunRequest(BaseModel):
    idempotency_key: str = Field(min_length=1, max_length=256)
    subject_type: str = Field(min_length=1, max_length=64)
    subject_id: str = Field(min_length=1, max_length=128)
    payload: dict[str, Any] = Field(default_factory=dict)


class AutomationRunView(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    idempotency_key: str
    subject_type: str
    subject_id: str
    status: str
    attempt_count: int
    output_payload: dict[str, Any] | None
    last_error: str | None


@router.get("/definitions")
def list_definitions(
    _principal: Principal = Depends(require_permission("automation:manage")),
) -> list[dict[str, Any]]:
    return [
        {
            "key": spec.key,
            "schedule": spec.schedule,
            "max_attempts": spec.max_attempts,
            "output": "event_and_human_review_task",
        }
        for spec in JOB_SPECS.values()
    ]


@router.post("/jobs/{job_type}/run", response_model=AutomationRunView)
def execute_job(
    job_type: str,
    command: AutomationRunRequest,
    session: Session = Depends(get_session),
    _principal: Principal = Depends(require_permission("automation:manage")),
    _rate_limit: None = Depends(mutation_rate_limit),
) -> JobRun:
    try:
        run, _created = run_automation_job(
            session,
            job_type=job_type,
            idempotency_key=command.idempotency_key,
            subject_type=command.subject_type,
            subject_id=command.subject_id,
            payload=command.payload,
        )
        session.commit()
        return run
    except UnknownJobError as exc:
        session.rollback()
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        session.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/runs", response_model=list[AutomationRunView])
def list_runs(
    limit: int = Query(default=50, ge=1, le=200),
    session: Session = Depends(get_session),
    _principal: Principal = Depends(require_permission("automation:manage")),
) -> list[JobRun]:
    return list(session.scalars(select(JobRun).order_by(JobRun.created_at.desc()).limit(limit)))
