#!/usr/bin/env python3
"""Compute deterministic Corpus Gate metrics for Kevin's isolated corpus."""

from __future__ import annotations

import argparse
import json
from collections import Counter
from datetime import date
from pathlib import Path


def load_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]


def quarter(day: str) -> str:
    return f"{day[:4]}Q{(int(day[5:7]) - 1) // 3 + 1}"


def month_span(first: str, last: str) -> int:
    left, right = date.fromisoformat(first), date.fromisoformat(last)
    return (right.year - left.year) * 12 + right.month - left.month


def grade(span: int, fulltext: int, longform: int, quarters: int) -> str:
    if span >= 30 and fulltext >= 60 and longform >= 40 and quarters >= 8:
        return "A"
    if span >= 24 and fulltext >= 40 and longform >= 25 and quarters >= 6:
        return "B"
    if span >= 12 or longform < 25:
        return "C"
    return "D"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--corpus-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    index_records = load_jsonl(args.corpus_dir / "articles.jsonl")
    official = load_jsonl(args.corpus_dir / "official-evidence.jsonl")
    verified = load_jsonl(args.corpus_dir / "verified-fulltext.jsonl")
    discovered = {record["id"]: record for record in index_records + official + verified}
    first = min(record["date"] for record in discovered.values())
    last = max(record["date"] for record in discovered.values())
    quarters = sorted({quarter(record["date"]) for record in discovered.values()})
    span = month_span(first, last)
    fulltext = [record for record in verified if record.get("fulltext_status") == "full"]
    fulltext_ids = {record["id"] for record in fulltext}
    partial = [record for record in official if record["id"] not in fulltext_ids]
    longform_ids = {
        record["id"]
        for record in fulltext + partial
        if record.get("character_count", 0) >= 1500
    }
    domains = Counter(
        record.get("source_url", "").split("/")[2]
        for record in fulltext
        if record.get("source_url", "").startswith("http")
    )
    attribution = Counter(
        record.get("attribution", {}).get("classification", "unknown")
        for record in fulltext
    )
    metrics = {
        "audit_date": date.today().isoformat(),
        "earliest_date": first,
        "latest_date": last,
        "span_months": span,
        "discovered_articles": len(discovered),
        "fulltext_articles": len(fulltext),
        "partial_articles": len(partial),
        "longform_articles": len(longform_ids),
        "title_only_articles": len(
            [record for record in index_records if record["id"] not in fulltext_ids]
        ),
        "quarters_covered": quarters,
        "corpus_grade": grade(span, len(fulltext), len(longform_ids), len(quarters)),
        "gate_results": {
            "discovered_gte_100": len(discovered) >= 100,
            "fulltext_gte_60": len(fulltext) >= 60,
            "longform_gte_40": len(longform_ids) >= 40,
            "grade_b_fulltext_gte_40": len(fulltext) >= 40,
            "grade_b_longform_gte_25": len(longform_ids) >= 25,
            "quarters_gte_8": len(quarters) >= 8,
            "span_gte_30_months": span >= 30,
        },
        "verified_domains": dict(sorted(domains.items())),
        "verified_attribution": dict(sorted(attribution.items())),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(metrics, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(metrics, ensure_ascii=False))


if __name__ == "__main__":
    main()
