from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env.local")
load_dotenv(ROOT / ".env")


@dataclass(frozen=True)
class Settings:
    root: Path = ROOT
    data_root: Path = ROOT / "data" / "analysts"
    third_party_root: Path = ROOT / ".third_party"
    openai_model: str = os.getenv("OPENAI_MODEL", "gpt-5.6-luna")
    wechat_archiver_base_url: str | None = os.getenv("WECHAT_ARCHIVER_BASE_URL") or None

    def analyst_config(self, analyst_id: str) -> dict:
        path = self.root / "config" / "analysts" / f"{analyst_id}.json"
        return json.loads(path.read_text(encoding="utf-8"))

    def analyst_dir(self, analyst_id: str) -> Path:
        return self.data_root / analyst_id

