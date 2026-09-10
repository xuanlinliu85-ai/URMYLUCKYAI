#!/usr/bin/env python3
import json
import sys
from pathlib import Path

p = Path(sys.argv[1])
d = json.loads(p.read_text(encoding="utf-8"))

required = ["title", "date", "core_question", "mechanism", "falsification"]
missing = [x for x in required if x not in d]
if missing:
    raise SystemExit("missing required fields: " + ", ".join(missing))

d.setdefault("source", "")
d.setdefault("source_type", "unknown")
d.setdefault("fulltext_status", "partial")
d.setdefault("variables", [])
d.setdefault("quant_methods", [])
d.setdefault("historical_analogues", [])
d.setdefault("scenarios", [])
d.setdefault("asset_mapping", {})
d.setdefault("key_indicators", [])
d.setdefault("relationship_to_prior", "APPLICATION")
d.setdefault("confidence", {"source_quality": 0.5, "framework_confidence": 0.5})

p.write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding="utf-8")
print(p)
