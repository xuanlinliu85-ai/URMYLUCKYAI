#!/usr/bin/env python3
"""Collect a metadata-only 覃汉研究笔记 index from a public archive."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import time
from pathlib import Path
from urllib.parse import urljoin, urlsplit, urlunsplit

import httpx
from bs4 import BeautifulSoup

BASE = "https://www.jintiankansha.com"
COLUMN = f"{BASE}/column/LMiT2g98sx"
DATE_PATTERN = re.compile(r"20\d{2}-\d{2}-\d{2}\s+\d{2}:\d{2}")


def fetch(client: httpx.Client, url: str) -> str:
    last_error: Exception | None = None
    for attempt in range(4):
        try:
            response = client.get(url)
            response.raise_for_status()
            response.encoding = "utf-8"
            return response.text
        except (httpx.HTTPError, ValueError) as exc:
            last_error = exc
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"failed to fetch {url}") from last_error


def collect(output: Path, pages: int, pause: float) -> dict[str, int]:
    headers = {"User-Agent": "Mozilla/5.0 (compatible; AnalystCorpusAudit/1.0)"}
    entries: dict[str, dict[str, str]] = {}
    with httpx.Client(headers=headers, follow_redirects=True, timeout=30) as client:
        for page in range(1, pages + 1):
            page_url = COLUMN if page == 1 else f"{COLUMN}?page={page}"
            soup = BeautifulSoup(fetch(client, page_url), "html.parser")
            for link in soup.select("span.item_title a[href]"):
                title = re.sub(r"\s+", " ", link.get_text(" ", strip=True))
                raw_url = urljoin(BASE, str(link.get("href")))
                parts = urlsplit(raw_url)
                detail_url = urlunsplit(("https", parts.netloc, parts.path, "", ""))
                if title and parts.netloc == "www.jintiankansha.com" and parts.path.startswith("/t/"):
                    entries[detail_url] = {"title": title, "source_url": detail_url}
            print(f"index page={page} candidates={len(entries)}", flush=True)
            time.sleep(pause)

        records = []
        for number, entry in enumerate(entries.values(), start=1):
            detail = fetch(client, entry["source_url"])
            match = DATE_PATTERN.search(BeautifulSoup(detail, "html.parser").get_text(" ", strip=True))
            published_at = match.group(0)[:10] if match else ""
            identity = "覃汉研究笔记" in detail
            if identity and published_at:
                records.append(
                    {
                        "analyst_id": "qinhan-fixed-income",
                        "title": entry["title"],
                        "published_at": published_at,
                        "source_url": entry["source_url"],
                        "source_type": "public_archive_index",
                        "source_platform": "今天看啥",
                        "original_channel": "覃汉研究笔记",
                        "authorship_type": "team_platform_unresolved",
                        "fulltext_status": "title_only",
                        "text_length": 0,
                        "content_hash": hashlib.sha256(
                            f"{published_at}|{entry['title']}".encode()
                        ).hexdigest(),
                        "source_quality": 0.6,
                        "article_weight": 0.03,
                    }
                )
            if number % 20 == 0:
                print(f"details={number}/{len(entries)} accepted={len(records)}", flush=True)
            time.sleep(pause)

    records.sort(key=lambda item: (item["published_at"], item["title"]))
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        "".join(json.dumps(record, ensure_ascii=False) + "\n" for record in records),
        encoding="utf-8",
    )
    return {
        "discovered": len(entries),
        "accepted": len(records),
        "earliest_year": min((int(row["published_at"][:4]) for row in records), default=0),
        "latest_year": max((int(row["published_at"][:4]) for row in records), default=0),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--pages", type=int, default=4)
    parser.add_argument("--pause", type=float, default=0.15)
    args = parser.parse_args()
    print(json.dumps(collect(args.output, args.pages, args.pause), ensure_ascii=False))


if __name__ == "__main__":
    main()
