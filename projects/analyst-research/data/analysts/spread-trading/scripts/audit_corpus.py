#!/usr/bin/env python3
"""Validate Spread Trading Corpus Gate, isolation, authorship, and DNA evidence."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROJECT = ROOT.parents[2]
CORPUS = ROOT / "corpus" / "index.jsonl"
DNA = ROOT / "dna-evidence.json"
CURRENT = ROOT / "current-view.json"
AUDIT = PROJECT / ".agents" / "skills" / "spread-trading-analyst" / "references" / "corpus-audit.json"
ALLOWED_AUTHORSHIP = {"founder_original", "trading_dog", "ai_assisted", "translation", "guest_interview", "third_party_analysis", "unknown"}


def main() -> None:
    rows = [json.loads(line) for line in CORPUS.read_text(encoding="utf-8").splitlines() if line.strip()]
    dna = json.loads(DNA.read_text(encoding="utf-8"))
    current = json.loads(CURRENT.read_text(encoding="utf-8"))
    audit = json.loads(AUDIT.read_text(encoding="utf-8"))
    ids = {row["id"] for row in rows}
    assert len(ids) == len(rows), "duplicate corpus ids"
    assert len({row["title"] for row in rows}) == len(rows), "duplicate corpus titles"
    assert all(row["analyst"] == "spread-trading" for row in rows), "cross-analyst contamination"
    assert all(row["authorship_type"] in ALLOWED_AUTHORSHIP for row in rows), "invalid authorship type"
    assert len(rows) >= 100, "discovered corpus below target"
    assert sum(row["fulltext_verified"] for row in rows) >= 60, "fulltext below Grade A"
    assert sum(row["longform"] for row in rows) >= 40, "longform below Grade A"
    assert audit["span_months"] >= 30 and audit["quarters_covered"] >= 8, "time coverage below Grade A"
    assert audit["corpus_grade"] == "A" and audit["status"] == "STABLE", "audit status mismatch"
    assert audit["discovered_articles"] == len(rows), "audit row count mismatch"
    assert audit["fulltext_articles"] == sum(row["fulltext_verified"] for row in rows), "fulltext count mismatch"
    assert audit["longform_articles"] == sum(row["longform"] for row in rows), "longform count mismatch"
    assert current["object_type"] == "CURRENT_VIEW" and dna["object_type"] == "ANALYST_DNA", "DNA/current separation missing"
    for rule in dna["rules"]:
        missing = set(rule["supporting_articles"]) - ids
        assert not missing, f"{rule['id']} references missing ids: {sorted(missing)}"
        assert len(rule["supporting_articles"]) >= 3, f"{rule['id']} has insufficient support"
        assert len(rule["quarters_seen"]) >= 2, f"{rule['id']} lacks cross-quarter support"
    print(json.dumps({
        "status": "PASS", "version": audit["version"], "grade": audit["corpus_grade"],
        "discovered": len(rows), "fulltext": sum(row["fulltext_verified"] for row in rows),
        "longform": sum(row["longform"] for row in rows),
        "effective_weighted": round(sum(row["weight"] for row in rows), 2),
        "dna_rules": len(dna["rules"]),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
