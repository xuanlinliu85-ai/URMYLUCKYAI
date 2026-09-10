from sqlalchemy import inspect

from fund_allocation_api.database import Base


def test_phase_one_core_tables_exist(session) -> None:
    tables = set(inspect(session.bind).get_table_names())
    required = {
        "users",
        "clients",
        "client_profiles",
        "consents",
        "funds",
        "fund_managers",
        "manager_tenures",
        "fund_universe_records",
        "comparable_groups",
        "fund_research",
        "fund_screening_results",
        "fund_similarities",
        "fund_roles",
        "fund_pool_memberships",
        "fund_pools",
        "asset_allocations",
        "portfolios",
        "portfolio_holdings",
        "rebalance_proposals",
        "rebalance_trades",
        "recommendations",
        "suitability_assessments",
        "client_communications",
        "events",
        "workflow_runs",
        "workflow_step_runs",
        "skill_runs",
        "skill_definitions",
        "data_sources",
        "data_source_snapshots",
        "data_quality_issues",
        "audit_logs",
        "job_definitions",
        "job_runs",
        "automation_tasks",
    }
    assert required <= tables
    assert len(Base.metadata.tables) >= 33
