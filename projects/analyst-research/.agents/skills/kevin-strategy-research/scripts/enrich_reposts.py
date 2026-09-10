#!/usr/bin/env python3
"""Find verifiable public full-text mirrors for Kevin corpus records.

Only metadata, hashes, lengths and short evidence excerpts are stored. Bodies
are processed in memory and discarded.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import html
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
)
DOMAIN_QUALITY = {
    "finance.sina.com.cn": 0.85,
    "cj.sina.com.cn": 0.80,
    "sohu.com": 0.78,
    "wallstreetcn.com": 0.85,
    "stcn.com": 0.85,
    "cs.com.cn": 0.88,
    "21jingji.com": 0.82,
    "eastmoney.com": 0.75,
    "qq.com": 0.72,
    "xueqiu.com": 0.68,
    "yicai.com": 0.84,
    "jiemian.com": 0.80,
}


def fetch(url: str, timeout: int = 30) -> tuple[str, str]:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": UA,
            "Accept-Language": "zh-CN,zh;q=0.9",
            "Accept-Encoding": "gzip",
        },
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        raw = response.read()
        if response.headers.get("Content-Encoding") == "gzip":
            raw = gzip.decompress(raw)
        charset = response.headers.get_content_charset() or "utf-8"
        return raw.decode(charset, errors="replace"), response.geturl()


def clean(value: str) -> str:
    value = re.sub(r"<(script|style|noscript)[^>]*>.*?</\1>", " ", value, flags=re.DOTALL | re.IGNORECASE)
    value = re.sub(r"<!--.*?-->", " ", value, flags=re.DOTALL)
    value = re.sub(r"<[^>]+>", " ", value)
    return re.sub(r"\s+", " ", html.unescape(value)).strip()


def normalize_title(value: str) -> str:
    return re.sub(r"[^0-9A-Za-z\u4e00-\u9fff]", "", value).lower()


def search_title(value: str) -> str:
    value = re.sub(r"^【中金[^】]*】", "", value)
    value = re.sub(r"^中金\s*[|｜]?\s*(?:海外|港股|策略)?\s*[:：]?", "", value)
    return value.strip()


def title_score(expected: str, candidate: str) -> float:
    left, right = normalize_title(expected), normalize_title(candidate)
    if not left or not right:
        return 0.0
    if left in right or right in left:
        return min(len(left), len(right)) / max(len(left), len(right))
    left_pairs = {left[i : i + 2] for i in range(max(1, len(left) - 1))}
    right_pairs = {right[i : i + 2] for i in range(max(1, len(right) - 1))}
    return len(left_pairs & right_pairs) / max(1, len(left_pairs | right_pairs))


def result_links(page: str) -> list[str]:
    links = []
    for block in re.findall(r"<h3[^>]*>[\s\S]*?</h3>", page, flags=re.IGNORECASE):
        match = re.search(r'href=["\']([^"\']+)', block, flags=re.IGNORECASE)
        if match:
            links.append(html.unescape(match.group(1)))
    return links


def source_quality(url: str) -> float:
    host = urllib.parse.urlparse(url).netloc.lower()
    for domain, score in DOMAIN_QUALITY.items():
        if host == domain or host.endswith("." + domain):
            return score
    return 0.55


def inspect_page(expected_title: str, page: str, final_url: str) -> dict | None:
    if any(host in final_url for host in ("baidu.com", "mp.weixin.qq.com", "weixin.sogou.com")):
        return None
    title_match = re.search(r"<title[^>]*>(.*?)</title>", page, flags=re.DOTALL | re.IGNORECASE)
    page_title = clean(title_match.group(1)) if title_match else ""
    if title_score(expected_title, page_title) < 0.42:
        return None
    text = clean(page)
    if len(text) < 1500 or not re.search(r"中金|刘刚|海外策略", text):
        return None
    description = re.search(
        r'<meta[^>]+(?:name|property)=["\'](?:description|og:description)["\'][^>]+content=["\'](.*?)["\']',
        page,
        flags=re.DOTALL | re.IGNORECASE,
    )
    excerpt = clean(description.group(1))[:280] if description else ""
    zhang = "张巍瀚" in text
    liugang = "刘刚" in text
    return {
        "source_url": final_url,
        "page_title": page_title,
        "fulltext_status": "full",
        "character_count": len(text),
        "length_class": "longform",
        "content_hash": hashlib.sha256(text.encode()).hexdigest(),
        "body_stored": False,
        "evidence_excerpt": excerpt,
        "source_quality": source_quality(final_url),
        "attribution": {
            "liugang_present": liugang,
            "zhang_weihan_present": zhang,
            "classification": "liugang-or-team-repost" if liugang else "cicc-team-repost",
        },
    }


def checkpoint(path: Path, records: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "".join(json.dumps(record, ensure_ascii=False) + "\n" for record in records),
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--limit", type=int, default=80)
    parser.add_argument("--target", type=int, default=45)
    parser.add_argument("--delay", type=float, default=0.4)
    args = parser.parse_args()

    source = [json.loads(line) for line in args.input.read_text(encoding="utf-8").splitlines()]
    existing = []
    if args.output.exists():
        existing = [json.loads(line) for line in args.output.read_text(encoding="utf-8").splitlines()]
    by_id = {record["id"]: record for record in existing}

    attempted = 0
    for record in source:
        if record["id"] in by_id:
            continue
        if attempted >= args.limit or len(by_id) >= args.target:
            break
        attempted += 1
        query = urllib.parse.quote(f'"{search_title(record["title"])}" 刘刚 中金')
        try:
            search_page, _ = fetch(f"https://m.baidu.com/s?word={query}")
        except Exception:
            time.sleep(args.delay)
            continue
        for link in result_links(search_page)[:15]:
            try:
                page, final_url = fetch(link)
                evidence = inspect_page(record["title"], page, final_url)
            except Exception:
                evidence = None
            if evidence:
                evidence.update(
                    {
                        "id": record["id"],
                        "title": record["title"],
                        "date": record["date"],
                        "account": record["account"],
                        "discovered_from": record["index_url"],
                    }
                )
                by_id[record["id"]] = evidence
                checkpoint(args.output, sorted(by_id.values(), key=lambda item: item["date"]))
                break
        time.sleep(args.delay)

    checkpoint(args.output, sorted(by_id.values(), key=lambda item: item["date"]))
    print(json.dumps({"attempted": attempted, "verified_fulltext": len(by_id)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
