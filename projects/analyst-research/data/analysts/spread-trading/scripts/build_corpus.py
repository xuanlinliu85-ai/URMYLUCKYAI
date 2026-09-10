#!/usr/bin/env python3
"""Build the isolated Spread Trading corpus ledger from public sources.

The ledger retains metadata, measurements, brief evidence snippets, and links.
It does not mirror article bodies.
"""

from __future__ import annotations

import hashlib
import html
import json
import re
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "corpus" / "index.jsonl"
UA = "Mozilla/5.0 (compatible; AnalystCorpusAudit/2.1; +local-research)"
COLUMN_ID = 565608
LIST_URL = "https://m.gelonghui.com/api/community/dynamic/my-dynamics"


HUXIU_SEEDS = [
    (668634, "2022-09-22", "聊聊美债收益率曲线", "李易骏", "founder_original"),
    (3619884, "2024-10-27", "聊聊“美国例外主义”", "Trading Dog", "trading_dog"),
    (4836155, "2026-02-22", "权力的边界与秩序回归：简评最高法否决川普关税", "Trading Dog", "trading_dog"),
    (4851859, "2026-04-19", "物理版SWIFT：能源独立与海峡控制的“武器化”", "Liyijun & AI Agent", "ai_assisted"),
    (4857112, "2026-05-10", "“风暴前夕”：5月15日三大宏观事件前瞻", "Trading Dog", "trading_dog"),
    (4860939, "2026-05-24", "只有加息才能救长端利率？", "Trading Dog", "trading_dog"),
    (4864207, "2026-06-03", "你还在盯着市盈率炒AI？", "Trading Dog", "trading_dog"),
    (4867119, "2026-06-14", "基于SpaceX，聊聊如何给“梦想”估值", "Trading Dog", "trading_dog"),
    (4868875, "2026-06-21", "6月FOMC，沃什怎么看AI？", "Trading Dog", "trading_dog"),
    (4872721, "2026-07-05", "AI后半场，该关注什么？", "Trading Dog", "trading_dog"),
    (4874586, "2026-07-12", "聊聊支撑美元的三股力量", "Trading Dog", "trading_dog"),
    (4876471, "2026-07-19", "随笔：从宏观对冲视角，聊聊科技过山车", "Trading Dog", "trading_dog"),
    (4883415, "2026-08-16", "美国“百万吨”铜库存棋局与系统脆弱性", "Trading Dog", "trading_dog"),
]


THIRD_PARTY_SEEDS = [
    ("2022-12-08", "Zoltan Pozsar最新报告：大宗商品领域最需要担心的是石油和黄金", "李易骏 编译&注释", "translation", "https://www.sohu.com/a/615296503_522926"),
    ("2023-03-08", "大空头Chanos访谈录：他还做空其他什么股票？", "Trading Dog 整理", "guest_interview", "https://www.sohu.com/a/651274226_121123899"),
    ("2023-04-11", "“我的商品，你的问题”：聊聊“去美元化”", "Trading Dog", "trading_dog", "https://finance.sina.cn/forex/hsxw/2023-04-11/detail-imypyier0399183.d.html"),
    ("2025-08-07", "美国重建制造业：现实与理想", "Trading Dog 编译 Bridgewater", "translation", "https://finance.sina.cn/fund/sm/2025-08-07/detail-infkehus5657178.d.html"),
    ("2025-12-28", "全球债务系统与其重置机制", "Trading Dog", "trading_dog", "https://www.huxiu.com/member/3350449.html"),
    ("2026-03-14", "Michael Burry：美股的结构脆弱性与价值分析", "Trading Dog 整理第三方观点", "third_party_analysis", "https://www.huxiu.com/member/3350449.html"),
]


def fetch(url: str) -> str:
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(request, timeout=30) as response:
                return response.read().decode("utf-8", errors="replace")
        except Exception as exc:
            last_error = exc
            time.sleep(0.8 * (attempt + 1))
    raise RuntimeError(f"fetch failed after retries: {url}") from last_error


def next_data(url: str) -> dict:
    body = fetch(url)
    match = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', body, re.DOTALL)
    if not match:
        raise ValueError(f"NEXT_DATA missing: {url}")
    return json.loads(match.group(1))


def plain_text(markup: str) -> str:
    value = re.sub(r"<script.*?</script>|<style.*?</style>", " ", markup, flags=re.DOTALL | re.IGNORECASE)
    value = re.sub(r"<[^>]+>", " ", value)
    return re.sub(r"\s+", " ", html.unescape(value)).strip()


def article_id(title: str) -> str:
    return "spread-" + hashlib.sha1(title.encode("utf-8")).hexdigest()[:12]


def topic(title: str) -> str:
    rules = [
        (r"美债|收益率|利率|FOMC|美联储|沃什|贝森特|债务", "rates_fiscal"),
        (r"美元|去美元|货币|黄金|金价", "dollar_monetary_order"),
        (r"AI|科技|SpaceX|芯片|半导体|Token", "ai_valuation"),
        (r"铜|石油|原油|能源|商品|海峡|OPEC", "commodities_geopolitics"),
        (r"中国|国内|人民币|港股|恒生|A股", "china_cross_asset"),
        (r"事件|战争|关税|APEC|博弈|制造业", "political_economy"),
    ]
    for pattern, label in rules:
        if re.search(pattern, title, re.IGNORECASE):
            return label
    return "global_macro_cross_asset"


def classify(title: str, body: str, author_type: str) -> str:
    text = title + " " + body[:600]
    if author_type in {"translation", "guest_interview", "third_party_analysis"}:
        return author_type
    if re.search(r"全文翻译|编译了|编译自|访谈录|采访|报告摘要|来自.*报告", text):
        return "translation_or_guest"
    if re.search(r"随笔|速评|点评|事件驱动", title):
        return "original_market"
    return "original_depth"


def infer_founder_authorship(title: str, body: str) -> tuple[str, str]:
    text = title + " " + body[:800]
    if re.search(r"Zoltan[:：]|全文翻译|编译自", text, re.IGNORECASE):
        return "李易骏 编译/注释", "translation"
    if re.search(r"访谈|采访", title):
        return "李易骏 整理第三方访谈", "guest_interview"
    if re.search(r"投资笔记|报告摘要", title):
        return "李易骏 整理第三方材料", "third_party_analysis"
    return "李易骏", "founder_original"


def make_row(*, title: str, published: str, url: str, author_label: str,
             authorship_type: str, body_text: str = "", platform_word_count: int = 0,
             source_kind: str = "public full article", date_precision: str = "day") -> dict:
    measured = len(re.sub(r"\s+", "", body_text))
    word_count = max(platform_word_count or 0, measured)
    fulltext = word_count >= 300
    longform = word_count >= 1500
    content_type = classify(title, body_text, authorship_type)
    type_weight = {
        "original_depth": 1.0,
        "original_market": 0.85,
        "translation_or_guest": 0.2,
        "translation": 0.2,
        "guest_interview": 0.1,
        "third_party_analysis": 0.1,
        "title_index": 0.05,
    }.get(content_type, 0.35)
    length_weight = 1.0 if word_count >= 3000 else 0.85 if word_count >= 1500 else 0.55 if word_count >= 800 else 0.2 if word_count >= 300 else 0.05
    return {
        "id": article_id(title),
        "analyst": "spread-trading",
        "title": title,
        "published_at": published,
        "date_precision": date_precision,
        "source_url": url,
        "source_kind": source_kind,
        "author_label": author_label,
        "authorship_type": authorship_type,
        "content_type": content_type,
        "topic": topic(title),
        "body_char_count": word_count,
        "fulltext_verified": fulltext,
        "longform": longform,
        "body_retained": False,
        "copyright_note": "metadata, measurements, and distilled evidence only",
        "weight": round(length_weight * type_weight * 0.95 * 0.9, 4),
    }


def list_column() -> list[dict]:
    items: list[dict] = []
    timestamp = ""
    seen: set[int] = set()
    while True:
        query = urllib.parse.urlencode({"article": "true", "userId": COLUMN_ID, "timestamp": timestamp, "count": 15})
        payload = json.loads(fetch(f"{LIST_URL}?{query}"))
        page = payload.get("result", {}).get("myHomePageItemVOS", [])
        fresh = [item for item in page if item.get("id") not in seen]
        if not fresh:
            break
        items.extend(fresh)
        seen.update(item["id"] for item in fresh)
        timestamp = str(fresh[-1]["createTimestamp"])
        if len(items) >= payload.get("totalCount", 0):
            break
        time.sleep(0.35)
    return items


def read_column_article(item: dict) -> tuple[dict, list[dict]]:
    article_num = item["id"]
    url = f"https://m.gelonghui.com/p/{article_num}"
    data = next_data(url)["props"]["pageProps"]["articleInfo"]
    markup = data.get("content") or ""
    body = plain_text(markup)
    published = datetime.fromtimestamp(data["createTimestamp"], tz=UTC).strftime("%Y-%m-%d")
    author_label, author_type = infer_founder_authorship(data["title"].strip(), body)
    row = make_row(
        title=data["title"].strip(), published=published, url=url,
        author_label=author_label, authorship_type=author_type,
        body_text=body, platform_word_count=int(data.get("wordCount") or 0),
        source_kind="李易骏公开格隆汇专栏正文",
    )
    links: list[dict] = []
    for href, label in re.findall(r'<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', markup, re.DOTALL | re.IGNORECASE):
        label = plain_text(label).strip("《》 ")
        href = html.unescape(href)
        if "mp.weixin.qq.com/s" not in href or len(label) < 4:
            continue
        links.append(make_row(
            title=label, published=published[:4], url=href,
            author_label="李易骏/归属待核", authorship_type="unknown",
            source_kind="李易骏正文中的历史原文链接索引",
            date_precision="year",
        ))
    return row, links


def read_huxiu(seed: tuple[int, str, str, str, str]) -> dict:
    article_num, published, title, author_label, author_type = seed
    url = f"https://www.huxiu.com/article/{article_num}.html"
    body = fetch(url)
    # The server-rendered state includes the article body. Measuring the visible
    # text remains conservative because navigation and scripts are excluded here.
    marker = re.search(r'"content":"(.*?)",false,0,', body, re.DOTALL)
    text = ""
    if marker:
        try:
            text = plain_text(json.loads('"' + marker.group(1) + '"'))
        except Exception:
            text = plain_text(marker.group(1))
    return make_row(
        title=title, published=published, url=url, author_label=author_label,
        authorship_type=author_type, body_text=text,
        source_kind="授权转载正文及明确作者署名",
    )


def main() -> None:
    rows: dict[str, dict] = {}
    linked: list[dict] = []
    column_items = list_column()
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(read_column_article, item): item for item in column_items}
        for index, future in enumerate(as_completed(futures), start=1):
            item = futures[future]
            try:
                row, links = future.result()
                rows[row["title"]] = row
                linked.extend(links)
            except Exception as exc:
                print(f"column warning {item.get('id')}: {exc}")
            if index % 10 == 0:
                print(f"column {index}", flush=True)
    with ThreadPoolExecutor(max_workers=5) as pool:
        futures = {pool.submit(read_huxiu, seed): seed for seed in HUXIU_SEEDS}
        for future in as_completed(futures):
            seed = futures[future]
            try:
                row = future.result()
                current = rows.get(row["title"])
                if current is None or row["authorship_type"] != "founder_original":
                    rows[row["title"]] = row
            except Exception as exc:
                print(f"huxiu warning {seed[0]}: {exc}")
    for published, title, author, author_type, url in THIRD_PARTY_SEEDS:
        rows.setdefault(title, make_row(
            title=title, published=published, url=url, author_label=author,
            authorship_type=author_type, source_kind="public reprint with explicit attribution",
        ))
    for row in linked:
        rows.setdefault(row["title"], row)
    ordered = sorted(rows.values(), key=lambda row: (row["published_at"], row["title"]))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in ordered), encoding="utf-8")
    print(json.dumps({"written": len(ordered), "column": sum(r["source_kind"].startswith("李易骏公开") for r in ordered), "output": str(OUT)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
