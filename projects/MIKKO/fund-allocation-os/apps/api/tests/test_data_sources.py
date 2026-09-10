from datetime import datetime, timezone

from fund_allocation_api.data_sources import record_data_snapshot
from fund_allocation_api.skill_adapter.contracts import SkillContext, SourceReference
from fund_allocation_api.skill_adapter.service import run_skill


def test_snapshot_is_hashed_and_can_be_attached_to_skill_run(session) -> None:
    snapshot = record_data_snapshot(
        session,
        provider="iFinD MCP",
        dataset="fund_adjusted_nav",
        request={"fund_code": "519702.OF"},
        raw_payload={"data": [{"date": "2026-08-17", "nav": 5.1}]},
        as_of=datetime(2026, 8, 17, tzinfo=timezone.utc),
        schema_version="ifind-nav-v1",
        quality_status="validated",
    )
    result = run_skill(
        session,
        "fund-metrics",
        {
            "fund_code": "519702.OF",
            "source_snapshot_id": snapshot.id,
            "nav": [
                {"date": "2026-08-16", "value": 5.0},
                {"date": "2026-08-17", "value": 5.1},
            ],
        },
        SkillContext(
            data_snapshot_ids=[snapshot.id],
            source_references=[
                SourceReference(
                    source="iFinD MCP",
                    snapshot_id=snapshot.id,
                    as_of=datetime(2026, 8, 17, tzinfo=timezone.utc),
                    quality_status="validated",
                )
            ],
        ),
    )
    assert len(snapshot.raw_hash) == 64
    assert result.status == "success"
    assert result.sources[0].source == "iFinD MCP"


def test_missing_snapshot_id_fails_without_guessing(session) -> None:
    result = run_skill(
        session,
        "fund-universe-screener",
        {"candidates": []},
        SkillContext(data_snapshot_ids=["not-real"]),
    )
    assert result.status == "failed"
    assert result.error_code == "DATA_SNAPSHOT_NOT_FOUND"

