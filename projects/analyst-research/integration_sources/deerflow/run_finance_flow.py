from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path


HERE = Path(__file__).resolve().parent
REGISTRY = HERE / "finance-capability-registry.json"
SCHEMA = HERE.parents[1] / "contracts" / "finance" / "research-artifact.schema.json"


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def project_path(project_id: str) -> Path:
    for project in load(REGISTRY)["projects"]:
        if project["id"] == project_id:
            return Path(project["path"])
    raise KeyError(project_id)


def node_executable() -> str:
    configured = os.environ.get("CODEX_NODE")
    candidates = [configured, shutil.which("node"), str(Path.home() / ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe")]
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return candidate
    raise RuntimeError("Node.js executable unavailable; set CODEX_NODE")


def validate_artifact(path: Path) -> dict:
    from jsonschema import Draft202012Validator, FormatChecker

    artifact = load(path)
    errors = sorted(Draft202012Validator(load(SCHEMA), format_checker=FormatChecker()).iter_errors(artifact), key=lambda item: list(item.path))
    if errors:
        raise ValueError("; ".join(error.message for error in errors[:5]))
    return artifact


def ppt_smoke(path: Path):
    ppt = project_path("ppt-factory")
    env = os.environ.copy()
    env["RESEARCH_ARTIFACT_FIXTURE"] = str(path)
    subprocess.run([node_executable(), "--test", "tests/research-artifact.test.mjs"], cwd=ppt, env=env, check=True)


def render_article(artifact: dict, output: Path):
    article = [f"# {artifact['title']}", "", f"研究截止：{artifact['as_of']}", "", "## 核心结论", ""]
    article.extend(f"- {item['statement']}" for item in artifact["conclusions"])
    article.extend(["", "## 事实底稿", ""])
    article.extend(f"- [{item['fact_id']}] {item['statement']}" for item in artifact["facts"])
    article.extend(["", "## 来源", ""])
    article.extend(f"- [{item['source_id']}] {item['title']}" for item in artifact["sources"])
    output.write_text("\n".join(article) + "\n", encoding="utf-8")


def run_market(output: Path):
    daily = project_path("daily-review")
    subprocess.run([node_executable(), "scripts/export-research-artifact.mjs", str(output)], cwd=daily, check=True)


def run_earnings(run_root: Path, output: Path):
    producer = project_path("earnings-analysis") / ".agents/skills/earnings-analysis/scripts/export_research_artifact.py"
    subprocess.run([sys.executable, str(producer), str(run_root), "--output", str(output)], check=True)


def run_macro(output: Path):
    mikko_report = project_path("mikko-kevin") / "output/storage-cycle-report/存储周期进入二阶导_完整分析.md"
    matt_map = project_path("matt") / "dist/client/data/macro-map.json"
    report = mikko_report.read_text(encoding="utf-8")
    mapping = load(matt_map)
    claims = [line[3:].strip() for line in report.splitlines() if line.startswith(("1. ", "2. ", "3. ", "4. "))][:4]
    if len(claims) != 4:
        raise ValueError("MIKKO+KEVIN source report lacks four core conclusions")
    ai_macro = next(item for item in mapping["macros"] if item["name"] == "全球AI资本开支扩张")
    ai_hardware = next(item for item in ai_macro["mesos"] if item["name"] == "AI硬件-AI芯片/算力")
    core_names = [item["name"] for item in ai_hardware["stocks"] if item.get("tier") in {"核心", "次核心"}]
    source_ids = ["S1", "S2"]
    artifact = {
        "schema_version": "1.0.0", "artifact_id": "analyst-synthesis-storage-cycle-2026-08", "artifact_type": "analyst_synthesis",
        "title": "存储周期：MIKKO+KEVIN 主框架与 MATT A股映射综合", "as_of": "2026-08-11", "generated_at": "2026-09-10T00:00:00+08:00",
        "subject": {"kind": "industry", "name": "AI存储周期", "identifiers": {}, "market": "global/CN", "period": "2026-2028"},
        "request": {"user_goal": "验证分析师 Router 对 MIKKO+KEVIN 与 MATT 的独立分工和综合输出", "requested_outputs": ["research_report", "ppt"], "constraints": ["复用既有研究档案", "禁止重复搜索"]},
        "facts": [
            {"fact_id": "F1", "statement": "MIKKO+KEVIN 已形成存储周期完整研究报告", "value": len(report), "unit": "characters", "timestamp": "2026-08-11", "status": "verified", "source_ids": ["S1"]},
            {"fact_id": "F2", "statement": "MATT 宏观—中观映射包含全球AI资本开支扩张→AI硬件-AI芯片/算力", "value": len(ai_hardware["stocks"]), "unit": "stocks", "timestamp": mapping.get("date"), "status": "verified", "source_ids": ["S2"]},
            {"fact_id": "F3", "statement": "MATT 映射中的核心与次核心标的", "value": "、".join(core_names), "unit": None, "timestamp": mapping.get("date"), "status": "verified", "source_ids": ["S2"]}
        ],
        "timeline": [], "drivers": [],
        "conclusions": [{"conclusion_id": f"C{i+1}", "statement": claim, "type": "primary" if i == 0 else "secondary", "fact_ids": ["F1"], "driver_ids": [], "source_ids": source_ids, "confidence": 0.75} for i, claim in enumerate(claims)],
        "risks": ["该流程复用历史研究档案，当前市场判断需另行刷新事实截止日。"], "watchpoints": [],
        "sources": [
            {"source_id": "S1", "title": mikko_report.name, "source_type": "research_archive", "provider": "MIKKO+KEVIN", "url": None, "published_at": "2026-08-11", "accessed_at": None, "notes": None},
            {"source_id": "S2", "title": matt_map.name, "source_type": "structured_data", "provider": "MATT", "url": None, "published_at": mapping.get("date"), "accessed_at": None, "notes": mapping.get("quality", {}).get("countDefinition")}
        ],
        "quality": {"date_verified": True, "fiscal_period_verified": None, "consensus_verified": None, "intraday_granularity": None, "unresolved_conflicts": [], "warnings": ["历史档案集成测试"]},
        "provenance": {"orchestrator": "deerflow", "project_owners": ["analyst-dream-team", "mikko-kevin", "matt"], "capabilities_used": ["multi_framework_routing", "personal_macro_default", "a_share_narrative_judgment"], "skills_used": ["analyst-dream-team-router", "mikko-kevin-research-system", "urmylucky-narrative-judgment"], "tools_used": [], "knowledge_refs": [str(mikko_report), str(matt_map)]}
    }
    output.write_text(json.dumps(artifact, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description="Run a local DeerFlow finance flow without repeating upstream research")
    parser.add_argument("flow", choices=("market", "earnings", "macro"))
    parser.add_argument("--run-root", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    if args.flow == "market":
        run_market(output)
    elif args.flow == "earnings":
        if args.run_root is None:
            parser.error("--run-root is required for earnings")
        run_earnings(args.run_root.resolve(), output)
    else:
        run_macro(output)
    before = hashlib.sha256(output.read_bytes()).hexdigest()
    artifact = validate_artifact(output)
    article_output = output.with_suffix(".article.md")
    render_article(artifact, article_output)
    ppt_smoke(output)
    after = hashlib.sha256(output.read_bytes()).hexdigest()
    if before != after:
        raise RuntimeError("PPT consumer mutated the canonical Research Artifact")
    print(json.dumps({"status": "pass", "flow": args.flow, "artifact_id": artifact["artifact_id"], "facts": len(artifact["facts"]), "sha256": after, "article": str(article_output), "research_repeated": False}, ensure_ascii=False))


if __name__ == "__main__":
    main()
