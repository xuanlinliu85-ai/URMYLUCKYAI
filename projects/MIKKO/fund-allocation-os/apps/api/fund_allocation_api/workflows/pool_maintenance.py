from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import (
    Event,
    FundEvaluation,
    FundPool,
    FundPoolMembership,
    FundRole,
    FundUniverseRecord,
    PortfolioHolding,
    User,
)
from .engine import WorkflowExecution, WorkflowExecutionError


ROLE_NAMES = {
    "CORE_EQUITY": "核心权益 Beta",
    "ALPHA_EQUITY": "主动权益 Alpha",
    "GROWTH_SATELLITE": "科技/成长卫星",
    "DIVIDEND_DEFENSIVE": "红利防御",
    "CORE_BOND": "固收底仓",
    "BOND_PLUS": "固收增强",
    "GOLD_HEDGE": "黄金对冲",
    "OVERSEAS": "海外分散",
    "ALTERNATIVE": "另类资产",
    "CASH_MANAGEMENT": "流动性管理",
}


class PoolMaintenanceWorkflowInput(BaseModel):
    fund_evaluation_id: str
    role_code: str
    tier: Literal["core", "alternative", "watchlist"]
    action: Literal["add", "upgrade", "downgrade", "pause", "remove"]
    reason: str
    actor_id: str


def run_pool_maintenance_workflow(session: Session, request: PoolMaintenanceWorkflowInput) -> dict[str, Any]:
    evaluation = session.get(FundEvaluation, request.fund_evaluation_id)
    actor = session.get(User, request.actor_id)
    if evaluation is None or actor is None:
        raise WorkflowExecutionError("基金评价或执行人不存在")
    if request.role_code not in ROLE_NAMES:
        raise WorkflowExecutionError("未知基金角色")
    if evaluation.rating == "D" and request.action in {"add", "upgrade"}:
        raise WorkflowExecutionError("D 级基金不能新增或升级为有效基金池成员")

    universe = session.scalar(
        select(FundUniverseRecord)
        .where(FundUniverseRecord.fund_id == evaluation.fund_id)
        .order_by(FundUniverseRecord.universe_date.desc())
        .limit(1)
    )
    if universe is None or not universe.peer_group_code:
        raise WorkflowExecutionError("基金缺少有效 Comparable Group")

    execution = WorkflowExecution(
        session,
        name="workflow-d-fund-pool-maintenance",
        version="1.0.0",
        subject_type="fund",
        subject_id=evaluation.fund_id,
        input_data=request.model_dump(mode="json"),
        actor_id=request.actor_id,
    )

    def apply_pool_decision():
        role = session.scalar(select(FundRole).where(FundRole.code == request.role_code))
        if role is None:
            role = FundRole(code=request.role_code, name=ROLE_NAMES[request.role_code])
            session.add(role)
            session.flush()
        pool = session.scalar(
            select(FundPool).where(
                FundPool.role_id == role.id,
                FundPool.peer_group_code == universe.peer_group_code,
                FundPool.version == 1,
            )
        )
        if pool is None:
            pool = FundPool(
                role_id=role.id,
                peer_group_code=universe.peer_group_code,
                version=1,
                status="active",
                methodology_version="fund-pool-decision-v1",
            )
            session.add(pool)
            session.flush()
        current = session.scalar(
            select(FundPoolMembership).where(
                FundPoolMembership.fund_id == evaluation.fund_id,
                FundPoolMembership.pool_id == pool.id,
                FundPoolMembership.valid_to.is_(None),
            )
        )
        now = datetime.now(timezone.utc)
        if current is not None:
            current.valid_to = now
        status = "active" if request.action in {"add", "upgrade", "downgrade"} else "paused" if request.action == "pause" else "removed"
        membership = FundPoolMembership(
            fund_id=evaluation.fund_id,
            pool_id=pool.id,
            role_id=role.id,
            tier=request.tier,
            status=status,
            valid_from=now,
            decision_reason=request.reason,
            evaluation_id=evaluation.id,
            approved_by=request.actor_id,
        )
        session.add(membership)
        session.flush()
        return {"fund_pool_id": pool.id, "membership_id": membership.id, "status": status, "tier": request.tier}

    decision = execution.step(
        "fund_pool_decision",
        {"evaluation_id": evaluation.id, "rating": evaluation.rating, "action": request.action},
        apply_pool_decision,
    )

    def identify_impacts():
        impacted = sorted(
            set(
                session.scalars(
                    select(PortfolioHolding.portfolio_id).where(PortfolioHolding.fund_id == evaluation.fund_id)
                ).all()
            )
        )
        event_id = None
        if request.action in {"downgrade", "pause", "remove"}:
            event = Event(
                event_type="FundRatingDowngrade",
                severity="high" if request.action == "remove" else "medium",
                subject_type="fund",
                subject_id=evaluation.fund_id,
                payload={"action": request.action, "rating": evaluation.rating, "impacted_portfolio_ids": impacted},
                rule_version="fund-pool-impact-v1",
                status="open",
                dedup_key=f"pool-change:{execution.run.id}",
            )
            session.add(event)
            session.flush()
            event_id = event.id
        return {"impacted_portfolio_ids": impacted, "event_id": event_id}

    impacts = execution.step("identify_impacted_portfolios", {"fund_id": evaluation.fund_id}, identify_impacts)
    workflow = execution.complete()
    return {
        "workflow_run_id": workflow.id,
        "status": workflow.status,
        "decision": decision,
        "impacts": impacts,
        "recommendation_created": False,
    }

