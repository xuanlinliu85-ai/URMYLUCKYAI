from __future__ import annotations

from datetime import date
from typing import Any

from pydantic import BaseModel, Field, model_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import (
    AssetAllocation,
    ClientProfile,
    FundIdentifier,
    Portfolio,
    PortfolioEvaluation,
    PortfolioHolding,
    RebalanceProposal,
    RebalanceTrade,
    Recommendation,
    SuitabilityAssessment,
    User,
)
from ..skill_adapter.contracts import SkillContext
from ..skill_adapter.service import run_skill
from .engine import WorkflowExecution, WorkflowExecutionError


class PortfolioDiagnosisWorkflowInput(BaseModel):
    client_profile_id: str
    portfolio_id: str
    target_allocation_id: str
    valuation_date: date
    target_fund_weights: dict[str, float]
    asset_classes: dict[str, str]
    fund_risk_metrics: dict[str, dict[str, float | None]] = Field(default_factory=dict)
    proposed_max_drawdown: float = Field(ge=0, le=1)
    source_snapshot_ids: list[str] = Field(default_factory=list)
    actor_id: str

    @model_validator(mode="after")
    def validate_target_weights(self):
        if abs(sum(self.target_fund_weights.values()) - 1) > 0.01:
            raise ValueError("目标基金权重合计必须在 1% 容差内等于 1")
        return self


def run_portfolio_diagnosis_workflow(
    session: Session, request: PortfolioDiagnosisWorkflowInput
) -> dict[str, Any]:
    profile = session.get(ClientProfile, request.client_profile_id)
    portfolio = session.get(Portfolio, request.portfolio_id)
    allocation = session.get(AssetAllocation, request.target_allocation_id)
    actor = session.get(User, request.actor_id)
    if not all((profile, portfolio, allocation, actor)):
        raise WorkflowExecutionError("客户画像、组合、SAA 或执行人不存在")
    if profile.client_id != portfolio.client_id or allocation.client_id != portfolio.client_id:
        raise WorkflowExecutionError("客户画像、组合与 SAA 不属于同一客户")

    holdings = list(
        session.scalars(
            select(PortfolioHolding).where(
                PortfolioHolding.portfolio_id == portfolio.id,
                PortfolioHolding.as_of == request.valuation_date,
            )
        )
    )
    if not holdings:
        raise WorkflowExecutionError("估值日没有组合持仓")
    identifiers = {
        item.fund_id: item.identifier_value
        for item in session.scalars(
            select(FundIdentifier).where(
                FundIdentifier.fund_id.in_([holding.fund_id for holding in holdings]),
                FundIdentifier.identifier_type == "ifind_code",
            )
        )
    }
    current_weights = {identifiers[item.fund_id]: float(item.weight) for item in holdings}
    if set(current_weights) - set(request.asset_classes):
        raise WorkflowExecutionError("部分持仓缺少资产类别映射")

    execution = WorkflowExecution(
        session,
        name="workflow-b-portfolio-diagnosis",
        version="1.0.0",
        subject_type="portfolio",
        subject_id=portfolio.id,
        input_data=request.model_dump(mode="json"),
        actor_id=request.actor_id,
    )
    context = SkillContext(
        workflow_id=execution.run.id,
        subject_type="portfolio",
        subject_id=portfolio.id,
        actor_id=request.actor_id,
        data_snapshot_ids=request.source_snapshot_ids,
    )

    analysis = execution.step(
        "portfolio_analysis",
        {"portfolio_id": portfolio.id, "valuation_date": request.valuation_date},
        lambda: run_skill(
            session,
            "fund-advisor-strategy",
            {
                "portfolio_id": portfolio.id,
                "holdings": [
                    {
                        "fund_code": code,
                        "weight": weight,
                        "asset_class": request.asset_classes[code],
                        "annualized_volatility": request.fund_risk_metrics.get(code, {}).get("annualized_volatility"),
                        "max_drawdown": request.fund_risk_metrics.get(code, {}).get("max_drawdown"),
                    }
                    for code, weight in current_weights.items()
                ],
            },
            context,
        ).model_dump(mode="json"),
    )
    if analysis["status"] == "failed":
        raise WorkflowExecutionError(analysis["error_code"] or "portfolio analysis failed")

    def persist_evaluation():
        output = analysis["structured_output"]
        existing = session.scalar(
            select(PortfolioEvaluation).where(
                PortfolioEvaluation.portfolio_id == portfolio.id,
                PortfolioEvaluation.as_of == request.valuation_date,
                PortfolioEvaluation.calculation_version == "portfolio-analysis-v1",
            )
        )
        if existing is None:
            existing = PortfolioEvaluation(
                portfolio_id=portfolio.id,
                as_of=request.valuation_date,
                metrics_json=output,
                biggest_problem=output.get("biggest_problem"),
                biggest_risk=output.get("biggest_risk"),
                adjustment_needed=False,
                priority="review" if output.get("biggest_problem") else "monitor",
                calculation_version="portfolio-analysis-v1",
            )
            session.add(existing)
            session.flush()
        return {"portfolio_evaluation_id": existing.id}

    portfolio_evaluation = execution.step("persist_portfolio_evaluation", {"analysis_skill_run_id": analysis["skill_run_id"]}, persist_evaluation)

    rebalance = execution.step(
        "rebalance_proposal",
        {"current_weights": current_weights, "target_weights": request.target_fund_weights},
        lambda: run_skill(
            session,
            "portfolio-rebalance",
            {"current_weights": current_weights, "target_weights": request.target_fund_weights, "threshold": 0.05},
            context,
        ).model_dump(mode="json"),
    )
    if rebalance["status"] == "failed":
        raise WorkflowExecutionError(rebalance["error_code"] or "rebalance failed")

    def persist_proposal():
        output = rebalance["structured_output"]
        version = (session.scalar(select(func.max(RebalanceProposal.version)).where(RebalanceProposal.portfolio_id == portfolio.id)) or 0) + 1
        proposal = RebalanceProposal(
            portfolio_id=portfolio.id,
            target_allocation_id=allocation.id,
            status="draft",
            rationale="组合偏离与集中度规则生成的调仓草案。",
            expected_effect={"target_fund_weights": request.target_fund_weights},
            constraint_results={"triggered": output["triggered"], "threshold": output["threshold"]},
            created_by=request.actor_id,
            version=version,
        )
        session.add(proposal)
        session.flush()
        code_to_fund = {value: key for key, value in identifiers.items()}
        for trade in output["trades"]:
            fund_id = code_to_fund.get(trade["fund_code"])
            if fund_id is None:
                identifier = session.scalar(
                    select(FundIdentifier).where(
                        FundIdentifier.identifier_type == "ifind_code",
                        FundIdentifier.identifier_value == trade["fund_code"],
                    )
                )
                fund_id = identifier.fund_id if identifier else None
            if fund_id is None:
                raise WorkflowExecutionError(f"目标基金未进入 Universe：{trade['fund_code']}")
            session.add(
                RebalanceTrade(
                    proposal_id=proposal.id,
                    fund_id=fund_id,
                    action=trade["action"],
                    current_weight=trade["current_weight"],
                    target_weight=trade["target_weight"],
                    delta_weight=trade["delta_weight"],
                    priority="normal",
                    reason="权重偏离超过 5% 阈值",
                )
            )
        session.flush()
        return {"rebalance_proposal_id": proposal.id, "trade_count": len(output["trades"]), "triggered": output["triggered"]}

    proposal = execution.step("persist_rebalance_proposal", {"rebalance_skill_run_id": rebalance["skill_run_id"]}, persist_proposal)

    def create_draft_recommendation():
        version = (session.scalar(select(func.max(Recommendation.version)).where(Recommendation.client_id == portfolio.client_id)) or 0) + 1
        recommendation = Recommendation(
            client_id=portfolio.client_id,
            portfolio_id=portfolio.id,
            recommendation_type="rebalance",
            status="draft",
            created_by=request.actor_id,
            workflow_run_id=execution.run.id,
            data_snapshot_ids=request.source_snapshot_ids,
            skills_used=["fund-advisor-strategy", "portfolio-rebalance"],
            reasoning_summary=f"组合诊断与偏离规则形成的草案，关联提案 {proposal['rebalance_proposal_id']}。",
            risk_disclosure="基金净值可能波动，历史表现不代表未来；本建议须经适当性与人工合规审核。",
            compliance_status="not_reviewed",
            version=version,
        )
        session.add(recommendation)
        session.flush()
        outcome = "pass" if request.proposed_max_drawdown <= float(profile.max_acceptable_drawdown) else "fail"
        assessment = SuitabilityAssessment(
            client_profile_id=profile.id,
            recommendation_id=recommendation.id,
            rules_version="suitability-drawdown-v1",
            outcome=outcome,
            rule_results={
                "proposed_max_drawdown": request.proposed_max_drawdown,
                "client_max_acceptable_drawdown": float(profile.max_acceptable_drawdown),
            },
            missing_fields=[],
        )
        session.add(assessment)
        session.flush()
        return {"recommendation_id": recommendation.id, "status": recommendation.status, "suitability_outcome": outcome}

    recommendation = execution.step("draft_recommendation_and_suitability", {"proposal_id": proposal["rebalance_proposal_id"]}, create_draft_recommendation)
    workflow = execution.complete()
    return {
        "workflow_run_id": workflow.id,
        "status": workflow.status,
        "portfolio_evaluation": portfolio_evaluation,
        "rebalance_proposal": proposal,
        "recommendation": recommendation,
        "human_approval_required": True,
    }

