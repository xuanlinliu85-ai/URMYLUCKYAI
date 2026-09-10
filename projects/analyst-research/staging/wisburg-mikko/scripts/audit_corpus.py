#!/usr/bin/env python3
"""Audit the author-filtered Wisburg/Mikko corpus without downloading article text."""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path


def find_root(path: Path) -> Path:
    for parent in path.parents:
        if (parent / "data" / "analysts" / "wisburg-mikko").is_dir():
            return parent
    raise RuntimeError("project root not found")


ROOT = find_root(Path(__file__).resolve())
CORPUS = ROOT / "data" / "analysts" / "wisburg-mikko" / "corpus" / "articles.jsonl"
DISCOVERY = ROOT / "data" / "analysts" / "wisburg-mikko" / "discovery-index.json"
DEFAULT_OUTPUT = Path(__file__).resolve().parents[1] / "references" / "corpus-audit.json"
AUDIT_VERSION = "3.3.0"
AUDIT_DATE = "2026-09-09"


def load_jsonl(path: Path) -> list[dict]:
    records: list[dict] = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if line.strip():
            record = json.loads(line)
            record["_line"] = line_number
            records.append(record)
    return records


def audit() -> dict:
    records = load_jsonl(CORPUS)
    discovery = json.loads(DISCOVERY.read_text(encoding="utf-8"))
    required = {
        "id", "title", "date", "quarter", "source", "authorship_type",
        "authorship_evidence", "content_type", "fulltext_status",
        "estimated_chars", "article_weight", "core_thesis",
        "balance_sheet_logic", "falsification", "relationship_to_prior",
    }
    errors: list[str] = []
    ids: set[str] = set()
    for record in records:
        missing = sorted(required - record.keys())
        if missing:
            errors.append(f"line {record['_line']}: missing {', '.join(missing)}")
        if record.get("id") in ids:
            errors.append(f"line {record['_line']}: duplicate id {record.get('id')}")
        ids.add(record.get("id"))
        weight = record.get("article_weight")
        if not isinstance(weight, (int, float)) or not 0 <= weight <= 1:
            errors.append(f"line {record['_line']}: invalid article_weight")

    original = [r for r in records if r.get("authorship_type") == "mikko_original"]
    original_full = [r for r in original if r.get("fulltext_status") == "full"]
    high_quality_full = [
        r for r in original_full if r.get("estimated_chars", 0) >= 800
    ]
    longform = [r for r in original_full if r.get("estimated_chars", 0) >= 1500]
    original_longform = [r for r in original_full if r.get("estimated_chars", 0) >= 5000]
    quarters = sorted({r["quarter"] for r in original if r.get("quarter")})
    weighted_original_support = round(sum(float(r["article_weight"]) for r in original), 2)

    discovered = int(discovery["discovered_candidates"])
    if discovered >= 100 and len(high_quality_full) >= 60 and len(longform) >= 40 and len(quarters) >= 8:
        grade = "A"
    elif discovered >= 60 and len(high_quality_full) >= 40 and len(longform) >= 25 and len(quarters) >= 6:
        grade = "B"
    elif discovered >= 30 and len(high_quality_full) >= 15 and len(longform) >= 8 and len(quarters) >= 4:
        grade = "C"
    else:
        grade = "D"

    thresholds = {
        "A": {"discovered": 100, "fulltext": 60, "longform": 40, "quarters": 8},
        "B": {"discovered": 60, "fulltext": 40, "longform": 25, "quarters": 6},
    }
    blocking_gaps: list[str] = []
    if len(high_quality_full) < thresholds["B"]["fulltext"]:
        blocking_gaps.append(
            f"作者级高质量全文为{len(high_quality_full)}篇，距离B级40篇门槛还差"
            f"{thresholds['B']['fulltext'] - len(high_quality_full)}篇。"
        )
    if len(longform) < thresholds["B"]["longform"]:
        blocking_gaps.append(
            f"作者级长文为{len(longform)}篇，距离B级25篇门槛还差"
            f"{thresholds['B']['longform'] - len(longform)}篇。"
        )
    blocking_gaps.extend([
        "近期作者证据覆盖2024Q2至2026Q1，部分音频课程只有结构化摘要并按partial计权。",
        "平台154篇归档包含大量翻译和团队稿，平台总量只计入发现量。",
    ])

    return {
        "analyst_id": "wisburg-mikko",
        "audit_version": AUDIT_VERSION,
        "generated_at": AUDIT_DATE,
        "status": "PROVISIONAL_AUTHOR_FILTERED" if grade not in {"A", "B"} else "STABLE",
        "grade": grade,
        "discovered_articles": discovered,
        "normalized_records": len(records),
        "authorship_counts": dict(sorted(Counter(r["authorship_type"] for r in records).items())),
        "mikko_original_records": len(original),
        "mikko_original_fulltext": len(original_full),
        "mikko_original_longform": len(original_longform),
        "author_high_quality_fulltext": len(high_quality_full),
        "author_longform": len(longform),
        "original_quarters": quarters,
        "original_quarters_count": len(quarters),
        "weighted_original_support": weighted_original_support,
        "window": {
            "first_original": min((r["date"] for r in original), default=None),
            "last_original": max((r["date"] for r in original), default=None),
            "recent_36m_originals": len([r for r in original if r["date"] >= "2023-09-01"]),
            "note": "早期方法论由2018—2021材料奠基；2024—2026署名研究、逐段归属访谈、本人课程与方法论自述用于检验延续、应用与修订。",
        },
        "gate_thresholds": thresholds,
        "blocking_gaps": blocking_gaps,
        "dna_policy": {
            "stable_rule_sources": ["mikko_original"],
            "context_only_sources": ["wisburg_team", "translation", "guest", "aggregation", "unknown"],
            "hybrid_rule": "Mikko导语加外文译文按原创导语权重计入，译文主体不进入DNA。",
        },
        "validation_errors": errors,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    result = audit()
    payload = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.write:
        args.output.write_text(payload, encoding="utf-8")
    print(payload, end="")
    return 1 if result["validation_errors"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
