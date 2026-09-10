from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import DataSourceSnapshot, SkillDefinition, SkillRun, WorkflowRun
from .contracts import SkillContext, SkillResult
from .registry import RegisteredSkill, SkillRegistry, registry


class SkillNotFoundError(LookupError):
    pass


def canonical_hash(value: Any) -> str:
    encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def sync_registry(session: Session, active_registry: SkillRegistry = registry) -> int:
    count = 0
    for definition in active_registry.list():
        existing = session.scalar(
            select(SkillDefinition).where(
                SkillDefinition.name == definition.name,
                SkillDefinition.version == definition.version,
            )
        )
        input_schema = definition.input_model.model_json_schema() if definition.input_model else {}
        if existing is None:
            existing = SkillDefinition(name=definition.name, version=definition.version)
            session.add(existing)
        existing.execution_type = definition.execution_type
        existing.input_schema = input_schema
        existing.output_schema = {"$ref": "SkillResult"}
        existing.source_ref = definition.source_ref
        existing.enabled = definition.enabled
        count += 1
    session.flush()
    return count


def _workflow_for_run(
    session: Session, context: SkillContext, skill: RegisteredSkill, input_hash: str
) -> WorkflowRun:
    if context.workflow_id:
        workflow = session.get(WorkflowRun, context.workflow_id)
        if workflow is None:
            raise ValueError("指定的 workflow_id 不存在")
        return workflow
    workflow = WorkflowRun(
        workflow_name=f"adhoc:{skill.name}",
        workflow_version="1.0.0",
        subject_type=context.subject_type,
        subject_id=context.subject_id,
        status="running",
        input_hash=input_hash,
        started_at=datetime.now(timezone.utc),
        initiated_by=context.actor_id,
    )
    session.add(workflow)
    session.flush()
    return workflow


def _result(
    *,
    run: SkillRun,
    workflow: WorkflowRun,
    skill: RegisteredSkill,
    started_at: datetime,
    status: str,
    input_hash: str,
    structured_output: dict[str, Any] | None = None,
    narrative_output: str | None = None,
    warnings: list[str] | None = None,
    sources=None,
    error_code: str | None = None,
) -> SkillResult:
    return SkillResult(
        status=status,
        skill_name=skill.name,
        skill_version=skill.version,
        structured_output=structured_output,
        narrative_output=narrative_output,
        warnings=warnings or [],
        sources=sources or [],
        started_at=started_at,
        finished_at=run.finished_at,
        input_hash=input_hash,
        model_version=run.model_version,
        prompt_hash=run.prompt_hash,
        error_code=error_code,
        workflow_run_id=workflow.id,
        skill_run_id=run.id,
    )


def run_skill(
    session: Session,
    skill_name: str,
    input_data: dict[str, Any],
    context: SkillContext | None = None,
    active_registry: SkillRegistry = registry,
) -> SkillResult:
    skill = active_registry.get(skill_name)
    if skill is None:
        raise SkillNotFoundError(f"未注册 Skill：{skill_name}")

    execution_context = context or SkillContext()
    input_hash = canonical_hash(input_data)
    started_at = datetime.now(timezone.utc)
    owns_workflow = execution_context.workflow_id is None
    workflow = _workflow_for_run(session, execution_context, skill, input_hash)
    run = SkillRun(
        workflow_run_id=workflow.id,
        skill_name=skill.name,
        skill_version=skill.version,
        status="running",
        input_hash=input_hash,
        started_at=started_at,
        source_snapshot_ids=execution_context.data_snapshot_ids,
    )
    session.add(run)
    session.flush()

    declared_snapshot_ids = set(execution_context.data_snapshot_ids)
    declared_snapshot_ids.update(
        item.snapshot_id for item in execution_context.source_references if item.snapshot_id
    )
    if declared_snapshot_ids:
        existing_ids = set(
            session.scalars(
                select(DataSourceSnapshot.id).where(DataSourceSnapshot.id.in_(declared_snapshot_ids))
            ).all()
        )
        missing_ids = sorted(declared_snapshot_ids - existing_ids)
        if missing_ids:
            run.status = "failed"
            run.error_code = "DATA_SNAPSHOT_NOT_FOUND"
            run.warnings = [f"missing_data_snapshots:{','.join(missing_ids)}"]
            run.finished_at = datetime.now(timezone.utc)
            if owns_workflow:
                workflow.status = "failed"
                workflow.finished_at = run.finished_at
            session.flush()
            return _result(
                run=run,
                workflow=workflow,
                skill=skill,
                started_at=started_at,
                status="failed",
                input_hash=input_hash,
                warnings=run.warnings,
                error_code=run.error_code,
            )

    if not skill.enabled:
        run.status = "unavailable"
        run.error_code = "ADAPTER_NOT_IMPLEMENTED"
        run.warnings = ["registered_but_not_implemented"]
        run.finished_at = datetime.now(timezone.utc)
        if owns_workflow:
            workflow.status = "waiting_for_adapter"
            workflow.finished_at = run.finished_at
        session.flush()
        return _result(
            run=run,
            workflow=workflow,
            skill=skill,
            started_at=started_at,
            status="unavailable",
            input_hash=input_hash,
            warnings=run.warnings,
            error_code=run.error_code,
        )

    try:
        validated_input = skill.input_model.model_validate(input_data)
        payload = skill.handler(validated_input, execution_context)
    except ValidationError as exc:
        run.status = "failed"
        run.error_code = "INPUT_VALIDATION_ERROR"
        run.warnings = [json.dumps(exc.errors(), ensure_ascii=False, default=str)]
        if owns_workflow:
            workflow.status = "failed"
    except Exception as exc:
        run.status = "failed"
        run.error_code = "SKILL_EXECUTION_ERROR"
        run.warnings = [str(exc)]
        if owns_workflow:
            workflow.status = "failed"
    else:
        serialized_payload = payload.model_dump(mode="json")
        run.status = "warning" if serialized_payload["warnings"] else "success"
        run.structured_output = serialized_payload["structured_output"]
        run.narrative_output = serialized_payload["narrative_output"]
        run.warnings = serialized_payload["warnings"]
        run.model_version = serialized_payload["model_version"]
        run.prompt_hash = serialized_payload["prompt_hash"]
        run.source_snapshot_ids = [
            item.snapshot_id for item in payload.sources if item.snapshot_id is not None
        ] or execution_context.data_snapshot_ids
        if owns_workflow:
            workflow.status = "completed"

    run.finished_at = datetime.now(timezone.utc)
    if owns_workflow:
        workflow.finished_at = run.finished_at
    session.flush()
    return _result(
        run=run,
        workflow=workflow,
        skill=skill,
        started_at=started_at,
        status=run.status,
        input_hash=input_hash,
        structured_output=run.structured_output,
        narrative_output=run.narrative_output,
        warnings=run.warnings,
        sources=payload.sources if "payload" in locals() else [],
        error_code=run.error_code,
    )
