from __future__ import annotations

from typing import Any

from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..models import ClientCommunication, Event, Recommendation, User
from ..skill_adapter.contracts import SkillContext
from ..skill_adapter.service import run_skill
from .engine import WorkflowExecution, WorkflowExecutionError


class CompanionWorkflowInput(BaseModel):
    event_id: str
    recommendation_id: str
    approved_facts: dict[str, Any]
    channel: str = "portal"
    audience_state: str = "concerned"
    actor_id: str


def run_companion_workflow(session: Session, request: CompanionWorkflowInput) -> dict[str, Any]:
    event = session.get(Event, request.event_id)
    recommendation = session.get(Recommendation, request.recommendation_id)
    actor = session.get(User, request.actor_id)
    if not all((event, recommendation, actor)):
        raise WorkflowExecutionError("事件、Recommendation 或执行人不存在")
    if recommendation.status != "approved":
        raise WorkflowExecutionError("只有 approved Recommendation 才能进入客户陪伴")

    execution = WorkflowExecution(
        session,
        name="workflow-c-post-investment-companion",
        version="1.0.0",
        subject_type="client",
        subject_id=recommendation.client_id,
        input_data=request.model_dump(mode="json"),
        actor_id=request.actor_id,
    )
    context = SkillContext(
        workflow_id=execution.run.id,
        subject_type="client",
        subject_id=recommendation.client_id,
        actor_id=request.actor_id,
        data_snapshot_ids=recommendation.data_snapshot_ids,
    )
    rendered = execution.step(
        "render_approved_facts",
        {"event_id": event.id, "recommendation_id": recommendation.id},
        lambda: run_skill(
            session,
            "post-investment-companion",
            {
                "recommendation_id": recommendation.id,
                "recommendation_status": recommendation.status,
                "approved_facts": request.approved_facts,
                "risk_disclosure": recommendation.risk_disclosure,
                "event_type": event.event_type,
                "audience_state": request.audience_state,
            },
            context,
        ).model_dump(mode="json"),
    )
    if rendered["status"] == "failed":
        raise WorkflowExecutionError(rendered["error_code"] or "communication render failed")

    def persist_draft():
        output = rendered["structured_output"]
        communication = ClientCommunication(
            client_id=recommendation.client_id,
            event_id=event.id,
            recommendation_id=recommendation.id,
            channel=request.channel,
            audience_state=request.audience_state,
            template_version="post-investment-companion-v1",
            approved_facts=request.approved_facts,
            content=output["content"],
            status="draft",
        )
        session.add(communication)
        session.flush()
        return {"client_communication_id": communication.id, "status": communication.status}

    communication = execution.step("persist_draft_communication", {"skill_run_id": rendered["skill_run_id"]}, persist_draft)
    workflow = execution.complete()
    return {
        "workflow_run_id": workflow.id,
        "status": workflow.status,
        "communication": communication,
        "human_review_required": True,
        "sent": False,
    }

