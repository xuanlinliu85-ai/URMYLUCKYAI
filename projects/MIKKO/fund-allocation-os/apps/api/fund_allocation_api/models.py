from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any
from uuid import uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


def new_id() -> str:
    return str(uuid4())


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class IdMixin:
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)


class User(IdMixin, TimestampMixin, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False)
    role: Mapped[str] = mapped_column(String(32), default="client")
    account_status: Mapped[str] = mapped_column(String(32), default="active")
    identity_provider: Mapped[str | None] = mapped_column(String(64))


class Consent(IdMixin, Base):
    __tablename__ = "consents"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    consent_type: Mapped[str] = mapped_column(String(64))
    document_version: Mapped[str] = mapped_column(String(32))
    granted: Mapped[bool] = mapped_column(Boolean, default=False)
    granted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    evidence_ref: Mapped[str | None] = mapped_column(String(512))


class Client(IdMixin, TimestampMixin, Base):
    __tablename__ = "clients"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), unique=True)
    advisor_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    client_no: Mapped[str] = mapped_column(String(64), unique=True)
    status: Mapped[str] = mapped_column(String(32), default="active")
    base_currency: Mapped[str] = mapped_column(String(3), default="CNY")


class ClientProfile(IdMixin, Base):
    __tablename__ = "client_profiles"
    __table_args__ = (UniqueConstraint("client_id", "version"),)

    client_id: Mapped[str] = mapped_column(ForeignKey("clients.id"), index=True)
    version: Mapped[int] = mapped_column(Integer)
    effective_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    risk_level: Mapped[str] = mapped_column(String(32))
    risk_score: Mapped[Decimal | None] = mapped_column(Numeric(8, 4))
    investment_goal: Mapped[str] = mapped_column(Text)
    horizon_months: Mapped[int] = mapped_column(Integer)
    liquidity_need: Mapped[str | None] = mapped_column(Text)
    target_return: Mapped[Decimal | None] = mapped_column(Numeric(8, 6))
    max_acceptable_drawdown: Mapped[Decimal] = mapped_column(Numeric(8, 6))
    investment_experience: Mapped[str | None] = mapped_column(String(64))
    purchase_mode: Mapped[str | None] = mapped_column(String(64))
    current_emotion: Mapped[str | None] = mapped_column(String(64))
    constraints_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    questionnaire_version: Mapped[str] = mapped_column(String(32))
    approved_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))


class Fund(IdMixin, TimestampMixin, Base):
    __tablename__ = "funds"

    canonical_name: Mapped[str] = mapped_column(String(256), index=True)
    fund_type: Mapped[str | None] = mapped_column(String(128), index=True)
    strategy_type: Mapped[str | None] = mapped_column(String(128))
    domicile: Mapped[str] = mapped_column(String(32), default="CN")
    status: Mapped[str] = mapped_column(String(32), default="active")
    inception_date: Mapped[date | None] = mapped_column(Date)


class FundIdentifier(IdMixin, Base):
    __tablename__ = "fund_identifiers"
    __table_args__ = (UniqueConstraint("identifier_type", "identifier_value"),)

    fund_id: Mapped[str] = mapped_column(ForeignKey("funds.id"), index=True)
    identifier_type: Mapped[str] = mapped_column(String(32), default="ifind_code")
    identifier_value: Mapped[str] = mapped_column(String(64), index=True)
    share_class: Mapped[str | None] = mapped_column(String(32))
    valid_from: Mapped[date | None] = mapped_column(Date)
    valid_to: Mapped[date | None] = mapped_column(Date)
    source_id: Mapped[str | None] = mapped_column(ForeignKey("data_sources.id"))


class FundManager(IdMixin, TimestampMixin, Base):
    __tablename__ = "fund_managers"

    name: Mapped[str] = mapped_column(String(128), index=True)
    profile: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class ManagerTenure(IdMixin, Base):
    __tablename__ = "manager_tenures"
    __table_args__ = (UniqueConstraint("manager_id", "fund_id", "start_date"),)

    manager_id: Mapped[str] = mapped_column(ForeignKey("fund_managers.id"), index=True)
    fund_id: Mapped[str] = mapped_column(ForeignKey("funds.id"), index=True)
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    role: Mapped[str | None] = mapped_column(String(64))
    source_snapshot_id: Mapped[str | None] = mapped_column(ForeignKey("data_source_snapshots.id"))


class DataSource(IdMixin, TimestampMixin, Base):
    __tablename__ = "data_sources"
    __table_args__ = (UniqueConstraint("provider", "dataset"),)

    provider: Mapped[str] = mapped_column(String(64), index=True)
    dataset: Mapped[str] = mapped_column(String(128))
    license_scope: Mapped[str | None] = mapped_column(String(256))
    priority: Mapped[int] = mapped_column(Integer, default=100)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class DataSourceSnapshot(IdMixin, Base):
    __tablename__ = "data_source_snapshots"

    source_id: Mapped[str] = mapped_column(ForeignKey("data_sources.id"), index=True)
    request_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    as_of: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ingested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    raw_hash: Mapped[str] = mapped_column(String(64))
    storage_ref: Mapped[str | None] = mapped_column(String(512))
    schema_version: Mapped[str] = mapped_column(String(32))
    quality_status: Mapped[str] = mapped_column(String(32), default="unverified")


class DataQualityIssue(IdMixin, TimestampMixin, Base):
    __tablename__ = "data_quality_issues"

    source_snapshot_id: Mapped[str] = mapped_column(ForeignKey("data_source_snapshots.id"), index=True)
    field: Mapped[str | None] = mapped_column(String(128))
    issue_type: Mapped[str] = mapped_column(String(64))
    severity: Mapped[str] = mapped_column(String(32))
    conflicting_sources: Mapped[list[str]] = mapped_column(JSON, default=list)
    resolution_status: Mapped[str] = mapped_column(String(32), default="open")
    reviewer_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))


class FundUniverseRecord(IdMixin, Base):
    __tablename__ = "fund_universe_records"
    __table_args__ = (UniqueConstraint("fund_id", "universe_date", "source_snapshot_id"),)

    fund_id: Mapped[str] = mapped_column(ForeignKey("funds.id"), index=True)
    universe_date: Mapped[date] = mapped_column(Date, index=True)
    peer_group_code: Mapped[str | None] = mapped_column(String(64), index=True)
    manager_name: Mapped[str | None] = mapped_column(String(128))
    manager_start_date: Mapped[date | None] = mapped_column(Date)
    aum: Mapped[Decimal | None] = mapped_column(Numeric(22, 4))
    aum_currency: Mapped[str] = mapped_column(String(3), default="CNY")
    nav: Mapped[Decimal | None] = mapped_column(Numeric(18, 8))
    nav_date: Mapped[date | None] = mapped_column(Date)
    metrics_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    style_tags: Mapped[list[str]] = mapped_column(JSON, default=list)
    data_quality_status: Mapped[str] = mapped_column(String(32), default="unverified")
    source_snapshot_id: Mapped[str] = mapped_column(ForeignKey("data_source_snapshots.id"))


class ComparableGroup(IdMixin, TimestampMixin, Base):
    __tablename__ = "comparable_groups"

    code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(128))
    parent_id: Mapped[str | None] = mapped_column(ForeignKey("comparable_groups.id"))
    definition: Mapped[str] = mapped_column(Text)
    inclusion_rules: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    exclusion_rules: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    version: Mapped[str] = mapped_column(String(32))
    active_from: Mapped[date] = mapped_column(Date)


class FundEvaluation(IdMixin, TimestampMixin, Base):
    __tablename__ = "fund_evaluations"
    __table_args__ = (
        UniqueConstraint("fund_id", "evaluation_date", "model_version"),
        CheckConstraint("total_score >= 0 AND total_score <= 100", name="ck_evaluation_score"),
    )

    fund_id: Mapped[str] = mapped_column(ForeignKey("funds.id"), index=True)
    evaluation_date: Mapped[date] = mapped_column(Date, index=True)
    model_version: Mapped[str] = mapped_column(String(32))
    total_score: Mapped[Decimal] = mapped_column(Numeric(6, 2))
    rating: Mapped[str] = mapped_column(String(1))
    component_scores: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    risk_flags: Mapped[list[str]] = mapped_column(JSON, default=list)
    suitable_roles: Mapped[list[str]] = mapped_column(JSON, default=list)
    suitable_clients: Mapped[list[str]] = mapped_column(JSON, default=list)
    conclusion: Mapped[str] = mapped_column(Text)
    source_version: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(32), default="draft")
    reviewer_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))


class FundResearch(IdMixin, TimestampMixin, Base):
    __tablename__ = "fund_research"
    __table_args__ = (UniqueConstraint("fund_id", "as_of", "research_type", "version"),)

    fund_id: Mapped[str] = mapped_column(ForeignKey("funds.id"), index=True)
    as_of: Mapped[date] = mapped_column(Date, index=True)
    research_type: Mapped[str] = mapped_column(String(64))
    facts_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    analysis_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    evidence_refs: Mapped[list[str]] = mapped_column(JSON, default=list)
    limitations: Mapped[list[str]] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(32), default="draft")
    version: Mapped[int] = mapped_column(Integer, default=1)
    workflow_run_id: Mapped[str | None] = mapped_column(ForeignKey("workflow_runs.id"))


class FundScreeningResult(IdMixin, TimestampMixin, Base):
    __tablename__ = "fund_screening_results"

    fund_id: Mapped[str] = mapped_column(ForeignKey("funds.id"), index=True)
    universe_date: Mapped[date] = mapped_column(Date, index=True)
    peer_group_code: Mapped[str] = mapped_column(String(64), index=True)
    rules_version: Mapped[str] = mapped_column(String(32))
    rank: Mapped[int | None] = mapped_column(Integer)
    percentile: Mapped[Decimal | None] = mapped_column(Numeric(8, 6))
    eligible: Mapped[bool] = mapped_column(Boolean)
    scores_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    flags: Mapped[list[str]] = mapped_column(JSON, default=list)
    reason: Mapped[str | None] = mapped_column(Text)


class FundSimilarity(IdMixin, Base):
    __tablename__ = "fund_similarities"
    __table_args__ = (
        UniqueConstraint("as_of", "fund_a_id", "fund_b_id", "method_version"),
        CheckConstraint("fund_a_id < fund_b_id", name="ck_fund_similarity_order"),
    )

    as_of: Mapped[date] = mapped_column(Date)
    fund_a_id: Mapped[str] = mapped_column(ForeignKey("funds.id"))
    fund_b_id: Mapped[str] = mapped_column(ForeignKey("funds.id"))
    overall_similarity: Mapped[Decimal] = mapped_column(Numeric(8, 6))
    components_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    method_version: Mapped[str] = mapped_column(String(32))


class FundRole(IdMixin, Base):
    __tablename__ = "fund_roles"

    code: Mapped[str] = mapped_column(String(64), unique=True)
    name: Mapped[str] = mapped_column(String(128))
    description: Mapped[str | None] = mapped_column(Text)


class FundPool(IdMixin, TimestampMixin, Base):
    __tablename__ = "fund_pools"
    __table_args__ = (UniqueConstraint("role_id", "peer_group_code", "version"),)

    role_id: Mapped[str] = mapped_column(ForeignKey("fund_roles.id"), index=True)
    peer_group_code: Mapped[str] = mapped_column(String(64), index=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String(32), default="active")
    methodology_version: Mapped[str] = mapped_column(String(32))


class FundPoolMembership(IdMixin, Base):
    __tablename__ = "fund_pool_memberships"

    fund_id: Mapped[str] = mapped_column(ForeignKey("funds.id"), index=True)
    pool_id: Mapped[str | None] = mapped_column(ForeignKey("fund_pools.id"), index=True)
    role_id: Mapped[str] = mapped_column(ForeignKey("fund_roles.id"), index=True)
    tier: Mapped[str] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(32), default="active")
    valid_from: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    valid_to: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decision_reason: Mapped[str] = mapped_column(Text)
    evaluation_id: Mapped[str] = mapped_column(ForeignKey("fund_evaluations.id"))
    approved_by: Mapped[str] = mapped_column(ForeignKey("users.id"))


class AssetAllocation(IdMixin, TimestampMixin, Base):
    __tablename__ = "asset_allocations"
    __table_args__ = (UniqueConstraint("client_id", "version"),)

    client_id: Mapped[str] = mapped_column(ForeignKey("clients.id"), index=True)
    version: Mapped[int] = mapped_column(Integer)
    methodology: Mapped[str] = mapped_column(String(128))
    effective_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    status: Mapped[str] = mapped_column(String(32), default="draft")
    approved_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))


class AssetAllocationTarget(IdMixin, Base):
    __tablename__ = "asset_allocation_targets"
    __table_args__ = (
        UniqueConstraint("allocation_id", "asset_class"),
        CheckConstraint("min_weight <= target_weight AND target_weight <= max_weight", name="ck_target_bounds"),
    )

    allocation_id: Mapped[str] = mapped_column(ForeignKey("asset_allocations.id"), index=True)
    asset_class: Mapped[str] = mapped_column(String(32))
    target_weight: Mapped[Decimal] = mapped_column(Numeric(8, 6))
    min_weight: Mapped[Decimal] = mapped_column(Numeric(8, 6))
    max_weight: Mapped[Decimal] = mapped_column(Numeric(8, 6))
    risk_budget: Mapped[Decimal | None] = mapped_column(Numeric(8, 6))
    rebalance_threshold: Mapped[Decimal] = mapped_column(Numeric(8, 6), default=Decimal("0.05"))


class Portfolio(IdMixin, TimestampMixin, Base):
    __tablename__ = "portfolios"

    client_id: Mapped[str] = mapped_column(ForeignKey("clients.id"), index=True)
    name: Mapped[str] = mapped_column(String(128))
    base_currency: Mapped[str] = mapped_column(String(3), default="CNY")
    status: Mapped[str] = mapped_column(String(32), default="active")
    valuation_date: Mapped[date | None] = mapped_column(Date)


class PortfolioHolding(IdMixin, Base):
    __tablename__ = "portfolio_holdings"
    __table_args__ = (UniqueConstraint("portfolio_id", "fund_id", "as_of"),)

    portfolio_id: Mapped[str] = mapped_column(ForeignKey("portfolios.id"), index=True)
    fund_id: Mapped[str] = mapped_column(ForeignKey("funds.id"), index=True)
    as_of: Mapped[date] = mapped_column(Date, index=True)
    units: Mapped[Decimal | None] = mapped_column(Numeric(22, 8))
    market_value: Mapped[Decimal] = mapped_column(Numeric(22, 4))
    cost_basis: Mapped[Decimal | None] = mapped_column(Numeric(22, 4))
    weight: Mapped[Decimal] = mapped_column(Numeric(8, 6))
    validation_status: Mapped[str] = mapped_column(String(32), default="unverified")
    source_snapshot_id: Mapped[str | None] = mapped_column(ForeignKey("data_source_snapshots.id"))


class PortfolioEvaluation(IdMixin, Base):
    __tablename__ = "portfolio_evaluations"
    __table_args__ = (UniqueConstraint("portfolio_id", "as_of", "calculation_version"),)

    portfolio_id: Mapped[str] = mapped_column(ForeignKey("portfolios.id"), index=True)
    as_of: Mapped[date] = mapped_column(Date)
    metrics_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    biggest_problem: Mapped[str | None] = mapped_column(Text)
    biggest_risk: Mapped[str | None] = mapped_column(Text)
    adjustment_needed: Mapped[bool] = mapped_column(Boolean, default=False)
    priority: Mapped[str | None] = mapped_column(String(32))
    calculation_version: Mapped[str] = mapped_column(String(32))


class RebalanceProposal(IdMixin, TimestampMixin, Base):
    __tablename__ = "rebalance_proposals"
    __table_args__ = (UniqueConstraint("portfolio_id", "version"),)

    portfolio_id: Mapped[str] = mapped_column(ForeignKey("portfolios.id"), index=True)
    trigger_event_id: Mapped[str | None] = mapped_column(ForeignKey("events.id"))
    target_allocation_id: Mapped[str] = mapped_column(ForeignKey("asset_allocations.id"))
    status: Mapped[str] = mapped_column(String(32), default="draft")
    rationale: Mapped[str] = mapped_column(Text)
    expected_effect: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    constraint_results: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    reviewed_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    version: Mapped[int] = mapped_column(Integer, default=1)


class RebalanceTrade(IdMixin, Base):
    __tablename__ = "rebalance_trades"

    proposal_id: Mapped[str] = mapped_column(ForeignKey("rebalance_proposals.id"), index=True)
    fund_id: Mapped[str] = mapped_column(ForeignKey("funds.id"))
    action: Mapped[str] = mapped_column(String(16))
    current_weight: Mapped[Decimal] = mapped_column(Numeric(8, 6))
    target_weight: Mapped[Decimal] = mapped_column(Numeric(8, 6))
    delta_weight: Mapped[Decimal] = mapped_column(Numeric(8, 6))
    estimated_amount: Mapped[Decimal | None] = mapped_column(Numeric(22, 4))
    priority: Mapped[str] = mapped_column(String(32))
    reason: Mapped[str] = mapped_column(Text)


class WorkflowRun(IdMixin, Base):
    __tablename__ = "workflow_runs"

    workflow_name: Mapped[str] = mapped_column(String(128), index=True)
    workflow_version: Mapped[str] = mapped_column(String(32))
    subject_type: Mapped[str] = mapped_column(String(64))
    subject_id: Mapped[str | None] = mapped_column(String(36), index=True)
    status: Mapped[str] = mapped_column(String(32), default="pending")
    input_hash: Mapped[str] = mapped_column(String(64))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    initiated_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))


class WorkflowStepRun(IdMixin, Base):
    __tablename__ = "workflow_step_runs"
    __table_args__ = (UniqueConstraint("workflow_run_id", "step_key", "attempt"),)

    workflow_run_id: Mapped[str] = mapped_column(ForeignKey("workflow_runs.id"), index=True)
    step_key: Mapped[str] = mapped_column(String(128))
    status: Mapped[str] = mapped_column(String(32), default="pending")
    input_snapshot: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    structured_output: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    output_ref: Mapped[str | None] = mapped_column(String(512))
    attempt: Mapped[int] = mapped_column(Integer, default=1)
    error_code: Mapped[str | None] = mapped_column(String(64))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class SkillRun(IdMixin, Base):
    __tablename__ = "skill_runs"

    workflow_run_id: Mapped[str] = mapped_column(ForeignKey("workflow_runs.id"), index=True)
    skill_name: Mapped[str] = mapped_column(String(128))
    skill_version: Mapped[str] = mapped_column(String(32))
    error_code: Mapped[str | None] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(32), default="pending")
    input_hash: Mapped[str] = mapped_column(String(64))
    model_version: Mapped[str | None] = mapped_column(String(128))
    prompt_hash: Mapped[str | None] = mapped_column(String(64))
    structured_output: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    narrative_output: Mapped[str | None] = mapped_column(Text)
    warnings: Mapped[list[str]] = mapped_column(JSON, default=list)
    source_snapshot_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class SkillDefinition(IdMixin, TimestampMixin, Base):
    __tablename__ = "skill_definitions"
    __table_args__ = (UniqueConstraint("name", "version"),)

    name: Mapped[str] = mapped_column(String(128), index=True)
    version: Mapped[str] = mapped_column(String(32))
    execution_type: Mapped[str] = mapped_column(String(32))
    input_schema: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    output_schema: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    source_ref: Mapped[str | None] = mapped_column(String(512))
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)


class Recommendation(IdMixin, TimestampMixin, Base):
    __tablename__ = "recommendations"
    __table_args__ = (UniqueConstraint("client_id", "version"),)

    client_id: Mapped[str] = mapped_column(ForeignKey("clients.id"), index=True)
    portfolio_id: Mapped[str | None] = mapped_column(ForeignKey("portfolios.id"))
    recommendation_type: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(32), default="draft", index=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    workflow_run_id: Mapped[str | None] = mapped_column(ForeignKey("workflow_runs.id"))
    data_snapshot_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    skills_used: Mapped[list[str]] = mapped_column(JSON, default=list)
    reasoning_summary: Mapped[str] = mapped_column(Text)
    risk_disclosure: Mapped[str] = mapped_column(Text)
    compliance_status: Mapped[str] = mapped_column(String(32), default="not_reviewed")
    reviewer_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    version: Mapped[int] = mapped_column(Integer, default=1)
    supersedes_id: Mapped[str | None] = mapped_column(ForeignKey("recommendations.id"))


class SuitabilityAssessment(IdMixin, TimestampMixin, Base):
    __tablename__ = "suitability_assessments"

    client_profile_id: Mapped[str] = mapped_column(ForeignKey("client_profiles.id"), index=True)
    recommendation_id: Mapped[str] = mapped_column(ForeignKey("recommendations.id"), index=True)
    rules_version: Mapped[str] = mapped_column(String(32))
    outcome: Mapped[str] = mapped_column(String(32), index=True)
    rule_results: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    missing_fields: Mapped[list[str]] = mapped_column(JSON, default=list)
    reviewed_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))


class Event(IdMixin, TimestampMixin, Base):
    __tablename__ = "events"

    event_type: Mapped[str] = mapped_column(String(64), index=True)
    detected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    effective_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    severity: Mapped[str] = mapped_column(String(32))
    subject_type: Mapped[str] = mapped_column(String(64))
    subject_id: Mapped[str] = mapped_column(String(36), index=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    rule_version: Mapped[str] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(32), default="open")
    dedup_key: Mapped[str] = mapped_column(String(256), unique=True)


class JobDefinition(IdMixin, TimestampMixin, Base):
    __tablename__ = "job_definitions"

    key: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    handler_name: Mapped[str] = mapped_column(String(128))
    schedule: Mapped[str | None] = mapped_column(String(64))
    max_attempts: Mapped[int] = mapped_column(Integer, default=3)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)


class JobRun(IdMixin, TimestampMixin, Base):
    __tablename__ = "job_runs"

    job_definition_id: Mapped[str] = mapped_column(ForeignKey("job_definitions.id"), index=True)
    idempotency_key: Mapped[str] = mapped_column(String(256), unique=True, index=True)
    subject_type: Mapped[str] = mapped_column(String(64))
    subject_id: Mapped[str] = mapped_column(String(128), index=True)
    status: Mapped[str] = mapped_column(String(32), default="pending", index=True)
    attempt_count: Mapped[int] = mapped_column(Integer, default=0)
    input_payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    output_payload: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    last_error: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AutomationTask(IdMixin, TimestampMixin, Base):
    __tablename__ = "automation_tasks"

    job_run_id: Mapped[str] = mapped_column(ForeignKey("job_runs.id"), index=True)
    event_id: Mapped[str | None] = mapped_column(ForeignKey("events.id"), index=True)
    task_type: Mapped[str] = mapped_column(String(64), index=True)
    subject_type: Mapped[str] = mapped_column(String(64))
    subject_id: Mapped[str] = mapped_column(String(128), index=True)
    title: Mapped[str] = mapped_column(String(256))
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(32), default="open", index=True)
    assigned_role: Mapped[str] = mapped_column(String(32), default="operations")
    dedup_key: Mapped[str] = mapped_column(String(256), unique=True)


class ClientCommunication(IdMixin, TimestampMixin, Base):
    __tablename__ = "client_communications"

    client_id: Mapped[str] = mapped_column(ForeignKey("clients.id"), index=True)
    event_id: Mapped[str | None] = mapped_column(ForeignKey("events.id"))
    recommendation_id: Mapped[str] = mapped_column(ForeignKey("recommendations.id"), index=True)
    channel: Mapped[str] = mapped_column(String(32))
    audience_state: Mapped[str | None] = mapped_column(String(64))
    template_version: Mapped[str] = mapped_column(String(32))
    approved_facts: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    content: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(32), default="draft")
    reviewer_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AuditLog(IdMixin, Base):
    __tablename__ = "audit_logs"

    actor_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), index=True)
    action: Mapped[str] = mapped_column(String(64), index=True)
    object_type: Mapped[str] = mapped_column(String(64), index=True)
    object_id: Mapped[str] = mapped_column(String(36), index=True)
    before_hash: Mapped[str | None] = mapped_column(String(64))
    after_hash: Mapped[str | None] = mapped_column(String(64))
    reason: Mapped[str | None] = mapped_column(Text)
    request_id: Mapped[str | None] = mapped_column(String(64), index=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True)
