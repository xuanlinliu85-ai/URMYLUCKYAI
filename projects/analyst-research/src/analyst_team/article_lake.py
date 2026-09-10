from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path

import yaml

from .config import Settings


@dataclass(frozen=True)
class ArticleDocument:
    article_id: str
    title: str
    published_at: str | None
    source_url: str | None
    path: Path
    content: str


class ArticleLake:
    def __init__(self, analyst_id: str, settings: Settings | None = None) -> None:
        self.settings = settings or Settings()
        self.analyst_id = analyst_id
        self.root = self.settings.analyst_dir(analyst_id)
        for name in ("raw/html", "raw/metadata", "markdown", "distilled", "dna", "skill"):
            (self.root / name).mkdir(parents=True, exist_ok=True)

    @staticmethod
    def _frontmatter(text: str) -> tuple[dict, str]:
        if not text.startswith("---\n"):
            return {}, text
        _, raw, body = text.split("---", 2)
        return yaml.safe_load(raw) or {}, body.lstrip()

    def documents(self) -> list[ArticleDocument]:
        documents: list[ArticleDocument] = []
        for path in sorted((self.root / "markdown").glob("*.md")):
            if path.name.startswith("_"):
                continue
            text = path.read_text(encoding="utf-8")
            metadata, body = self._frontmatter(text)
            article_id = str(metadata.get("article_id") or hashlib.sha256(body.encode()).hexdigest()[:16])
            documents.append(ArticleDocument(
                article_id=article_id,
                title=str(metadata.get("title") or path.stem),
                published_at=(
                    metadata.get("published_at")
                    or metadata.get("publish_date")
                    or metadata.get("date")
                ),
                source_url=metadata.get("source_url") or metadata.get("url"),
                path=path,
                content=body,
            ))
        return documents

    def write_distillation(self, article_id: str, value: dict) -> Path:
        path = self.root / "distilled" / f"{article_id}.json"
        path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return path
