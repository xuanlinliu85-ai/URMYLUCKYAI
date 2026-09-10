from __future__ import annotations

import json
import re

from .config import Settings
from .schemas import AccountCandidate


def normalize_name(value: str) -> str:
    return re.sub(r"[\s\-_·•]+", "", value).casefold()


class AccountResolver:
    """Resolve configured, evidence-backed candidates without implementing a crawler."""

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or Settings()

    def resolve(self, query: str) -> list[AccountCandidate]:
        target = normalize_name(query)
        candidates: list[AccountCandidate] = []
        config_dir = self.settings.root / "config" / "analysts"
        for path in config_dir.glob("*.json"):
            candidate = AccountCandidate.model_validate_json(path.read_text(encoding="utf-8"))
            keys = {
                normalize_name(candidate.display_name),
                normalize_name(candidate.wechat_name),
                normalize_name(candidate.wechat_public_id),
            }
            if target in keys:
                candidates.append(candidate)
        return candidates

    def confirm(self, analyst_id: str, article_url: str, public_id: str) -> AccountCandidate:
        if not article_url.startswith("https://mp.weixin.qq.com/"):
            raise ValueError("verified article must be a real mp.weixin.qq.com URL")
        path = self.settings.root / "config" / "analysts" / f"{analyst_id}.json"
        raw = json.loads(path.read_text(encoding="utf-8"))
        if public_id != raw["wechat_public_id"]:
            raise ValueError("resolved public id does not match the candidate identity")
        raw["verified_article_url"] = article_url
        raw["verified"] = True
        path.write_text(json.dumps(raw, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return AccountCandidate.model_validate(raw)
