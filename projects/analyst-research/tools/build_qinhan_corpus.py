#!/usr/bin/env python3
"""Merge 覃汉 public sources and emit an auditable independent corpus."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from datetime import date
from pathlib import Path


def read_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def normalized_title(title: str) -> str:
    return re.sub(r"[^\u3400-\u9fffA-Za-z0-9]", "", title).lower()


def iso_date(value: str) -> str:
    if re.fullmatch(r"\d{4}-\d{2}", value):
        return value + "-01"
    return value


def article_weight(row: dict) -> float:
    length = int(row.get("text_length", 0))
    if length >= 3000:
        length_weight = 1.0
    elif length >= 1500:
        length_weight = 0.85
    elif length >= 800:
        length_weight = 0.55
    elif length >= 300:
        length_weight = 0.2
    else:
        length_weight = 0.05
    authorship = str(row.get("authorship_type", ""))
    if authorship in {"qinhan_lead", "qinhan_coauthored"}:
        type_weight, boundary_weight = 0.85, 1.0
    elif authorship == "qinhan_lead_interview":
        type_weight, boundary_weight = 0.65, 1.0
    elif authorship == "qinhan_coauthored_survey":
        type_weight, boundary_weight = 0.15, 1.0
    elif authorship in {"team_summary", "team_platform", "qinhan_team", "qinhan_team_index"}:
        type_weight, boundary_weight = 0.7, 0.5
    elif authorship in {"team_member", "team_platform_unresolved"}:
        type_weight, boundary_weight = 0.7, 0.15
    else:
        type_weight, boundary_weight = 0.2, 0.2
    source_quality = float(row.get("source_quality", 0.6))
    framework_density = 0.8 if row.get("fulltext_status") in {"full", "longform"} else 0.4
    return round(length_weight * type_weight * boundary_weight * source_quality * framework_density, 4)


def merge(verified: Path, public_index: Path, anchors: Path, output: Path) -> dict:
    candidates: list[tuple[int, dict]] = []
    candidates.extend((3, row) for row in read_jsonl(verified))
    candidates.extend((1, row) for row in read_jsonl(public_index))
    for anchor in json.loads(anchors.read_text(encoding="utf-8")):
        title = anchor["title"]
        published_at = iso_date(anchor["date"])
        candidates.append(
            (
                2,
                {
                    "analyst_id": "qinhan-fixed-income",
                    "title": title,
                    "published_at": published_at,
                    "source_url": "",
                    "source_type": "structured_import_anchor",
                    "source_platform": "覃汉研究笔记年度索引/Import Pack",
                    "original_channel": "覃汉研究笔记",
                    "authorship_type": anchor["authorship"],
                    "fulltext_status": "structured_anchor",
                    "text_length": 0,
                    "content_hash": hashlib.sha256(
                        f"{published_at}|{title}".encode()
                    ).hexdigest(),
                    "source_quality": 0.7,
                    "topic_signals": [anchor["role"]],
                },
            )
        )

    merged: dict[str, tuple[int, dict]] = {}
    for priority, row in candidates:
        key = normalized_title(row["title"])
        current = merged.get(key)
        if current is None or priority > current[0]:
            merged[key] = (priority, row)
    records = []
    for _, row in merged.values():
        row["article_weight"] = article_weight(row)
        records.append(row)
    records.sort(key=lambda row: (row["published_at"], row["title"]))
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in records), encoding="utf-8"
    )
    quarters = {
        f"{row['published_at'][:4]}Q{(int(row['published_at'][5:7]) - 1) // 3 + 1}"
        for row in records
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", row["published_at"])
    }
    dates = [date.fromisoformat(row["published_at"]) for row in records]
    fulltext = [row for row in records if row["fulltext_status"] in {"full", "longform"}]
    return {
        "discovered_articles": len(candidates),
        "accepted_unique_articles": len(records),
        "earliest_date": min(dates).isoformat(),
        "latest_date": max(dates).isoformat(),
        "fulltext_articles": len(fulltext),
        "longform_articles": sum(row["fulltext_status"] == "longform" for row in records),
        "title_only_articles": sum(row["fulltext_status"] == "title_only" for row in records),
        "structured_anchor_articles": sum(row["fulltext_status"] == "structured_anchor" for row in records),
        "quarters_covered": len(quarters),
        "quarter_list": sorted(quarters),
        "qinhan_named_fulltext": sum(
            row["fulltext_status"] in {"full", "longform"}
            and str(row["authorship_type"]).startswith("qinhan_")
            for row in records
        ),
        "effective_weighted_articles": round(sum(row["article_weight"] for row in records), 2),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--verified", type=Path, required=True)
    parser.add_argument("--public-index", type=Path, required=True)
    parser.add_argument("--anchors", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(merge(args.verified, args.public_index, args.anchors, args.output), ensure_ascii=False))


if __name__ == "__main__":
    main()
