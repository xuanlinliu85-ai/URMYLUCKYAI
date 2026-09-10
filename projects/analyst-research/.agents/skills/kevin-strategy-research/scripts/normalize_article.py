#!/usr/bin/env python3
import json
import sys
from pathlib import Path

p = Path(sys.argv[1])
d = json.loads(p.read_text(encoding="utf-8"))

required = ["title", "date", "core_thesis", "numerator_denominator", "pricing", "falsification"]
missing = [k for k in required if k not in d]
if missing:
    raise SystemExit("missing: " + ", ".join(missing))

d.setdefault("source", "")
d.setdefault("source_type", "unknown")
d.setdefault("fulltext_status", "partial")
d.setdefault("valuation", [])
d.setdefault("positioning", [])
d.setdefault("flows", [])
d.setdefault("crowding", [])
d.setdefault("asset_mapping", {})
d.setdefault("win_probability", "")
d.setdefault("payoff_odds", "")
d.setdefault("relationship_to_prior", "APPLICATION")
d.setdefault("confidence", {"source_quality": 0.5, "framework_confidence": 0.5})

p.write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding="utf-8")
print(p)
