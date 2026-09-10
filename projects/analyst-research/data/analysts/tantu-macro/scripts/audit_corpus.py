#!/usr/bin/env python3
"""Validate the tantu-macro Corpus Gate and DNA evidence references."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROJECT = ROOT.parents[2]
CORPUS = ROOT / "corpus" / "index.jsonl"
DNA = ROOT / "dna-evidence.json"
AUDIT = PROJECT / ".agents" / "skills" / "tantu-macro-analyst" / "references" / "corpus-audit.json"


def main() -> None:
    rows = [json.loads(line) for line in CORPUS.read_text(encoding="utf-8").splitlines() if line.strip()]
    dna = json.loads(DNA.read_text(encoding="utf-8"))
    audit = json.loads(AUDIT.read_text(encoding="utf-8"))
    ids = {row["id"] for row in rows}
    assert len(ids) == len(rows), "duplicate corpus ids"
    assert len({row["title"] for row in rows}) == len(rows), "duplicate corpus titles"
    assert all(row["analyst"] == "tantu-macro" for row in rows), "cross-analyst contamination"
    assert len(rows) >= 100, "structured corpus below gate"
    assert sum(row["fulltext_verified"] for row in rows) >= 60, "fulltext below gate"
    assert sum(row["longform"] for row in rows) >= 40, "longform below gate"
    assert audit["span_months"] >= 30 and audit["quarters_covered"] >= 8, "time coverage below Grade A"
    assert audit["corpus_grade"] == "A" and audit["status"] == "STABLE", "audit status mismatch"
    assert audit["structured_articles"] == len(rows), "audit row count mismatch"
    assert audit["fulltext_articles"] == sum(row["fulltext_verified"] for row in rows), "fulltext count mismatch"
    assert audit["longform_articles"] == sum(row["longform"] for row in rows), "longform count mismatch"
    for rule in dna["rules"]:
        missing = set(rule["supporting_articles"]) - ids
        assert not missing, f"{rule['id']} references missing ids: {sorted(missing)}"
        assert len(rule["supporting_articles"]) >= 3, f"{rule['id']} has insufficient support"
        assert len(rule["quarters_seen"]) >= 2, f"{rule['id']} lacks cross-quarter support"
    print(json.dumps({
        "status": "PASS",
        "version": audit["version"],
        "grade": audit["corpus_grade"],
        "structured": len(rows),
        "fulltext": sum(row["fulltext_verified"] for row in rows),
        "longform": sum(row["longform"] for row in rows),
        "effective_weighted": round(sum(row["weight"] for row in rows), 2),
        "dna_rules": len(dna["rules"]),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
