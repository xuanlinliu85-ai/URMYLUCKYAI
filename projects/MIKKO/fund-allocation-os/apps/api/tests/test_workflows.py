from datetime import date, datetime, timezone

from sqlalchemy import func, select

from fund_allocation_api.data_sources import record_data_snapshot
from fund_allocation_api.models import (
    AssetAllocation,
    Client,
    ClientProfile,
    ClientCommunication,
    Event,
    FundIdentifier,
    FundEvaluation,
    FundResearch,
    FundPoolMembership,
    FundScreeningResult,
    FundUniverseRecord,
    Portfolio,
    PortfolioHolding,
    RebalanceProposal,
    Recommendation,
    SkillRun,
    SuitabilityAssessment,
    User,
    WorkflowRun,
    WorkflowStepRun,
)
from fund_allocation_api.workflows.discovery import DiscoveryWorkflowInput, run_discovery_workflow
from fund_allocation_api.workflows.fund_research import FundResearchWorkflowInput, run_fund_research_workflow
from fund_allocation_api.workflows.portfolio_diagnosis import (
    PortfolioDiagnosisWorkflowInput,
    run_portfolio_diagnosis_workflow,
)
from fund_allocation_api.workflows.pool_maintenance import (
    PoolMaintenanceWorkflowInput,
    run_pool_maintenance_workflow,
)
from fund_allocation_api.workflows.companion import CompanionWorkflowInput, run_companion_workflow
from fund_allocation_api.state_machine import transition_recommendation


def seed_snapshot(session):
    return record_data_snapshot(
        session,
        provider="iFinD MCP",
        dataset="fund_universe",
        request={"query": "全部公募基金"},
        raw_payload={"rows": 2},
        as_of=datetime(2026, 8, 17, tzinfo=timezone.utc),
        schema_version="ifind-universe-v1",
        quality_status="validated",
    )


def test_workflow_e_then_workflow_a_are_fully_traceable(session) -> None:
    snapshot = seed_snapshot(session)
    discovery = run_discovery_workflow(
        session,
        DiscoveryWorkflowInput(
            universe_date=date(2026, 8, 17),
            source_snapshot_id=snapshot.id,
            funds=[
                {
                    "fund_code": "000001.OF",
                    "fund_name": "示例偏股一号",
                    "investment_type": "偏股混合型",
                    "aum": 2e9,
                    "history_days": 1500,
                    "annualized_return": 0.15,
                    "annualized_volatility": 0.18,
                    "max_drawdown": 0.22,
                    "sharpe": 0.8,
                },
                {
                    "fund_code": "000002.OF",
                    "fund_name": "示例偏股二号",
                    "investment_type": "偏股混合型",
                    "aum": 1.5e9,
                    "history_days": 1500,
                    "annualized_return": 0.10,
                    "annualized_volatility": 0.17,
                    "max_drawdown": 0.20,
                    "sharpe": 0.6,
                },
            ],
        ),
    )
    assert discovery["status"] == "completed"
    assert discovery["screening"]["eligible_funds"] == 2
    assert session.scalar(select(func.count()).select_from(FundUniverseRecord)) == 2
    assert session.scalar(select(func.count()).select_from(FundScreeningResult)) == 2

    research = run_fund_research_workflow(
        session,
        FundResearchWorkflowInput(
            fund_code="000001.OF",
            as_of=date(2026, 8, 17),
            source_snapshot_ids=[snapshot.id],
            facts={"manager": "示例经理", "strategy": "均衡成长"},
            evidence_refs=["ifind://fund/000001.OF"],
            return_score=86,
            risk_score=80,
            manager_score=82,
            style_score=78,
            consistency_score=84,
            suitable_roles=["ALPHA_EQUITY"],
        ),
    )
    assert research["status"] == "completed"
    assert research["recommendation_created"] is False
    assert session.scalar(select(func.count()).select_from(FundResearch)) == 1
    assert session.scalar(select(func.count()).select_from(FundEvaluation)) == 1

    workflows = list(session.scalars(select(WorkflowRun).order_by(WorkflowRun.started_at)))
    assert [item.status for item in workflows] == ["completed", "completed"]
    assert session.scalar(select(func.count()).select_from(WorkflowStepRun)) == 9
    assert session.scalar(select(func.count()).select_from(SkillRun)) == 3


def test_workflow_b_creates_only_draft_recommendation(session) -> None:
    snapshot = seed_snapshot(session)
    run_discovery_workflow(
        session,
        DiscoveryWorkflowInput(
            universe_date=date(2026, 8, 17),
            source_snapshot_id=snapshot.id,
            funds=[
                {"fund_code": "000001.OF", "fund_name": "权益基金", "investment_type": "偏股混合型", "aum": 2e9, "history_days": 1500, "annualized_return": 0.15, "annualized_volatility": 0.18, "max_drawdown": 0.22, "sharpe": 0.8},
                {"fund_code": "000002.OF", "fund_name": "债券基金", "investment_type": "中长期纯债", "aum": 2e9, "history_days": 1500, "annualized_return": 0.05, "annualized_volatility": 0.03, "max_drawdown": 0.04, "sharpe": 1.0},
            ],
            minimum_group_size=1,
        ),
    )
    advisor = User(email="advisor-b@example.test", role="advisor")
    client_user = User(email="client-b@example.test", role="client")
    session.add_all([advisor, client_user])
    session.flush()
    client = Client(user_id=client_user.id, advisor_id=advisor.id, client_no="B-001")
    session.add(client)
    session.flush()
    profile = ClientProfile(
        client_id=client.id,
        version=1,
        risk_level="balanced",
        investment_goal="长期增值",
        horizon_months=60,
        max_acceptable_drawdown=0.20,
        questionnaire_version="v1",
    )
    allocation = AssetAllocation(client_id=client.id, version=1, methodology="risk-band-saa-v1")
    portfolio = Portfolio(client_id=client.id, name="主组合", valuation_date=date(2026, 8, 17))
    session.add_all([profile, allocation, portfolio])
    session.flush()
    identifiers = {
        item.identifier_value: item
        for item in session.scalars(select(FundIdentifier).where(FundIdentifier.identifier_value.in_(["000001.OF", "000002.OF"])))
    }
    session.add_all(
        [
            PortfolioHolding(portfolio_id=portfolio.id, fund_id=identifiers["000001.OF"].fund_id, as_of=date(2026, 8, 17), market_value=700000, weight=0.7, validation_status="validated"),
            PortfolioHolding(portfolio_id=portfolio.id, fund_id=identifiers["000002.OF"].fund_id, as_of=date(2026, 8, 17), market_value=300000, weight=0.3, validation_status="validated"),
        ]
    )
    session.flush()

    result = run_portfolio_diagnosis_workflow(
        session,
        PortfolioDiagnosisWorkflowInput(
            client_profile_id=profile.id,
            portfolio_id=portfolio.id,
            target_allocation_id=allocation.id,
            valuation_date=date(2026, 8, 17),
            target_fund_weights={"000001.OF": 0.5, "000002.OF": 0.5},
            asset_classes={"000001.OF": "equity", "000002.OF": "fixed_income"},
            fund_risk_metrics={
                "000001.OF": {"annualized_volatility": 0.18, "max_drawdown": 0.22},
                "000002.OF": {"annualized_volatility": 0.03, "max_drawdown": 0.04},
            },
            proposed_max_drawdown=0.18,
            source_snapshot_ids=[snapshot.id],
            actor_id=advisor.id,
        ),
    )
    recommendation = session.get(Recommendation, result["recommendation"]["recommendation_id"])
    assert result["human_approval_required"] is True
    assert recommendation.status == "draft"
    assert recommendation.compliance_status == "not_reviewed"
    assert session.scalar(select(func.count()).select_from(SuitabilityAssessment)) == 1
    assert session.scalar(select(func.count()).select_from(RebalanceProposal)) == 1


def test_workflow_d_creates_impact_event_and_c_only_creates_draft_communication(session) -> None:
    snapshot = seed_snapshot(session)
    run_discovery_workflow(
        session,
        DiscoveryWorkflowInput(
            universe_date=date(2026, 8, 17),
            source_snapshot_id=snapshot.id,
            minimum_group_size=2,
            funds=[
                {"fund_code": "000011.OF", "fund_name": "候选基金甲", "investment_type": "偏股混合型", "aum": 2e9, "history_days": 1500, "annualized_return": 0.15, "annualized_volatility": 0.18, "max_drawdown": 0.22, "sharpe": 0.8},
                {"fund_code": "000012.OF", "fund_name": "候选基金乙", "investment_type": "偏股混合型", "aum": 1e9, "history_days": 1500, "annualized_return": 0.10, "annualized_volatility": 0.20, "max_drawdown": 0.25, "sharpe": 0.5},
            ],
        ),
    )
    research = run_fund_research_workflow(
        session,
        FundResearchWorkflowInput(
            fund_code="000011.OF",
            as_of=date(2026, 8, 17),
            source_snapshot_ids=[snapshot.id],
            facts={"strategy": "主动权益"},
            evidence_refs=["ifind://fund/000011.OF"],
            return_score=90,
            risk_score=85,
            manager_score=88,
            style_score=80,
            consistency_score=86,
            suitable_roles=["ALPHA_EQUITY"],
        ),
    )
    advisor = User(email="advisor-d@example.test", role="advisor")
    client_user = User(email="client-d@example.test", role="client")
    session.add_all([advisor, client_user])
    session.flush()
    client = Client(user_id=client_user.id, advisor_id=advisor.id, client_no="D-001")
    session.add(client)
    session.flush()
    profile = ClientProfile(client_id=client.id, version=1, risk_level="balanced", investment_goal="长期增值", horizon_months=60, max_acceptable_drawdown=0.2, questionnaire_version="v1")
    portfolio = Portfolio(client_id=client.id, name="受影响组合", valuation_date=date(2026, 8, 17))
    session.add_all([profile, portfolio])
    session.flush()
    identifier = session.scalar(select(FundIdentifier).where(FundIdentifier.identifier_value == "000011.OF"))
    session.add(PortfolioHolding(portfolio_id=portfolio.id, fund_id=identifier.fund_id, as_of=date(2026, 8, 17), market_value=1000000, weight=1, validation_status="validated"))
    session.flush()

    added = run_pool_maintenance_workflow(
        session,
        PoolMaintenanceWorkflowInput(
            fund_evaluation_id=research["evaluation"]["fund_evaluation_id"],
            role_code="ALPHA_EQUITY",
            tier="core",
            action="add",
            reason="评价达到核心池标准",
            actor_id=advisor.id,
        ),
    )
    assert added["decision"]["status"] == "active"
    downgraded = run_pool_maintenance_workflow(
        session,
        PoolMaintenanceWorkflowInput(
            fund_evaluation_id=research["evaluation"]["fund_evaluation_id"],
            role_code="ALPHA_EQUITY",
            tier="watchlist",
            action="downgrade",
            reason="持续性需要观察",
            actor_id=advisor.id,
        ),
    )
    event = session.get(Event, downgraded["impacts"]["event_id"])
    assert portfolio.id in event.payload["impacted_portfolio_ids"]
    assert session.scalar(select(func.count()).select_from(FundPoolMembership)) == 2

    recommendation = Recommendation(
        client_id=client.id,
        portfolio_id=portfolio.id,
        recommendation_type="monitor",
        created_by=advisor.id,
        data_snapshot_ids=[snapshot.id],
        reasoning_summary="继续观察，不自动交易。",
        risk_disclosure="基金净值可能波动。",
    )
    session.add(recommendation)
    session.flush()
    transition_recommendation(session, recommendation, "pending_compliance", actor_id=advisor.id, reason="提交")
    session.add(SuitabilityAssessment(client_profile_id=profile.id, recommendation_id=recommendation.id, rules_version="v1", outcome="pass"))
    recommendation.compliance_status = "approved"
    recommendation.reviewer_id = advisor.id
    session.flush()
    transition_recommendation(session, recommendation, "approved", actor_id=advisor.id, reason="人工批准")

    companion = run_companion_workflow(
        session,
        CompanionWorkflowInput(
            event_id=event.id,
            recommendation_id=recommendation.id,
            approved_facts={"action": "继续观察", "fund_code": "000011.OF"},
            actor_id=advisor.id,
        ),
    )
    communication = session.get(ClientCommunication, companion["communication"]["client_communication_id"])
    assert companion["sent"] is False
    assert communication.status == "draft"
    assert communication.sent_at is None
