from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

from pydantic import BaseModel

from .contracts import SkillContext, SkillPayload
from .handlers import (
    ApprovedRecommendationInput,
    BondPlusEvaluationInput,
    ClientReviewInput,
    CompanionInput,
    FinancialPlanInput,
    FundEvaluationInput,
    FundDiagnosisInput,
    FundMetricsInput,
    FundResearchInput,
    FundScreenerInput,
    ManagerResearchInput,
    PortfolioStrategyInput,
    RebalanceInput,
    VolatilityCommunicationInput,
    bond_plus_handler,
    client_review_handler,
    companion_handler,
    financial_plan_handler,
    fund_diagnosis_handler,
    fund_evaluation_handler,
    fund_metrics_handler,
    fund_research_handler,
    fund_screener_handler,
    investment_proposal_handler,
    manager_research_handler,
    portfolio_strategy_handler,
    rebalance_handler,
    volatility_handler,
)


SkillHandler = Callable[[Any, SkillContext], SkillPayload]


@dataclass(frozen=True)
class RegisteredSkill:
    name: str
    version: str
    execution_type: str
    input_model: type[BaseModel] | None
    handler: SkillHandler | None
    source_ref: str

    @property
    def enabled(self) -> bool:
        return self.input_model is not None and self.handler is not None


class SkillRegistry:
    def __init__(self, definitions: list[RegisteredSkill]):
        self._definitions = {item.name: item for item in definitions}

    def get(self, name: str) -> RegisteredSkill | None:
        return self._definitions.get(name)

    def list(self) -> list[RegisteredSkill]:
        return sorted(self._definitions.values(), key=lambda item: item.name)


UPSTREAM = "upstream/OPC-skill/skills"

registry = SkillRegistry(
    [
        RegisteredSkill("fund-metrics", "1.0.0", "deterministic", FundMetricsInput, fund_metrics_handler, "native"),
        RegisteredSkill("fund-universe-screener", "1.0.0", "deterministic", FundScreenerInput, fund_screener_handler, "native"),
        RegisteredSkill("fund-r9alpha-evaluation", "1.0.0", "deterministic", FundEvaluationInput, fund_evaluation_handler, f"{UPSTREAM}/fund-r9alpha-evaluation"),
        RegisteredSkill("portfolio-rebalance", "1.0.0", "deterministic", RebalanceInput, rebalance_handler, f"{UPSTREAM}/portfolio-rebalance"),
        RegisteredSkill("financial-plan", "1.0.0", "workflow", FinancialPlanInput, financial_plan_handler, f"{UPSTREAM}/financial-plan"),
        RegisteredSkill("client-review", "1.0.0", "workflow", ClientReviewInput, client_review_handler, f"{UPSTREAM}/client-review"),
        RegisteredSkill("r9-fund-deep-research", "1.0.0", "research", FundResearchInput, fund_research_handler, f"{UPSTREAM}/r9-fund-deep-research"),
        RegisteredSkill("fund-manager-deep-research", "1.0.0", "research", ManagerResearchInput, manager_research_handler, f"{UPSTREAM}/fund-manager-deep-research"),
        RegisteredSkill("fund-diagnosis-3.10", "1.0.0", "deterministic", FundDiagnosisInput, fund_diagnosis_handler, f"{UPSTREAM}/fund-diagnosis-3.10"),
        RegisteredSkill("bond-plus-fund-evaluation", "1.0.0", "hybrid", BondPlusEvaluationInput, bond_plus_handler, f"{UPSTREAM}/bond-plus-fund-evaluation"),
        RegisteredSkill("fund-advisor-strategy", "1.0.0", "deterministic", PortfolioStrategyInput, portfolio_strategy_handler, f"{UPSTREAM}/fund-advisor-strategy"),
        RegisteredSkill("investment-proposal", "1.0.0", "renderer", ApprovedRecommendationInput, investment_proposal_handler, f"{UPSTREAM}/investment-proposal"),
        RegisteredSkill("post-investment-companion", "1.0.0", "renderer", CompanionInput, companion_handler, f"{UPSTREAM}/post-investment-companion"),
        RegisteredSkill("fund-market-volatility-script", "1.0.0", "renderer", VolatilityCommunicationInput, volatility_handler, f"{UPSTREAM}/fund-market-volatility-script"),
    ]
)
