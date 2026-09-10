#!/usr/bin/env python3
"""Build a metadata-only public corpus for 一瑜中的 from Sina's public index."""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import time
from datetime import date, datetime, timedelta
from datetime import time as datetime_time
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit
from zoneinfo import ZoneInfo

import httpx
from bs4 import BeautifulSoup

SEARCH_API = "https://search.sina.com.cn/api/advanced"
QUERY = "华创张瑜"
IDENTITY_MARKERS = (
    "一瑜中的",
    "S0360518090001",
    "华创证券研究所",
    "华创宏观·张瑜团队",
    "华创证券",
)
RESEARCH_TERMS = (
    "宏观",
    "经济",
    "财政",
    "货币",
    "央行",
    "金融",
    "利率",
    "流动性",
    "通胀",
    "物价",
    "PPI",
    "CPI",
    "出口",
    "消费",
    "房地产",
    "地产",
    "资产",
    "股债",
    "汇率",
    "美联储",
    "美国",
    "政治局",
    "政府工作报告",
    "工业",
    "就业",
    "利润",
    "社融",
    "M1",
    "M2",
    "政策",
    "关税",
    "贸易",
    "债券",
    "股票",
    "新经济",
)
THEME_TERMS = {
    "china_policy_fiscal": ("政治局", "财政", "政府工作报告", "两会", "化债", "专项债"),
    "money_credit_liquidity": ("货币", "央行", "社融", "M1", "M2", "存款", "流动性", "降准", "降息"),
    "prices_profits_cycle": ("PPI", "CPI", "物价", "通胀", "利润", "库存", "产能", "供给侧"),
    "consumption_property": ("消费", "居民", "房地产", "地产", "房价", "人口", "就业"),
    "external_trade_fx": ("出口", "贸易", "关税", "汇率", "人民币", "美元", "全球", "日元"),
    "us_macro_fed": ("美国", "美联储", "非农", "美债", "降息", "美元"),
    "asset_allocation": ("股债", "股票", "债券", "A股", "资产配置", "夏普", "风险偏好"),
    "industrial_transformation": ("新经济", "中游", "制造", "产业", "转型", "设备", "科技"),
}


def clean_title(value: str) -> str:
    return re.sub(r"\s+", " ", BeautifulSoup(html.unescape(value), "html.parser").get_text()).strip()


def canonical_url(value: str) -> str:
    parts = urlsplit(value)
    return urlunsplit((parts.scheme, parts.netloc, parts.path, "", ""))


def article_text(page: str) -> str:
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


def weighted_length(text: str) -> int:
    return len(re.findall(r"[\u3400-\u9fffA-Za-z0-9]", text))


def classify_authorship(text: str, title: str) -> str:
    lead_pattern = re.compile(r"文[：:]?[^。；\n]{0,80}张瑜|张瑜[^。；\n]{0,30}执业证号")
    if lead_pattern.search(text) or title.startswith(("张瑜", "华创张瑜", "华创证券张瑜")):
        return "lead_author_or_named_report"
    return "huachuang_macro_team"


def topic_signals(title: str, text: str) -> list[str]:
    sample = title + " " + text[:2500]
    return [name for name, terms in THEME_TERMS.items() if any(term in sample for term in terms)]


def is_research_article(title: str, text: str) -> bool:
    identity_ok = "张瑜" in text and any(marker in text for marker in IDENTITY_MARKERS)
    research_ok = any(term in title or term in text[:5000] for term in RESEARCH_TERMS)
    return identity_ok and research_ok


def quarter_ranges(start: date, end: date) -> list[tuple[date, date]]:
    ranges = []
    cursor = start
    while cursor <= end:
        next_quarter_month = ((cursor.month - 1) // 3 + 1) * 3 + 1
        next_quarter_year = cursor.year
        if next_quarter_month > 12:
            next_quarter_month -= 12
            next_quarter_year += 1
        quarter_end = min(date(next_quarter_year, next_quarter_month, 1) - timedelta(days=1), end)
        ranges.append((cursor, quarter_end))
        cursor = quarter_end + timedelta(days=1)
    return ranges


def epoch_seconds(value: date, *, end_of_day: bool = False) -> int:
    clock = datetime_time(23, 59, 59) if end_of_day else datetime_time.min
    localized = datetime.combine(value, clock, tzinfo=ZoneInfo("Asia/Shanghai"))
    return int(localized.timestamp())


def collect(output: Path, pages: int, since: str, until: str, pause: float) -> dict[str, int]:
    since_date = date.fromisoformat(since)
    until_date = date.fromisoformat(until)
    headers = {"User-Agent": "Mozilla/5.0 (compatible; AnalystCorpusAudit/1.0)"}
    indexed: dict[str, dict] = {}
    with httpx.Client(headers=headers, follow_redirects=True, timeout=30) as client:
        for period_start, period_end in quarter_ranges(since_date, until_date):
            period_total = 0
            for page in range(1, pages + 1):
                response = client.get(
                    SEARCH_API,
                    params={
                        "q": QUERY,
                        "tp": "mix",
                        "sort": 1,
                        "page": page,
                        "size": 10,
                        "from": "advanced_search",
                        "stime": epoch_seconds(period_start),
                        "etime": epoch_seconds(period_end, end_of_day=True),
                        "classes": "1_7",
                    },
                )
                response.raise_for_status()
                response.encoding = "utf-8"
                payload = response.json()
                items = payload.get("data", {}).get("list") or []
                if not items:
                    break
                for item in items:
                    title = clean_title(str(item.get("title", "")))
                    if "张瑜" not in title and "华创" not in title:
                        continue
                    date_text = str(item.get("time") or item.get("dataTime") or "")[:10]
                    try:
                        published = date.fromisoformat(date_text)
                    except ValueError:
                        continue
                    if not since_date <= published <= until_date:
                        continue
                    url = canonical_url(str(item.get("url", "")))
                    if url.startswith("http"):
                        indexed[url] = {"title": title, "published_at": date_text, "url": url}
                        period_total += 1
                time.sleep(pause)
            print(
                f"index period={period_start}:{period_end} hits={period_total} "
                f"candidates={len(indexed)}",
                flush=True,
            )

        records = []
        for number, item in enumerate(indexed.values(), start=1):
            try:
                response = client.get(item["url"])
                response.raise_for_status()
                response.encoding = "utf-8"
                text = article_text(response.text)
            except (httpx.HTTPError, ValueError):
                continue
            if not is_research_article(item["title"], text):
                continue
            length = weighted_length(text)
            if length >= 1500:
                fulltext_status = "longform"
            elif length >= 800:
                fulltext_status = "full"
            elif length >= 300:
                fulltext_status = "partial"
            else:
                fulltext_status = "title_only"
            records.append(
                {
                    "analyst_id": "yiyuzhongde-zhangyu",
                    "title": item["title"],
                    "published_at": item["published_at"],
                    "source_url": item["url"],
                    "source_type": "public_syndicated_fulltext",
                    "source_platform": "Sina Finance",
                    "original_channel": "一瑜中的",
                    "authorship_type": classify_authorship(text, item["title"]),
                    "fulltext_status": fulltext_status,
                    "text_length": length,
                    "content_hash": hashlib.sha256(text.encode("utf-8")).hexdigest(),
                    "source_quality": 0.8,
                    "topic_signals": topic_signals(item["title"], text),
                    "discovery_query": QUERY,
                }
            )
            if number % 20 == 0:
                print(f"fetched={number}/{len(indexed)} accepted={len(records)}", flush=True)
            time.sleep(pause)

    records.sort(key=lambda value: (value["published_at"], value["title"]))
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        "".join(json.dumps(record, ensure_ascii=False) + "\n" for record in records),
        encoding="utf-8",
    )
    return {
        "indexed_candidates": len(indexed),
        "accepted_records": len(records),
        "longform": sum(record["fulltext_status"] == "longform" for record in records),
        "full_or_longform": sum(
            record["fulltext_status"] in {"full", "longform"} for record in records
        ),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--pages", type=int, default=10)
    parser.add_argument("--since", default="2023-08-30")
    parser.add_argument("--until", default="2026-08-30")
    parser.add_argument("--pause", type=float, default=0.12)
    args = parser.parse_args()
    result = collect(args.output, args.pages, args.since, args.until, args.pause)
    print(json.dumps(result, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
