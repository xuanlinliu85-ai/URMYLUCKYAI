from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Callable

from sqlalchemy.orm import Session

from ..models import WorkflowRun, WorkflowStepRun
from ..skill_adapter.service import canonical_hash


class WorkflowExecutionError(RuntimeError):
    pass


def json_safe(value: Any) -> Any:
    return json.loads(json.dumps(value, ensure_ascii=False, default=str))


class WorkflowExecution:
    def __init__(
        self,
        session: Session,
        *,
        name: str,
        version: str,
        subject_type: str,
        subject_id: str | None,
        input_data: dict[str, Any],
        actor_id: str | None = None,
    ) -> None:
        self.session = session
        self.run = WorkflowRun(
            workflow_name=name,
            workflow_version=version,
            subject_type=subject_type,
            subject_id=subject_id,
            status="running",
            input_hash=canonical_hash(input_data),
            started_at=datetime.now(timezone.utc),
            initiated_by=actor_id,
        )
        session.add(self.run)
        session.flush()

    def step(
        self,
        key: str,
        input_snapshot: dict[str, Any],
        operation: Callable[[], Any],
        *,
        output_ref: str | None = None,
    ) -> Any:
        step_run = WorkflowStepRun(
            workflow_run_id=self.run.id,
            step_key=key,
            status="running",
            input_snapshot=json_safe(input_snapshot),
            attempt=1,
            started_at=datetime.now(timezone.utc),
        )
        self.session.add(step_run)
        self.session.flush()
        try:
            output = operation()
        except Exception as exc:
            step_run.status = "failed"
            step_run.error_code = type(exc).__name__
            step_run.structured_output = {"message": str(exc)}
            step_run.finished_at = datetime.now(timezone.utc)
            self.run.status = "failed"
            self.run.finished_at = step_run.finished_at
            self.session.flush()
            raise
        step_run.status = "completed"
        step_run.structured_output = json_safe(output)
        step_run.output_ref = output_ref
        step_run.finished_at = datetime.now(timezone.utc)
        self.session.flush()
        return output

    def complete(self) -> WorkflowRun:
        self.run.status = "completed"
        self.run.finished_at = datetime.now(timezone.utc)
        self.session.flush()
        return self.run

