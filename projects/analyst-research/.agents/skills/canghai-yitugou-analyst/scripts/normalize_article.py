#!/usr/bin/env python3
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
data = json.loads(path.read_text(encoding="utf-8"))
for key in ["title", "date", "core_thesis", "causal_chain", "falsification"]:
    if key not in data:
        raise SystemExit(f"missing required field: {key}")
data.setdefault("source", "")
data.setdefault("source_type", "unknown")
data.setdefault("fulltext_status", "partial")
data.setdefault("variables", {k: [] for k in ["R","M","F","S","C","H","P"]})
data.setdefault("asset_mapping", {})
data.setdefault("key_indicators", [])
data.setdefault("relationship_to_prior", "APPLICATION")
data.setdefault("confidence", {"source_quality": 0.5, "framework_confidence": 0.5})
path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
print(path)
