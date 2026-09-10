#!/usr/bin/env python3
"""Build a metadata-only public corpus for 覃汉研究笔记 from Sina's public index."""

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
QUERIES = ("覃汉研究笔记", "浙商证券 覃汉")
IDENTITY_MARKERS = ("覃汉研究笔记", "覃汉", "浙商固收", "国君固收")
RESEARCH_TERMS = (
    "债", "利率", "流动性", "资金", "回购", "存单", "曲线", "机构",
    "银行", "基金", "保险", "央行", "货币", "财政", "信用", "转债",
    "国债", "股债", "久期", "票息", "配置", "交易", "收益率", "宏观",
)
THEME_TERMS = {
    "interbank_liquidity": ("流动性", "回购", "DR007", "R007", "资金面", "大行融出"),
    "institutional_behavior": ("机构", "基金", "保险", "农商行", "负债", "抱团", "赎回"),
    "rates_curve": ("曲线", "牛陡", "牛平", "熊陡", "熊平", "国债", "久期", "超长债"),
    "credit_convertible": ("信用债", "二永债", "城投", "转债", "可转债", "票息"),
    "macro_policy": ("央行", "货币", "财政", "基本面", "政策", "降准", "降息"),
    "cross_asset": ("股债", "权益", "汇率", "美债", "纳斯达克", "资产配置"),
    "quant_relative_value": ("PCA", "主成分", "量化", "利差", "相对价值", "对冲"),
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
    sample = text[:8000]
    if re.search(r"作者[：:]?\s*覃汉\s*[/、与和]", sample):
        return "qinhan_coauthored"
    if re.search(r"作者[：:]?\s*覃汉(?:\s|$|。)", sample) or title.startswith("覃汉"):
        return "qinhan_lead"
    if "研究员：覃汉/" in sample or "分析师：覃汉" in sample:
        return "qinhan_coauthored"
    if "覃汉研究笔记" in sample:
        return "team_platform"
    return "unknown"


def topic_signals(title: str, text: str) -> list[str]:
    sample = title + " " + text[:3500]
    return [name for name, terms in THEME_TERMS.items() if any(term in sample for term in terms)]


def is_research_article(title: str, text: str) -> bool:
    identity_ok = any(marker in text for marker in IDENTITY_MARKERS)
    research_ok = any(term in title or term in text[:5000] for term in RESEARCH_TERMS)
    return identity_ok and research_ok


def quarter_ranges(start: date, end: date) -> list[tuple[date, date]]:
    ranges = []
    cursor = start
    while cursor <= end:
        next_month = ((cursor.month - 1) // 3 + 1) * 3 + 1
        next_year = cursor.year
        if next_month > 12:
            next_month -= 12
            next_year += 1
        period_end = min(date(next_year, next_month, 1) - timedelta(days=1), end)
        ranges.append((cursor, period_end))
        cursor = period_end + timedelta(days=1)
    return ranges


def epoch_seconds(value: date, *, end_of_day: bool = False) -> int:
    clock = datetime_time(23, 59, 59) if end_of_day else datetime_time.min
    return int(datetime.combine(value, clock, tzinfo=ZoneInfo("Asia/Shanghai")).timestamp())


def get_with_retry(client: httpx.Client, url: str, **kwargs: object) -> httpx.Response:
    """Fetch a public page with bounded backoff for transient rate limits."""
    last_error: httpx.HTTPError | None = None
    for attempt in range(5):
        try:
            response = client.get(url, **kwargs)
            response.raise_for_status()
            return response
        except httpx.HTTPStatusError as exc:
            last_error = exc
            if exc.response.status_code != 429:
                raise
            retry_after = exc.response.headers.get("Retry-After")
            delay = float(retry_after) if retry_after and retry_after.isdigit() else 3.0 * (attempt + 1)
            print(f"rate_limited wait={delay:.1f}s", flush=True)
            time.sleep(delay)
        except httpx.TransportError as exc:
            last_error = exc
            time.sleep(2.0 * (attempt + 1))
    assert last_error is not None
    raise last_error


def collect(output: Path, pages: int, since: str, until: str, pause: float) -> dict[str, int]:
    since_date = date.fromisoformat(since)
    until_date = date.fromisoformat(until)
    headers = {"User-Agent": "Mozilla/5.0 (compatible; AnalystCorpusAudit/1.0)"}
    indexed: dict[str, dict] = {}
    with httpx.Client(headers=headers, follow_redirects=True, timeout=30) as client:
        for query in QUERIES:
            for period_start, period_end in quarter_ranges(since_date, until_date):
                for page in range(1, pages + 1):
                    response = get_with_retry(
                        client,
                        SEARCH_API,
                        params={
                            "q": query,
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
                    response.encoding = "utf-8"
                    items = response.json().get("data", {}).get("list") or []
                    if not items:
                        break
                    for item in items:
                        title = clean_title(str(item.get("title", "")))
                        date_text = str(item.get("time") or item.get("dataTime") or "")[:10]
                        try:
                            published = date.fromisoformat(date_text)
                        except ValueError:
                            continue
                        if not since_date <= published <= until_date:
                            continue
                        url = canonical_url(str(item.get("url", "")))
                        if url.startswith("http"):
                            indexed[url] = {
                                "title": title,
                                "published_at": date_text,
                                "url": url,
                                "query": query,
                            }
                    time.sleep(pause)
                print(
                    f"index query={query} period={period_start}:{period_end} candidates={len(indexed)}",
                    flush=True,
                )

        records = []
        for number, item in enumerate(indexed.values(), start=1):
            try:
                response = get_with_retry(client, item["url"])
                response.encoding = "utf-8"
                text = article_text(response.text)
            except (httpx.HTTPError, ValueError):
                continue
            if not is_research_article(item["title"], text):
                continue
            length = weighted_length(text)
            if length >= 1500:
                status = "longform"
            elif length >= 800:
                status = "full"
            elif length >= 300:
                status = "partial"
            else:
                status = "title_only"
            records.append(
                {
                    "analyst_id": "qinhan-fixed-income",
                    "title": item["title"],
                    "published_at": item["published_at"],
                    "source_url": item["url"],
                    "source_type": "public_syndicated_fulltext",
                    "source_platform": "Sina Finance",
                    "original_channel": "覃汉研究笔记",
                    "authorship_type": classify_authorship(text, item["title"]),
                    "fulltext_status": status,
                    "text_length": length,
                    "content_hash": hashlib.sha256(text.encode("utf-8")).hexdigest(),
                    "source_quality": 0.8,
                    "topic_signals": topic_signals(item["title"], text),
                    "discovery_query": item["query"],
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
        "full_or_longform": sum(record["fulltext_status"] in {"full", "longform"} for record in records),
        "qinhan_named": sum(record["authorship_type"] in {"qinhan_lead", "qinhan_coauthored"} for record in records),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--pages", type=int, default=10)
    parser.add_argument("--since", default="2023-01-01")
    parser.add_argument("--until", default="2026-08-31")
    parser.add_argument("--pause", type=float, default=0.12)
    args = parser.parse_args()
    print(json.dumps(collect(args.output, args.pages, args.since, args.until, args.pause), ensure_ascii=False))


if __name__ == "__main__":
    main()
