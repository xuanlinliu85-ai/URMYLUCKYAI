#!/usr/bin/env python3
"""Collect and audit public Kevin_Liugang article metadata.

The collector stores structured metadata and distilled evidence only. It does
not mirror article bodies. Search-index snippets are retained as short source
evidence and are explicitly classified below full-text records.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import time
import urllib.parse
import urllib.request
from datetime import UTC, datetime
from pathlib import Path

ACCOUNT = "Kevin策略研究"
SEARCH_ROOT = "https://weixin.sogou.com/weixin"
QUERIES = [
    "Kevin_Liugang",
    "Kevin_Liugang 港股",
    "Kevin_Liugang 海外",
    "Kevin_Liugang 美联储",
    "Kevin_Liugang 美债",
    "Kevin_Liugang 利率",
    "Kevin_Liugang 黄金",
    "Kevin_Liugang 外资",
    "Kevin_Liugang 南向",
    "Kevin_Liugang 流动性",
    "Kevin_Liugang 通胀",
    "Kevin_Liugang 衰退",
    "Kevin_Liugang 美国",
    "Kevin_Liugang 大选",
    "Kevin_Liugang AI",
    "Kevin_Liugang 科技",
    "Kevin_Liugang 资金",
    "Kevin_Liugang 配置",
    "Kevin_Liugang 估值",
    "Kevin_Liugang 拥挤",
    "Kevin_Liugang 周报",
    "Kevin_Liugang 策略",
    "Kevin_Liugang 市场",
    "Kevin_Liugang 2023",
    "Kevin_Liugang 2024",
    "Kevin_Liugang 2025",
    "Kevin_Liugang 2026",
    "Kevin_Liugang 2023 港股",
    "Kevin_Liugang 2023 美债",
    "Kevin_Liugang 2023 外资",
    "Kevin_Liugang 2024 港股",
    "Kevin_Liugang 2024 美联储",
    "Kevin_Liugang 2024 黄金",
    "Kevin_Liugang 2025 港股",
    "Kevin_Liugang 2025 外资",
    "Kevin_Liugang 2025 科技",
    "Kevin_Liugang 2026 港股",
    "Kevin_Liugang 2026 AI",
    "Kevin_Liugang 2026 流动性",
    "Kevin_Liugang 实际利率",
    "Kevin_Liugang 收益率曲线",
    "Kevin_Liugang 分子 分母",
    "Kevin_Liugang 主动 被动 外资",
    "Kevin_Liugang 盈利 估值",
    "Kevin_Liugang 赔率 胜率",
    "Kevin_Liugang 结构市",
    "Kevin_Liugang K型",
    "Kevin_Liugang 日本",
    "Kevin_Liugang 欧洲",
    "Kevin_Liugang 美元",
    "Kevin_Liugang 地缘",
    "Kevin_Liugang 疫情",
    "Kevin_Liugang 银行",
    "Kevin_Liugang 信用周期",
    "Kevin_Liugang 反弹",
    "Kevin_Liugang 跨资产",
    "Kevin_Liugang 月报",
]

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
)


def fetch(url: str, timeout: int = 30) -> tuple[str, str]:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        body = response.read().decode("utf-8", errors="replace")
        return body, response.geturl()


def clean_markup(value: str) -> str:
    value = re.sub(r"<!--.*?-->", "", value, flags=re.DOTALL)
    value = re.sub(r"<[^>]+>", "", value)
    return re.sub(r"\s+", " ", html.unescape(value)).strip()


def parse_search_page(page: str, query: str) -> list[dict]:
    records: list[dict] = []
    pattern = re.compile(
        r'<a target="_blank" href="(?P<href>/link\?[^\"]+)" '
        r'id="sogou_vr_11002601_title_\d+"[^>]*>(?P<title>.*?)</a>'
        r'(?P<trailing>.*?)(?=<div class="txt-box">|</li>)',
        flags=re.DOTALL,
    )
    for match in pattern.finditer(page):
        trailing = match.group("trailing")
        account_match = re.search(r'<span class="all-time-y2">(.*?)</span>', trailing, re.DOTALL)
        timestamp_match = re.search(r"timeConvert\('(\d+)'\)", trailing)
        summary_match = re.search(r'<p class="txt-info"[^>]*>(.*?)</p>', trailing, re.DOTALL)
        account = clean_markup(account_match.group(1)) if account_match else ""
        if account != ACCOUNT or timestamp_match is None:
            continue
        timestamp = int(timestamp_match.group(1))
        date = datetime.fromtimestamp(timestamp, tz=UTC).date().isoformat()
        href = "https://weixin.sogou.com" + html.unescape(match.group("href"))
        href = href.replace(" ", "%20")
        title = clean_markup(match.group("title"))
        summary = clean_markup(summary_match.group(1)) if summary_match else ""
        stable_id = hashlib.sha256(f"{date}|{title}".encode()).hexdigest()[:16]
        records.append(
            {
                "id": stable_id,
                "title": title,
                "date": date,
                "account": account,
                "search_query": query,
                "index_url": href,
                "source_url": "",
                "summary": summary,
            }
        )
    return records


def author_classification(title: str, text: str) -> tuple[str, str, float]:
    sample = f"{title} {text[:2500]}"
    liugang = bool(re.search(r"刘刚|Kevin(?:策略研究)?", sample, re.IGNORECASE))
    zhang = bool(re.search(r"张巍瀚", sample))
    team = bool(re.search(r"中金(?:公司)?(?:研究部)?海外策略|中金\s*[|｜·]?\s*(?:海外|港股)", sample))
    repost = bool(re.search(r"转载|来源[:：]|文章来源", sample))
    flow_note = bool(re.search(r"外资周报|资金面周报|资金流向|外资流向", title))
    if zhang and not liugang:
        return "zhang-weihan", "team-or-coauthor", 0.55
    if liugang and team:
        return "liugang-team", "original-team-research", 0.85
    if liugang:
        return "liugang", "interview-or-attributed-view", 0.70
    if team:
        return "cicc-overseas-team", "team-research", 0.65
    if repost:
        return "third-party", "repost", 0.10
    if flow_note:
        return "unverified-team", "flow-brief", 0.25
    return "unverified-team", "index-only", 0.05


def infer_topics(title: str, summary: str) -> list[str]:
    text = f"{title} {summary}"
    lexicon = {
        "hong-kong": r"港股|恒生|南向",
        "us-rates-fed": r"美债|利率|美联储|Fed|降息|加息|通胀",
        "us-equities": r"美股|纳斯达克|标普",
        "flows-positioning": r"外资|资金|仓位|拥挤|流动性",
        "gold-commodities": r"黄金|原油|大宗",
        "china-assets": r"中国资产|A股|人民币|中概",
        "global-macro": r"全球|海外|衰退|增长|大选|地缘",
        "technology-ai": r"科技|AI|人工智能|半导体",
        "allocation": r"配置|赔率|估值|轮动|策略",
    }
    return [name for name, pattern in lexicon.items() if re.search(pattern, text, re.IGNORECASE)] or ["global-macro"]


def resolve_record(record: dict) -> dict:
    record.pop("fetch_error", None)
    try:
        article_html, final_url = fetch(record["index_url"].replace(" ", "%20"))
    except Exception as exc:  # network and anti-bot failures stay auditable
        record["fetch_error"] = type(exc).__name__
        article_html = ""
        final_url = ""
    text = ""
    if article_html and "mp.weixin.qq.com" in final_url:
        content = re.search(
            r'<div[^>]+id=["\']js_content["\'][^>]*>(.*?)</div>\s*<script',
            article_html,
            re.DOTALL,
        )
        text = clean_markup(content.group(1)) if content else ""
    author, content_type, source_quality = author_classification(
        record["title"], f"{record['summary']} {text}"
    )
    char_count = len(text)
    if char_count >= 800:
        fulltext_status = "full"
    elif char_count >= 300:
        fulltext_status = "partial"
    else:
        fulltext_status = "title_only"
    length_class = (
        "longform" if char_count >= 1500 else "medium" if char_count >= 800 else "short"
    )
    record.update(
        {
            "source_url": final_url if "mp.weixin.qq.com" in final_url else "",
            "fulltext_status": fulltext_status,
            "character_count": char_count,
            "length_class": length_class,
            "attribution": author,
            "content_type": content_type,
            "source_quality": source_quality,
            "topics": infer_topics(record["title"], record["summary"]),
            "evidence_excerpt": record["summary"][:280],
            "body_stored": False,
        }
    )
    return record


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--pages", type=int, default=10)
    parser.add_argument("--resolve-limit", type=int, default=140)
    parser.add_argument("--delay", type=float, default=0.35)
    parser.add_argument(
        "--resolve-existing",
        action="store_true",
        help="Read the existing output and resolve records without repeating discovery.",
    )
    args = parser.parse_args()

    discovered: dict[str, dict] = {}
    if args.resolve_existing:
        for line in args.output.read_text(encoding="utf-8").splitlines():
            record = json.loads(line)
            discovered[record["id"]] = record
    else:
        for query in QUERIES:
            for page_number in range(1, args.pages + 1):
                params = urllib.parse.urlencode(
                    {"type": 2, "query": query, "page": page_number, "ie": "utf8"}
                )
                try:
                    page, _ = fetch(f"{SEARCH_ROOT}?{params}")
                except Exception:
                    break
                batch = parse_search_page(page, query)
                if not batch:
                    break
                for record in batch:
                    if record["date"] >= "2023-01-01":
                        discovered.setdefault(record["id"], record)
                time.sleep(args.delay)

    selected = sorted(discovered.values(), key=lambda item: (item["date"], item["title"]))
    for index, record in enumerate(selected):
        if index < args.resolve_limit:
            resolve_record(record)
            time.sleep(args.delay)
        else:
            author, content_type, source_quality = author_classification(
                record["title"], record["summary"]
            )
            record.update(
                {
                    "fulltext_status": "title_only",
                    "character_count": 0,
                    "length_class": "short",
                    "attribution": author,
                    "content_type": content_type,
                    "source_quality": source_quality,
                    "topics": infer_topics(record["title"], record["summary"]),
                    "evidence_excerpt": record["summary"][:280],
                    "body_stored": False,
                }
            )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        "".join(json.dumps(item, ensure_ascii=False) + "\n" for item in selected),
        encoding="utf-8",
    )
    print(json.dumps({"discovered": len(selected), "output": str(args.output)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
