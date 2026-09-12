from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build(run_root: Path) -> dict:
    manifest = load(run_root / "run_manifest.json")
    fact_pack = load(run_root / "data" / "fact_pack.json")
    expectation_pack = load(run_root / "data" / "expectation_pack.json")
    research = load(run_root / "data" / "research_output.json")
    sources: dict[str, dict] = {}
    facts = []
    for item in fact_pack.get("datapoints", []):
        source_text = str(item.get("source") or "")
        source_id = "S" + hashlib.sha256(source_text.encode("utf-8")).hexdigest()[:10]
        sources.setdefault(source_id, {
            "source_id": source_id,
            "title": source_text or "Earnings fact pack source",
            "source_type": "structured_data" if "iFinD" in source_text else "company_filing",
            "provider": "iFinD MCP" if "iFinD" in source_text else None,
            "url": source_text if source_text.startswith("http") else None,
            "published_at": None,
            "accessed_at": None,
            "notes": f"evidence_id={item.get('evidence_id', '')}; basis={item.get('basis', '')}",
        })
        facts.append({
            "fact_id": str(item.get("evidence_id") or f"F{len(facts)+1}"),
            "statement": f"{item.get('metric')} ({item.get('period')})",
            "value": item.get("value"),
            "unit": item.get("unit"),
            "timestamp": item.get("period"),
            "status": "verified",
            "source_ids": [source_id],
        })
    consensus_verified = all(item.get("pre_earnings_consensus") is not None for item in expectation_pack.get("expectations", []))
    confidence = float(research.get("confidence", {}).get("score", 0.5))
    conclusions = [
        {"conclusion_id": "C1", "statement": research["core_view"], "type": "primary", "fact_ids": [], "driver_ids": [], "source_ids": [], "confidence": confidence},
        {"conclusion_id": "C2", "statement": research["expectation_gap"], "type": "secondary", "fact_ids": [], "driver_ids": [], "source_ids": [], "confidence": confidence},
        {"conclusion_id": "C3", "statement": research["final_view"], "type": "primary", "fact_ids": [], "driver_ids": [], "source_ids": [], "confidence": confidence},
    ]
    return {
        "schema_version": "1.0.0",
        "artifact_id": f"earnings-{manifest['ticker'].lower().replace('.', '-')}-{manifest['period'].lower()}",
        "artifact_type": "earnings_analysis",
        "title": f"{manifest['company']} {manifest['period']} 财报研究",
        "as_of": manifest["as_of"],
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "subject": {"kind": "company", "name": manifest["company"], "identifiers": {"ticker": manifest["ticker"]}, "market": fact_pack.get("market"), "period": manifest["period"]},
        "request": {"user_goal": "复用已完成的财报事实包、预期包和研究结论生成统一研究底稿", "requested_outputs": ["research_report", "ppt"], "constraints": ["保留财报期与预期快照口径", "下游不重新研究"]},
        "facts": facts,
        "timeline": [],
        "drivers": [],
        "conclusions": conclusions,
        "risks": manifest.get("known_gaps", []),
        "watchpoints": [],
        "sources": list(sources.values()),
        "quality": {"date_verified": True, "fiscal_period_verified": True, "consensus_verified": consensus_verified, "intraday_granularity": None, "unresolved_conflicts": [], "warnings": [] if consensus_verified else ["部分报告期专业一致预期快照缺失，预期差结论保留口径限制。"]},
        "provenance": {"orchestration_mode": "direct_research_os", "orchestrator": None, "project_owners": ["earnings-analysis"], "capabilities_used": ["earnings_research", "ifind_company_data"], "skills_used": ["earnings-analysis", "fundamental-review", "analyst-dream-team-router"], "tools_used": ["iFinD MCP"], "knowledge_refs": [f"{name}:sha256:{digest(run_root / name)}" for name in manifest["artifacts"] if (run_root / name).is_file()]},
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("run_root", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    output = args.output or args.run_root / "RESEARCH_ARTIFACT.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(build(args.run_root), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(output)


if __name__ == "__main__":
    main()
