from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from .audit import append_audit_log, model_snapshot
from .models import ClientCommunication, Recommendation, SuitabilityAssessment


class WorkflowGuardError(ValueError):
    """A regulated workflow transition failed a deterministic guard."""


RECOMMENDATION_TRANSITIONS: dict[str, set[str]] = {
    "draft": {"pending_compliance"},
    "pending_compliance": {"approved", "rejected"},
    "approved": {"superseded"},
    "rejected": set(),
    "superseded": set(),
}

COMMUNICATION_TRANSITIONS: dict[str, set[str]] = {
    "draft": {"reviewed"},
    "reviewed": {"sent", "archived"},
    "sent": {"archived"},
    "archived": set(),
}


def _latest_suitability(session: Session, recommendation_id: str) -> SuitabilityAssessment | None:
    return session.scalar(
        select(SuitabilityAssessment)
        .where(SuitabilityAssessment.recommendation_id == recommendation_id)
        .order_by(SuitabilityAssessment.created_at.desc())
        .limit(1)
    )


def transition_recommendation(
    session: Session,
    recommendation: Recommendation,
    target_status: str,
    *,
    actor_id: str,
    reason: str,
    request_id: str | None = None,
) -> Recommendation:
    if target_status not in RECOMMENDATION_TRANSITIONS.get(recommendation.status, set()):
        raise WorkflowGuardError(f"不允许从 {recommendation.status} 转为 {target_status}")

    if target_status == "approved":
        assessment = _latest_suitability(session, recommendation.id)
        if assessment is None or assessment.outcome != "pass":
            raise WorkflowGuardError("建议只有在最新适当性评估为 pass 时才能批准")
        if recommendation.compliance_status != "approved":
            raise WorkflowGuardError("建议只有在人工合规状态为 approved 时才能批准")
        if not recommendation.reviewer_id:
            raise WorkflowGuardError("建议批准必须记录人工审核人")

    before = model_snapshot(recommendation)
    recommendation.status = target_status
    if target_status in {"approved", "rejected"}:
        recommendation.reviewed_at = datetime.now(timezone.utc)
    session.flush()
    append_audit_log(
        session,
        actor_id=actor_id,
        action=f"recommendation.{target_status}",
        object_type="Recommendation",
        object_id=recommendation.id,
        before=before,
        after=model_snapshot(recommendation),
        reason=reason,
        request_id=request_id,
    )
    return recommendation


def transition_communication(
    session: Session,
    communication: ClientCommunication,
    target_status: str,
    *,
    actor_id: str,
    reason: str,
    request_id: str | None = None,
) -> ClientCommunication:
    if target_status not in COMMUNICATION_TRANSITIONS.get(communication.status, set()):
        raise WorkflowGuardError(f"不允许从 {communication.status} 转为 {target_status}")

    if target_status == "sent":
        recommendation = session.get(Recommendation, communication.recommendation_id)
        if recommendation is None or recommendation.status != "approved":
            raise WorkflowGuardError("客户沟通只有在关联建议已批准时才能发送")
        if not communication.reviewer_id:
            raise WorkflowGuardError("发送客户沟通前必须记录人工复核人")

    before = model_snapshot(communication)
    communication.status = target_status
    if target_status == "sent":
        communication.sent_at = datetime.now(timezone.utc)
    session.flush()
    append_audit_log(
        session,
        actor_id=actor_id,
        action=f"client_communication.{target_status}",
        object_type="ClientCommunication",
        object_id=communication.id,
        before=before,
        after=model_snapshot(communication),
        reason=reason,
        request_id=request_id,
    )
    return communication

