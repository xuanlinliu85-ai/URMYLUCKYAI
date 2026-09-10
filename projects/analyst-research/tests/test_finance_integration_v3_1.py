import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def registry():
    return json.loads((ROOT / "config" / "finance-capability-registry.json").read_text(encoding="utf-8"))

def test_all_eight_codex_projects_are_registered_once():
    projects = registry()["projects"]
    assert len(projects) == 8
    assert len({item["id"] for item in projects}) == 8
    assert {item["codexLabel"] for item in projects} == {"分析师天团", "MIKKO+KEVIN", "叙事判断", "每日复盘更新", "财报PPT计划", "PPT", "基金经理", "AA20"}

def test_every_production_capability_has_one_owner():
    owners = registry()["singleOwners"]
    assert owners
    assert all(isinstance(owner, str) and owner for owner in owners.values())

def test_flows_do_not_repeat_a_stage():
    for flow in registry()["flows"].values():
        assert len(flow) == len(set(flow))
        assert flow.count("deerflow") == 1
        assert flow[-1] == "ppt-factory"

def test_duplicate_entrypoints_are_explicitly_merged():
    decisions = registry()["dedupeDecisions"]
    assert decisions["earnings-research"] == "merged_into_earnings-analysis"
    assert decisions["analyst-consensus"] == "merged_into_analyst-dream-team-router"
