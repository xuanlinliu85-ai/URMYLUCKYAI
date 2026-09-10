from __future__ import annotations

from datetime import date
from typing import Any

from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import DataSourceSnapshot, FundEvaluation, FundIdentifier, FundResearch
from ..skill_adapter.contracts import SkillContext, SourceReference
from ..skill_adapter.service import run_skill
from .engine import WorkflowExecution, WorkflowExecutionError


class FundResearchWorkflowInput(BaseModel):
    fund_code: str
    as_of: date
    source_snapshot_ids: list[str] = Field(min_length=1)
    facts: dict[str, Any]
    evidence_refs: list[str] = Field(min_length=1)
    limitations: list[str] = Field(default_factory=list)
    return_score: float = Field(ge=0, le=100)
    risk_score: float = Field(ge=0, le=100)
    manager_score: float = Field(ge=0, le=100)
    style_score: float = Field(ge=0, le=100)
    consistency_score: float = Field(ge=0, le=100)
    risk_flags: list[str] = Field(default_factory=list)
    suitable_roles: list[str] = Field(default_factory=list)
    actor_id: str | None = None


def run_fund_research_workflow(session: Session, request: FundResearchWorkflowInput) -> dict[str, Any]:
    identifier = session.scalar(
        select(FundIdentifier).where(
            FundIdentifier.identifier_type == "ifind_code",
            FundIdentifier.identifier_value == request.fund_code,
        )
    )
    if identifier is None:
        raise WorkflowExecutionError("基金未进入 Fund Universe")
    snapshots = list(
        session.scalars(
            select(DataSourceSnapshot).where(DataSourceSnapshot.id.in_(request.source_snapshot_ids))
        )
    )
    if len(snapshots) != len(set(request.source_snapshot_ids)):
        raise WorkflowExecutionError("一个或多个 source_snapshot_id 不存在")

    execution = WorkflowExecution(
        session,
        name="workflow-a-fund-research",
        version="1.0.0",
        subject_type="fund",
        subject_id=identifier.fund_id,
        input_data=request.model_dump(mode="json"),
        actor_id=request.actor_id,
    )
    source_references = [
        SourceReference(
            source="iFinD MCP",
            snapshot_id=item.id,
            as_of=item.as_of,
            quality_status=item.quality_status,
        )
        for item in snapshots
    ]
    context = SkillContext(
        workflow_id=execution.run.id,
        subject_type="fund",
        subject_id=identifier.fund_id,
        actor_id=request.actor_id,
        data_snapshot_ids=request.source_snapshot_ids,
        source_references=source_references,
    )

    research_result = execution.step(
        "deep_research",
        {"fund_code": request.fund_code, "source_snapshot_ids": request.source_snapshot_ids},
        lambda: run_skill(
            session,
            "r9-fund-deep-research",
            {
                "fund_code": request.fund_code,
                "as_of": request.as_of,
                "facts": request.facts,
                "evidence_refs": request.evidence_refs,
                "limitations": request.limitations,
            },
            context,
        ).model_dump(mode="json"),
    )
    if research_result["status"] == "failed":
        raise WorkflowExecutionError(research_result["error_code"] or "research failed")

    def persist_research():
        existing = session.scalar(
            select(FundResearch).where(
                FundResearch.fund_id == identifier.fund_id,
                FundResearch.as_of == request.as_of,
                FundResearch.research_type == "deep_research",
                FundResearch.version == 1,
            )
        )
        if existing is None:
            existing = FundResearch(
                fund_id=identifier.fund_id,
                as_of=request.as_of,
                research_type="deep_research",
                facts_json=request.facts,
                analysis_json=research_result["structured_output"],
                evidence_refs=request.evidence_refs,
                limitations=request.limitations,
                status="completed",
                version=1,
                workflow_run_id=execution.run.id,
            )
            session.add(existing)
            session.flush()
        return {"fund_research_id": existing.id}

    research_record = execution.step("persist_research", {"research_skill_run_id": research_result["skill_run_id"]}, persist_research)

    evaluation_result = execution.step(
        "standardized_evaluation",
        {"fund_code": request.fund_code, "research_id": research_record["fund_research_id"]},
        lambda: run_skill(
            session,
            "fund-r9alpha-evaluation",
            {
                "fund_code": request.fund_code,
                "return_score": request.return_score,
                "risk_score": request.risk_score,
                "manager_score": request.manager_score,
                "style_score": request.style_score,
                "consistency_score": request.consistency_score,
                "risk_flags": request.risk_flags,
                "suitable_roles": request.suitable_roles,
            },
            context,
        ).model_dump(mode="json"),
    )
    if evaluation_result["status"] == "failed":
        raise WorkflowExecutionError(evaluation_result["error_code"] or "evaluation failed")

    def persist_evaluation():
        output = evaluation_result["structured_output"]
        existing = session.scalar(
            select(FundEvaluation).where(
                FundEvaluation.fund_id == identifier.fund_id,
                FundEvaluation.evaluation_date == request.as_of,
                FundEvaluation.model_version == output["model_version"],
            )
        )
        if existing is None:
            existing = FundEvaluation(
                fund_id=identifier.fund_id,
                evaluation_date=request.as_of,
                model_version=output["model_version"],
                total_score=output["total_score"],
                rating=output["rating"],
                component_scores=output["component_scores"],
                risk_flags=output["risk_flags"],
                suitable_roles=output["suitable_roles"],
                suitable_clients=[],
                conclusion="标准化评价结果；不构成客户投资建议。",
                source_version="+".join(request.source_snapshot_ids),
                status="draft",
            )
            session.add(existing)
            session.flush()
        return {"fund_evaluation_id": existing.id, "rating": existing.rating, "total_score": float(existing.total_score)}

    evaluation_record = execution.step(
        "persist_evaluation",
        {"evaluation_skill_run_id": evaluation_result["skill_run_id"]},
        persist_evaluation,
    )
    workflow = execution.complete()
    return {
        "workflow_run_id": workflow.id,
        "status": workflow.status,
        "fund_id": identifier.fund_id,
        "research": research_record,
        "evaluation": evaluation_record,
        "recommendation_created": False,
    }

