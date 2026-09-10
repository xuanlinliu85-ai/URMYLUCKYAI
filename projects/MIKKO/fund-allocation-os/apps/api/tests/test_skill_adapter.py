from datetime import date

from sqlalchemy import func, select

from fund_allocation_api.models import SkillDefinition, SkillRun, WorkflowRun
from fund_allocation_api.skill_adapter.contracts import SkillContext
from fund_allocation_api.skill_adapter.registry import registry
from fund_allocation_api.skill_adapter.service import run_skill, sync_registry


def metric_input():
    return {
        "fund_code": "519702.OF",
        "nav": [
            {"date": date(2025, 1, 1), "value": 1.0},
            {"date": date(2025, 7, 1), "value": 0.9},
            {"date": date(2026, 1, 1), "value": 1.1},
        ],
    }


def test_registry_sync_and_deterministic_run(session) -> None:
    assert sync_registry(session) == 14
    assert session.scalar(select(func.count()).select_from(SkillDefinition)) == 14
    assert all(item.enabled for item in registry.list())

    first = run_skill(session, "fund-metrics", metric_input(), SkillContext())
    second = run_skill(session, "fund-metrics", metric_input(), SkillContext())
    assert first.status == "warning"
    assert first.input_hash == second.input_hash
    assert first.structured_output == second.structured_output
    assert session.scalar(select(func.count()).select_from(SkillRun)) == 2
    assert session.scalar(select(func.count()).select_from(WorkflowRun)) == 2


def test_invalid_runs_are_explicitly_recorded(session) -> None:
    invalid = run_skill(session, "fund-metrics", {"fund_code": "x", "nav": []})
    assert invalid.status == "failed"
    assert invalid.error_code == "INPUT_VALIDATION_ERROR"


def test_rebalance_is_proposal_only(session) -> None:
    result = run_skill(
        session,
        "portfolio-rebalance",
        {
            "current_weights": {"A.OF": 0.7, "B.OF": 0.3},
            "target_weights": {"A.OF": 0.5, "B.OF": 0.5},
            "threshold": 0.05,
        },
    )
    assert result.status == "warning"
    assert result.structured_output["status"] == "proposal_only"
    assert len(result.structured_output["trades"]) == 2


def test_renderer_refuses_unapproved_recommendation(session) -> None:
    result = run_skill(
        session,
        "investment-proposal",
        {
            "recommendation_id": "rec-1",
            "recommendation_status": "draft",
            "approved_facts": {"equity_weight": 0.4},
            "risk_disclosure": "净值可能波动。",
        },
    )
    assert result.status == "failed"
    assert result.error_code == "INPUT_VALIDATION_ERROR"


def test_financial_plan_has_six_asset_classes_and_no_product_recommendation(session) -> None:
    result = run_skill(
        session,
        "financial-plan",
        {
            "client_id": "client-1",
            "risk_level": "balanced",
            "investment_goal": "长期增值",
            "horizon_months": 60,
            "max_acceptable_drawdown": 0.2,
        },
    )
    targets = result.structured_output["asset_allocation"]["targets"]
    assert len(targets) == 6
    assert sum(item["target_weight"] for item in targets) == 1
    assert result.structured_output["decision_scope"] == "planning_not_product_recommendation"
