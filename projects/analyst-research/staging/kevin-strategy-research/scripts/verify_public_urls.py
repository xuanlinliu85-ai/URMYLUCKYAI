#!/usr/bin/env python3
"""Verify Kevin public URLs and retain metadata-only evidence.

Public article bodies are decoded and inspected in memory. The output retains
the URL, normalized body length/hash, visible attribution, and a short excerpt.
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
from datetime import datetime
from pathlib import Path

UA = "Mozilla/5.0"
BLOCK_MARKERS = ("百度安全验证", "访问验证", "captcha", "verify you are human")


def load_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]


def decode_page(raw: bytes, charset: str | None) -> str:
    encodings = [charset, "utf-8", "gb18030"]
    candidates: list[tuple[int, str]] = []
    for encoding in dict.fromkeys(item for item in encodings if item):
        value = raw.decode(encoding, errors="replace")
        score = value.count("\ufffd") * -20 + len(re.findall(r"[\u4e00-\u9fff]", value))
        candidates.append((score, value))
    return max(candidates, key=lambda item: item[0])[1]


def fetch(url: str, timeout: int) -> tuple[str, str]:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": UA, "Accept-Language": "zh-CN,zh;q=0.9", "Accept-Encoding": "gzip"},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        raw = response.read()
        if response.headers.get("Content-Encoding") == "gzip":
            raw = gzip.decompress(raw)
        return decode_page(raw, response.headers.get_content_charset()), response.geturl()


def visible_text(page: str) -> str:
    value = re.sub(r"<(script|style|noscript)[^>]*>.*?</\1>", " ", page, flags=re.DOTALL | re.IGNORECASE)
    value = re.sub(r"<!--.*?-->|<[^>]+>", " ", value, flags=re.DOTALL)
    return re.sub(r"\s+", " ", html.unescape(value)).strip()


def date_from(text: str, hint: str | None) -> str | None:
    match = re.search(r"(?<!\d)(20(?:1[9]|2[0-6]))[/-](0?[1-9]|1[0-2])[/-]([0-2]?\d|3[01])(?!\d)", text)
    candidate = f"{int(match.group(1)):04d}-{int(match.group(2)):02d}-{int(match.group(3)):02d}" if match else hint
    if candidate:
        datetime.strptime(candidate, "%Y-%m-%d")
    return candidate


def visible_author_line(text: str) -> str:
    patterns = (
        r"本文作者[：:]\s*([^。；]{1,120}?)(?:，来源|来源[：:]|本文节选|。)",
        r"((?:中金公司|中金)?刘刚(?:、[^，。；]{1,100})?)(?=\s+20\d{2}[/-])",
        r"作者[：:]\s*([^。；]{1,120}?)(?:，来源|来源[：:]|。)",
    )
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            return re.sub(r"\s+", " ", match.group(1)).strip(" ，,")
    return ""


def attribution_from(text: str, source_type: str) -> dict:
    authors = visible_author_line(text)
    liugang = "刘刚" in authors
    named_people = re.findall(r"[\u4e00-\u9fff]{2,4}", re.sub(r"中金(?:公司)?", "", authors))
    named_people = [name for name in named_people if name not in {"本文作者", "来源", "研究部"}]
    coauthored = liugang and ("、" in authors or "等" in authors or len(named_people) > 1)
    if source_type == "author-speech-transcript" and liugang:
        classification = "liugang-personal-speech"
    elif liugang and coauthored:
        classification = "liugang-explicit-coauthored"
    elif liugang:
        classification = "liugang-explicit-solo"
    else:
        classification = "cicc-team-no-liugang"
    return {
        "visible_author_line": authors,
        "liugang_present": liugang,
        "coauthored": coauthored,
        "zhang_weihan_present": "张巍瀚" in authors,
        "li_hemin_present": "李赫民" in authors,
        "classification": classification,
        "source_form": "public-repost",
    }


def meta_value(page: str, key: str) -> str:
    patterns = (
        rf'<meta[^>]+(?:name|property)=["\'](?:{key})["\'][^>]+content=["\'](.*?)["\']',
        rf'<meta[^>]+content=["\'](.*?)["\'][^>]+(?:name|property)=["\'](?:{key})["\']',
    )
    for pattern in patterns:
        match = re.search(pattern, page, flags=re.DOTALL | re.IGNORECASE)
        if match:
            return visible_text(match.group(1))
    return ""


def verify(candidate: dict, timeout: int) -> dict:
    page, final_url = fetch(candidate["source_url"], timeout)
    text = visible_text(page)
    if any(marker.lower() in text.lower() for marker in BLOCK_MARKERS):
        raise ValueError("verification page")
    if urllib.parse.urlparse(final_url).netloc.lower() != "wallstreetcn.com":
        raise ValueError("unexpected redirect")
    if len(text) < 1500 or not re.search(r"刘刚|中金公司研究部|中金点睛", text):
        raise ValueError("insufficient article text")
    attribution = attribution_from(text, candidate.get("source_type", ""))
    if not attribution["liugang_present"]:
        raise ValueError("Liu Gang attribution unavailable")
    excerpt = meta_value(page, "description|og:description") or text[:280]
    normalized_body = re.sub(r"\s+", " ", text).strip()
    return {
        "id": candidate["id"],
        "title": candidate["title"],
        "date": date_from(text, candidate.get("date_hint")),
        "account": "Kevin策略研究 / 中金海外策略",
        "source_url": final_url,
        "source_type": candidate.get("source_type", "high-quality-repost"),
        "fulltext_status": "full",
        "character_count": len(normalized_body),
        "length_class": "longform" if len(normalized_body) >= 1500 else "short",
        "content_hash": hashlib.sha256(normalized_body.encode("utf-8")).hexdigest(),
        "body_stored": False,
        "evidence_excerpt": excerpt[:280],
        "source_quality": 0.85,
        "verification_method": "curated-direct-public-url",
        "attribution": attribution,
    }


def save(path: Path, records: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    content = "".join(json.dumps(record, ensure_ascii=False) + "\n" for record in records)
    path.write_text(content, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--failures", type=Path)
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument("--timeout", type=int, default=30)
    parser.add_argument("--delay", type=float, default=0.5)
    args = parser.parse_args()
    existing = load_jsonl(args.output)
    by_id = {record["id"]: record for record in existing}
    failures: list[dict] = []
    attempted = verified = 0
    for candidate in load_jsonl(args.input):
        if candidate["id"] in by_id or attempted >= args.limit:
            continue
        attempted += 1
        try:
            record = verify(candidate, args.timeout)
        except Exception as exc:
            failures.append({"id": candidate["id"], "source_url": candidate["source_url"], "reason": str(exc)})
        else:
            by_id[record["id"]] = record
            verified += 1
            save(args.output, sorted(by_id.values(), key=lambda item: item["date"] or ""))
        time.sleep(args.delay)
    save(args.output, sorted(by_id.values(), key=lambda item: item["date"] or ""))
    if args.failures:
        save(args.failures, failures)
    print(json.dumps({"attempted": attempted, "new_verified": verified, "failed": len(failures), "total_verified": len(by_id)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
