from __future__ import annotations

from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..calculation.comparable_groups import resolve_comparable_group
from ..calculation.data_quality import validate_universe_rows
from ..models import (
    DataSourceSnapshot,
    Fund,
    FundIdentifier,
    FundScreeningResult,
    FundUniverseRecord,
)
from ..skill_adapter.contracts import SkillContext, SourceReference
from ..skill_adapter.service import run_skill
from .engine import WorkflowExecution, WorkflowExecutionError


class UniverseFundInput(BaseModel):
    fund_code: str
    fund_name: str
    investment_type: str
    fund_type: str | None = None
    inception_date: date | None = None
    aum: float | None = None
    nav: float | None = None
    nav_date: date | None = None
    history_days: int | None = None
    annualized_return: float | None = None
    annualized_volatility: float | None = None
    max_drawdown: float | None = None
    sharpe: float | None = None


class DiscoveryWorkflowInput(BaseModel):
    universe_date: date
    source_snapshot_id: str
    funds: list[UniverseFundInput] = Field(min_length=1)
    minimum_aum: float = 100_000_000
    minimum_history_days: int = 730
    maximum_drawdown: float = 0.50
    minimum_group_size: int = 2
    actor_id: str | None = None


def run_discovery_workflow(session: Session, request: DiscoveryWorkflowInput) -> dict[str, Any]:
    snapshot = session.get(DataSourceSnapshot, request.source_snapshot_id)
    if snapshot is None:
        raise WorkflowExecutionError("source_snapshot_id 不存在")
    raw_rows = [item.model_dump() for item in request.funds]
    execution = WorkflowExecution(
        session,
        name="workflow-e-fund-discovery",
        version="1.0.0",
        subject_type="fund_universe",
        subject_id=request.universe_date.isoformat(),
        input_data=request.model_dump(mode="json"),
        actor_id=request.actor_id,
    )

    quality = execution.step(
        "data_quality",
        {"source_snapshot_id": snapshot.id, "row_count": len(raw_rows)},
        lambda: validate_universe_rows(raw_rows),
    )
    quality_by_index = {item["row_index"]: item for item in quality["results"]}

    def map_groups():
        mapped = []
        for index, row in enumerate(raw_rows):
            quality_row = quality_by_index[index]
            if quality_row["quality_status"] == "invalid":
                continue
            resolution = resolve_comparable_group(row.get("investment_type"), row.get("fund_name"))
            mapped.append({**row, "peer_group": resolution.code, "group_quality": resolution.quality_status, "quality_status": quality_row["quality_status"]})
        return mapped

    mapped_rows = execution.step(
        "comparable_groups",
        {"taxonomy_version": "cn-public-fund-peer-groups-v1"},
        map_groups,
    )

    fund_ids: dict[str, str] = {}

    def persist_universe():
        for row in mapped_rows:
            identifier = session.scalar(
                select(FundIdentifier).where(
                    FundIdentifier.identifier_type == "ifind_code",
                    FundIdentifier.identifier_value == row["fund_code"],
                )
            )
            if identifier is None:
                fund = Fund(
                    canonical_name=row["fund_name"],
                    fund_type=row.get("fund_type") or row.get("investment_type"),
                    inception_date=row.get("inception_date"),
                )
                session.add(fund)
                session.flush()
                identifier = FundIdentifier(
                    fund_id=fund.id,
                    identifier_type="ifind_code",
                    identifier_value=row["fund_code"],
                    source_id=snapshot.source_id,
                )
                session.add(identifier)
            else:
                fund = session.get(Fund, identifier.fund_id)
                fund.canonical_name = row["fund_name"]
                fund.fund_type = row.get("fund_type") or row.get("investment_type")
            session.flush()
            fund_ids[row["fund_code"]] = fund.id
            existing = session.scalar(
                select(FundUniverseRecord).where(
                    FundUniverseRecord.fund_id == fund.id,
                    FundUniverseRecord.universe_date == request.universe_date,
                    FundUniverseRecord.source_snapshot_id == snapshot.id,
                )
            )
            if existing is None:
                session.add(
                    FundUniverseRecord(
                        fund_id=fund.id,
                        universe_date=request.universe_date,
                        peer_group_code=row.get("peer_group"),
                        aum=row.get("aum"),
                        nav=row.get("nav"),
                        nav_date=row.get("nav_date"),
                        metrics_json={
                            key: row.get(key)
                            for key in ("history_days", "annualized_return", "annualized_volatility", "max_drawdown", "sharpe")
                        },
                        data_quality_status="validated" if row.get("group_quality") == "mapped" else "warning",
                        source_snapshot_id=snapshot.id,
                    )
                )
        session.flush()
        return {"persisted_funds": len(fund_ids), "unmapped_groups": sum(row.get("peer_group") is None for row in mapped_rows)}

    persistence = execution.step("persist_universe", {"eligible_quality_rows": len(mapped_rows)}, persist_universe)

    candidates = [
        {
            "fund_code": row["fund_code"],
            "peer_group": row.get("peer_group") or "unmapped",
            "aum": row.get("aum"),
            "history_days": row.get("history_days"),
            "annualized_return": row.get("annualized_return"),
            "annualized_volatility": row.get("annualized_volatility"),
            "max_drawdown": row.get("max_drawdown"),
            "sharpe": row.get("sharpe"),
            "data_quality_status": "validated" if row.get("peer_group") else "unmapped",
        }
        for row in mapped_rows
    ]

    def screen():
        result = run_skill(
            session,
            "fund-universe-screener",
            {
                "candidates": candidates,
                "minimum_aum": request.minimum_aum,
                "minimum_history_days": request.minimum_history_days,
                "maximum_drawdown": request.maximum_drawdown,
                "minimum_group_size": request.minimum_group_size,
            },
            SkillContext(
                workflow_id=execution.run.id,
                subject_type="fund_universe",
                subject_id=request.universe_date.isoformat(),
                actor_id=request.actor_id,
                data_snapshot_ids=[snapshot.id],
                source_references=[
                    SourceReference(
                        source="iFinD MCP",
                        snapshot_id=snapshot.id,
                        as_of=snapshot.as_of,
                        quality_status=snapshot.quality_status,
                    )
                ],
            ),
        )
        if result.status == "failed":
            raise WorkflowExecutionError(result.error_code or "fund screener failed")
        return result.structured_output

    screening = execution.step("quant_screener", {"candidate_count": len(candidates)}, screen)

    def persist_screening():
        for row in screening["results"]:
            fund_id = fund_ids.get(row["fund_code"])
            if fund_id is None:
                continue
            session.add(
                FundScreeningResult(
                    fund_id=fund_id,
                    universe_date=request.universe_date,
                    peer_group_code=row["peer_group"],
                    rules_version=screening["screener_version"],
                    rank=row["rank"],
                    percentile=row["percentile"],
                    eligible=row["eligible"],
                    scores_json={"quantitative_score": row["quantitative_score"]},
                    flags=row["flags"],
                    reason=",".join(row["flags"]) or None,
                )
            )
        session.flush()
        return {"screening_results": len(screening["results"]), "eligible_funds": screening["eligible_funds"]}

    persisted_screening = execution.step("persist_candidate_pool", {"screener_version": screening["screener_version"]}, persist_screening)
    workflow = execution.complete()
    return {
        "workflow_run_id": workflow.id,
        "status": workflow.status,
        "quality": {key: quality[key] for key in ("total_rows", "validated_rows", "warning_rows", "invalid_rows")},
        "universe": persistence,
        "screening": persisted_screening,
    }
