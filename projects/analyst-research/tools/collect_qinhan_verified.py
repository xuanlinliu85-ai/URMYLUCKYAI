#!/usr/bin/env python3
"""Fetch verified public fulltext pages for the independent 覃汉 corpus."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import time
from pathlib import Path

import httpx
from bs4 import BeautifulSoup

THEMES = {
    "liquidity": ("流动性", "回购", "DR007", "资金面", "大行"),
    "institutional_behavior": ("机构", "基金", "保险", "负债", "抱团", "赎回", "基准"),
    "curve_duration": ("曲线", "牛陡", "牛平", "国债", "久期", "超长债"),
    "macro_policy": ("央行", "政策", "财政", "基本面", "通胀", "汇率"),
    "cross_asset": ("股债", "权益", "商品", "美债", "资产配置"),
    "quant": ("PCA", "量化", "技术面", "主成分"),
}


def fetch(client: httpx.Client, url: str) -> str:
    error: Exception | None = None
    for attempt in range(4):
        try:
            response = client.get(url)
            response.raise_for_status()
            response.encoding = "utf-8"
            return response.text
        except httpx.HTTPError as exc:
            error = exc
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(url) from error


def extract_text(page: str) -> str:
    soup = BeautifulSoup(page, "html.parser")
    for tag in soup(["script", "style", "noscript", "iframe"]):
        tag.decompose()
    node = None
    for selector in ("#artibody", "#article", ".article-content", ".article", ".main-content"):
        candidate = soup.select_one(selector)
        if candidate and len(candidate.get_text(strip=True)) >= 200:
            node = candidate
            break
    node = node or soup.body or soup
    return re.sub(r"\s+", " ", node.get_text(" ", strip=True)).strip()


def content_length(text: str) -> int:
    return len(re.findall(r"[\u3400-\u9fffA-Za-z0-9]", text))


def collect(seed: Path, output: Path, pause: float) -> dict[str, int]:
    seeds = json.loads(seed.read_text(encoding="utf-8"))
    records = []
    headers = {"User-Agent": "Mozilla/5.0 (compatible; AnalystCorpusAudit/1.0)"}
    with httpx.Client(headers=headers, follow_redirects=True, timeout=30) as client:
        for number, item in enumerate(seeds, start=1):
            try:
                text = extract_text(fetch(client, item["url"]))
            except RuntimeError:
                continue
            if "覃汉" not in text and "覃汉研究笔记" not in text:
                continue
            length = content_length(text)
            if length >= 1500:
                status = "longform"
            elif length >= 800:
                status = "full"
            elif length >= 300:
                status = "partial"
            else:
                status = "title_only"
            sample = item["title"] + " " + text[:4000]
            records.append(
                {
                    "analyst_id": "qinhan-fixed-income",
                    "title": item["title"],
                    "published_at": item["date"],
                    "source_url": item["url"],
                    "source_type": "verified_public_fulltext",
                    "source_platform": "Sina/JRJ/Caishi",
                    "original_channel": "覃汉研究笔记或覃汉具名研究",
                    "authorship_type": item["authorship"],
                    "fulltext_status": status,
                    "text_length": length,
                    "content_hash": hashlib.sha256(text.encode("utf-8")).hexdigest(),
                    "source_quality": 0.8,
                    "topic_signals": [
                        name for name, terms in THEMES.items() if any(term in sample for term in terms)
                    ],
                }
            )
            if number % 10 == 0:
                print(f"fetched={number}/{len(seeds)} accepted={len(records)}", flush=True)
            time.sleep(pause)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in records), encoding="utf-8"
    )
    return {
        "seeded": len(seeds),
        "accepted": len(records),
        "full_or_longform": sum(row["fulltext_status"] in {"full", "longform"} for row in records),
        "longform": sum(row["fulltext_status"] == "longform" for row in records),
        "qinhan_named": sum(row["authorship_type"].startswith("qinhan_") for row in records),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--seed", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--pause", type=float, default=0.1)
    args = parser.parse_args()
    print(json.dumps(collect(args.seed, args.output, args.pause), ensure_ascii=False))


if __name__ == "__main__":
    main()
