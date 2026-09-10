from __future__ import annotations

from datetime import date
from typing import Any

from pydantic import BaseModel, Field, model_validator

from ..calculation.metrics import NavPoint, calculate_nav_metrics
from ..calculation.screener import FundCandidate, ScreeningRules, screen_fund_universe
from .contracts import SkillContext, SkillPayload


class NavPointInput(BaseModel):
    date: date
    value: float = Field(gt=0)


class FundMetricsInput(BaseModel):
    fund_code: str
    nav: list[NavPointInput] = Field(min_length=2)
    risk_free_rate: float = 0.0
    source_snapshot_id: str | None = None


class ScreenerCandidateInput(BaseModel):
    fund_code: str
    peer_group: str
    aum: float | None = None
    history_days: int | None = None
    annualized_return: float | None = None
    annualized_volatility: float | None = None
    max_drawdown: float | None = None
    sharpe: float | None = None
    data_quality_status: str = "verified"


class FundScreenerInput(BaseModel):
    candidates: list[ScreenerCandidateInput]
    minimum_aum: float = 100_000_000
    minimum_history_days: int = 730
    maximum_drawdown: float = 0.50
    minimum_group_size: int = 2


class FundEvaluationInput(BaseModel):
    fund_code: str
    return_score: float = Field(ge=0, le=100)
    risk_score: float = Field(ge=0, le=100)
    manager_score: float = Field(ge=0, le=100)
    style_score: float = Field(ge=0, le=100)
    consistency_score: float = Field(ge=0, le=100)
    risk_flags: list[str] = Field(default_factory=list)
    suitable_roles: list[str] = Field(default_factory=list)


class RebalanceInput(BaseModel):
    current_weights: dict[str, float]
    target_weights: dict[str, float]
    threshold: float = Field(default=0.05, gt=0, le=1)

    @model_validator(mode="after")
    def validate_weights(self):
        if any(value < 0 for value in (*self.current_weights.values(), *self.target_weights.values())):
            raise ValueError("权重不可为负数")
        if abs(sum(self.current_weights.values()) - 1) > 0.01:
            raise ValueError("当前权重合计必须在 1% 容差内等于 1")
        if abs(sum(self.target_weights.values()) - 1) > 0.01:
            raise ValueError("目标权重合计必须在 1% 容差内等于 1")
        return self


class FinancialPlanInput(BaseModel):
    client_id: str
    risk_level: str
    investment_goal: str
    horizon_months: int = Field(gt=0)
    liquidity_need: str | None = None
    target_return: float | None = None
    max_acceptable_drawdown: float = Field(gt=0, le=1)


class ClientReviewInput(BaseModel):
    client_id: str
    profile_version: int = Field(gt=0)
    portfolio_metrics: dict[str, Any] = Field(default_factory=dict)
    open_events: list[dict[str, Any]] = Field(default_factory=list)
    changed_goals: list[str] = Field(default_factory=list)


class FundResearchInput(BaseModel):
    fund_code: str
    as_of: date
    facts: dict[str, Any]
    evidence_refs: list[str] = Field(min_length=1)
    limitations: list[str] = Field(default_factory=list)


class ManagerResearchInput(BaseModel):
    manager_name: str
    as_of: date
    tenure_facts: list[dict[str, Any]] = Field(default_factory=list)
    stated_process: list[str] = Field(default_factory=list)
    observed_behavior: list[str] = Field(default_factory=list)
    evidence_refs: list[str] = Field(min_length=1)


class QuarterHoldingInput(BaseModel):
    quarter: str
    holdings: dict[str, float]


class FundDiagnosisInput(BaseModel):
    fund_code: str
    quarters: list[QuarterHoldingInput] = Field(min_length=2)


class BondPlusEvaluationInput(BaseModel):
    fund_code: str
    bond_score: float = Field(ge=0, le=100)
    equity_enhancement_score: float = Field(ge=0, le=100)
    drawdown_control_score: float = Field(ge=0, le=100)
    liquidity_score: float = Field(ge=0, le=100)
    evidence_refs: list[str] = Field(min_length=1)


class PortfolioHoldingInput(BaseModel):
    fund_code: str
    weight: float = Field(ge=0, le=1)
    asset_class: str
    annualized_volatility: float | None = Field(default=None, ge=0)
    max_drawdown: float | None = Field(default=None, ge=0, le=1)


class PortfolioStrategyInput(BaseModel):
    portfolio_id: str
    holdings: list[PortfolioHoldingInput] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_total_weight(self):
        if abs(sum(item.weight for item in self.holdings) - 1) > 0.01:
            raise ValueError("组合权重合计必须在 1% 容差内等于 1")
        return self


class ApprovedRecommendationInput(BaseModel):
    recommendation_id: str
    recommendation_status: str
    approved_facts: dict[str, Any]
    risk_disclosure: str

    @model_validator(mode="after")
    def must_be_approved(self):
        if self.recommendation_status != "approved":
            raise ValueError("只有 approved Recommendation 才能渲染客户内容")
        return self


class CompanionInput(ApprovedRecommendationInput):
    event_type: str
    audience_state: str = "neutral"


class VolatilityCommunicationInput(ApprovedRecommendationInput):
    market_drawdown: float = Field(ge=0, le=1)
    audience_state: str = "concerned"


def fund_metrics_handler(input_data: FundMetricsInput, context: SkillContext) -> SkillPayload:
    points = [NavPoint(date=item.date, value=item.value) for item in input_data.nav]
    metrics = calculate_nav_metrics(points, risk_free_rate=input_data.risk_free_rate)
    return SkillPayload(
        structured_output={"fund_code": input_data.fund_code, "metrics": metrics},
        warnings=[] if input_data.source_snapshot_id else ["missing_source_snapshot_id"],
        sources=context.source_references,
    )


def fund_screener_handler(input_data: FundScreenerInput, context: SkillContext) -> SkillPayload:
    candidates = [FundCandidate(**item.model_dump()) for item in input_data.candidates]
    output = screen_fund_universe(
        candidates,
        ScreeningRules(
            minimum_aum=input_data.minimum_aum,
            minimum_history_days=input_data.minimum_history_days,
            maximum_drawdown=input_data.maximum_drawdown,
            minimum_group_size=input_data.minimum_group_size,
        ),
    )
    warnings = [] if context.source_references else ["missing_source_references"]
    return SkillPayload(structured_output=output, warnings=warnings, sources=context.source_references)


def fund_evaluation_handler(input_data: FundEvaluationInput, context: SkillContext) -> SkillPayload:
    weights = {
        "return_score": 0.25,
        "risk_score": 0.25,
        "manager_score": 0.20,
        "style_score": 0.15,
        "consistency_score": 0.15,
    }
    total = sum(getattr(input_data, field) * weight for field, weight in weights.items())
    penalty = min(len(input_data.risk_flags) * 3, 15)
    adjusted = max(0.0, total - penalty)
    rating = "A" if adjusted >= 85 else "B" if adjusted >= 70 else "C" if adjusted >= 55 else "D"
    return SkillPayload(
        structured_output={
            "fund_code": input_data.fund_code,
            "model_version": "r9alpha-deterministic-v1",
            "total_score": round(adjusted, 2),
            "rating": rating,
            "component_scores": {field: getattr(input_data, field) for field in weights},
            "risk_flags": input_data.risk_flags,
            "suitable_roles": input_data.suitable_roles,
            "decision_scope": "fund_evaluation_not_client_recommendation",
        },
        warnings=[] if context.source_references else ["missing_source_references"],
        sources=context.source_references,
    )


def rebalance_handler(input_data: RebalanceInput, context: SkillContext) -> SkillPayload:
    trades: list[dict[str, Any]] = []
    for fund_code in sorted(set(input_data.current_weights) | set(input_data.target_weights)):
        current = input_data.current_weights.get(fund_code, 0.0)
        target = input_data.target_weights.get(fund_code, 0.0)
        delta = target - current
        if abs(delta) >= input_data.threshold:
            trades.append(
                {
                    "fund_code": fund_code,
                    "action": "buy" if delta > 0 else "sell",
                    "current_weight": current,
                    "target_weight": target,
                    "delta_weight": delta,
                }
            )
    return SkillPayload(
        structured_output={
            "rules_version": "rebalance-drift-v1",
            "threshold": input_data.threshold,
            "triggered": bool(trades),
            "trades": sorted(trades, key=lambda item: abs(item["delta_weight"]), reverse=True),
            "status": "proposal_only",
        },
        warnings=["requires_suitability_and_human_approval"] if trades else [],
        sources=context.source_references,
    )


SAA_BY_RISK = {
    "conservative": {"equity": 0.10, "fixed_income": 0.55, "cash": 0.20, "gold": 0.10, "overseas": 0.05, "alternative": 0.00},
    "moderate": {"equity": 0.25, "fixed_income": 0.45, "cash": 0.10, "gold": 0.10, "overseas": 0.08, "alternative": 0.02},
    "balanced": {"equity": 0.40, "fixed_income": 0.30, "cash": 0.05, "gold": 0.10, "overseas": 0.10, "alternative": 0.05},
    "growth": {"equity": 0.55, "fixed_income": 0.20, "cash": 0.05, "gold": 0.08, "overseas": 0.10, "alternative": 0.02},
    "aggressive": {"equity": 0.70, "fixed_income": 0.10, "cash": 0.03, "gold": 0.05, "overseas": 0.10, "alternative": 0.02},
}


def financial_plan_handler(input_data: FinancialPlanInput, context: SkillContext) -> SkillPayload:
    allocation = SAA_BY_RISK.get(input_data.risk_level)
    if allocation is None:
        raise ValueError(f"不支持的风险等级：{input_data.risk_level}")
    targets = [
        {
            "asset_class": asset_class,
            "target_weight": weight,
            "min_weight": max(0.0, weight - 0.05),
            "max_weight": min(1.0, weight + 0.05),
            "rebalance_threshold": 0.05,
        }
        for asset_class, weight in allocation.items()
    ]
    return SkillPayload(
        structured_output={
            "client_profile": input_data.model_dump(mode="json"),
            "asset_allocation": {"methodology": "risk-band-saa-v1", "status": "draft", "targets": targets},
            "decision_scope": "planning_not_product_recommendation",
        },
        warnings=["requires_human_profile_approval"],
        sources=context.source_references,
    )


def client_review_handler(input_data: ClientReviewInput, context: SkillContext) -> SkillPayload:
    attention = []
    if input_data.changed_goals:
        attention.append("client_goals_changed")
    if input_data.open_events:
        attention.append("open_events_require_review")
    return SkillPayload(
        structured_output={
            "client_id": input_data.client_id,
            "profile_version": input_data.profile_version,
            "portfolio_metrics": input_data.portfolio_metrics,
            "open_events": input_data.open_events,
            "changed_goals": input_data.changed_goals,
            "attention_flags": attention,
            "decision_scope": "review_not_recommendation",
        },
        warnings=attention,
        sources=context.source_references,
    )


def fund_research_handler(input_data: FundResearchInput, context: SkillContext) -> SkillPayload:
    return SkillPayload(
        structured_output={
            "fund_code": input_data.fund_code,
            "as_of": input_data.as_of.isoformat(),
            "facts": input_data.facts,
            "evidence_refs": input_data.evidence_refs,
            "limitations": input_data.limitations,
            "status": "research_complete_with_limitations" if input_data.limitations else "research_complete",
            "decision_scope": "research_not_recommendation",
        },
        warnings=input_data.limitations,
        sources=context.source_references,
    )


def manager_research_handler(input_data: ManagerResearchInput, context: SkillContext) -> SkillPayload:
    observed = set(input_data.observed_behavior)
    stated = set(input_data.stated_process)
    overlap = sorted(observed & stated)
    return SkillPayload(
        structured_output={
            "manager_name": input_data.manager_name,
            "as_of": input_data.as_of.isoformat(),
            "tenure_facts": input_data.tenure_facts,
            "stated_process": input_data.stated_process,
            "observed_behavior": input_data.observed_behavior,
            "stated_observed_overlap": overlap,
            "evidence_refs": input_data.evidence_refs,
            "decision_scope": "manager_research_not_recommendation",
        },
        sources=context.source_references,
    )


def fund_diagnosis_handler(input_data: FundDiagnosisInput, context: SkillContext) -> SkillPayload:
    ordered = sorted(input_data.quarters, key=lambda item: item.quarter)
    quarter_results = []
    changes = []
    for quarter in ordered:
        weights = quarter.holdings
        quarter_results.append(
            {
                "quarter": quarter.quarter,
                "holding_count": len(weights),
                "top10_weight": sum(sorted(weights.values(), reverse=True)[:10]),
            }
        )
    for previous, current in zip(ordered, ordered[1:]):
        previous_codes, current_codes = set(previous.holdings), set(current.holdings)
        changes.append(
            {
                "from": previous.quarter,
                "to": current.quarter,
                "new": sorted(current_codes - previous_codes),
                "removed": sorted(previous_codes - current_codes),
                "holding_overlap": sum(
                    min(previous.holdings.get(code, 0), current.holdings.get(code, 0))
                    for code in previous_codes | current_codes
                ),
            }
        )
    return SkillPayload(
        structured_output={
            "fund_code": input_data.fund_code,
            "quarters": quarter_results,
            "changes": changes,
            "diagnosis_version": "quarter-holdings-v1",
            "decision_scope": "diagnosis_not_recommendation",
        },
        sources=context.source_references,
    )


def bond_plus_handler(input_data: BondPlusEvaluationInput, context: SkillContext) -> SkillPayload:
    score = (
        input_data.bond_score * 0.35
        + input_data.equity_enhancement_score * 0.20
        + input_data.drawdown_control_score * 0.30
        + input_data.liquidity_score * 0.15
    )
    rating = "A" if score >= 85 else "B" if score >= 70 else "C" if score >= 55 else "D"
    return SkillPayload(
        structured_output={
            "fund_code": input_data.fund_code,
            "evaluation_type": "bond_plus",
            "model_version": "bond-plus-v1",
            "total_score": round(score, 2),
            "rating": rating,
            "evidence_refs": input_data.evidence_refs,
            "decision_scope": "fund_evaluation_not_client_recommendation",
        },
        sources=context.source_references,
    )


def portfolio_strategy_handler(input_data: PortfolioStrategyInput, context: SkillContext) -> SkillPayload:
    asset_weights: dict[str, float] = {}
    for holding in input_data.holdings:
        asset_weights[holding.asset_class] = asset_weights.get(holding.asset_class, 0.0) + holding.weight
    largest = max(input_data.holdings, key=lambda item: item.weight)
    missing_risk = [item.fund_code for item in input_data.holdings if item.max_drawdown is None]
    return SkillPayload(
        structured_output={
            "portfolio_id": input_data.portfolio_id,
            "asset_weights": asset_weights,
            "largest_holding": {"fund_code": largest.fund_code, "weight": largest.weight},
            "fund_concentration": sum(item.weight**2 for item in input_data.holdings),
            "biggest_problem": "single_fund_concentration" if largest.weight > 0.30 else None,
            "biggest_risk": "missing_risk_data" if missing_risk else None,
            "missing_risk_funds": missing_risk,
            "decision_scope": "portfolio_analysis_not_recommendation",
        },
        warnings=["missing_risk_data"] if missing_risk else [],
        sources=context.source_references,
    )


def investment_proposal_handler(input_data: ApprovedRecommendationInput, context: SkillContext) -> SkillPayload:
    fact_lines = [f"{key}: {value}" for key, value in sorted(input_data.approved_facts.items())]
    content = "\n".join(["已审核配置建议", *fact_lines, f"风险提示: {input_data.risk_disclosure}"])
    return SkillPayload(
        structured_output={
            "recommendation_id": input_data.recommendation_id,
            "approved_facts": input_data.approved_facts,
            "content": content,
            "status": "draft_communication",
        },
        narrative_output=content,
        sources=context.source_references,
    )


def companion_handler(input_data: CompanionInput, context: SkillContext) -> SkillPayload:
    content = (
        f"事件：{input_data.event_type}。当前内容仅解释已审核事实："
        f"{input_data.approved_facts}。风险提示：{input_data.risk_disclosure}"
    )
    return SkillPayload(
        structured_output={
            "recommendation_id": input_data.recommendation_id,
            "event_type": input_data.event_type,
            "audience_state": input_data.audience_state,
            "approved_facts": input_data.approved_facts,
            "content": content,
            "status": "draft_communication",
        },
        narrative_output=content,
        sources=context.source_references,
    )


def volatility_handler(input_data: VolatilityCommunicationInput, context: SkillContext) -> SkillPayload:
    severity = "high" if input_data.market_drawdown >= 0.10 else "medium" if input_data.market_drawdown >= 0.05 else "low"
    content = (
        f"市场波动级别：{severity}；区间回撤：{input_data.market_drawdown:.1%}。"
        f"已审核事实：{input_data.approved_facts}。风险提示：{input_data.risk_disclosure}"
    )
    return SkillPayload(
        structured_output={
            "recommendation_id": input_data.recommendation_id,
            "severity": severity,
            "market_drawdown": input_data.market_drawdown,
            "approved_facts": input_data.approved_facts,
            "content": content,
            "status": "draft_communication",
        },
        narrative_output=content,
        sources=context.source_references,
    )
