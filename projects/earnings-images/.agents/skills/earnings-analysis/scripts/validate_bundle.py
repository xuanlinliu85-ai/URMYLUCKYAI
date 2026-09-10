#!/usr/bin/env python3
"""Validate the Earnings Analyst OS skill bundle before installing."""
from pathlib import Path
import json, sys

ROOT = Path(__file__).resolve().parents[1]
required = [
    "SKILL.md",
    "references/IFIND_ADAPTER.md",
    "references/SECTOR_PLAYBOOKS.md",
    "references/EARNINGS_CALL_INTELLIGENCE.md",
    "references/CHALLENGE_PASS.md",
    "references/EXPECTATION_GAP.md",
    "references/COMPANY_CONTEXT.md",
    "schemas/fact_pack.schema.json",
    "schemas/slidespec.schema.json",
    "schemas/expectation_pack.schema.json",
    "scripts/verify_data.py",
    "scripts/calc_metrics.py",
    "scripts/lint_research.py",
    "config/providers.yaml",
    "config/registries.yaml",
    "scripts/preflight.py"
]

missing = [p for p in required if not (ROOT/p).exists()]
for p in required:
    print(("OK   " if p not in missing else "MISS ") + p)

for p in ["schemas/fact_pack.schema.json","schemas/expectation_pack.schema.json","schemas/slidespec.schema.json"]:
    if (ROOT/p).exists():
        json.loads((ROOT/p).read_text(encoding="utf-8"))

if missing:
    print(f"\nBundle invalid: {len(missing)} missing file(s).")
    raise SystemExit(1)
print("\nBundle structure valid.")
