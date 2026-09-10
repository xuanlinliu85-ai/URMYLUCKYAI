#!/usr/bin/env python3
import json
import sys
from pathlib import Path

p=Path(sys.argv[1]); d=json.loads(p.read_text(encoding="utf-8"))
req=["title","date","authorship_type","core_thesis","pricing_anchor","trade_expression","falsification"]
miss=[x for x in req if x not in d]
if miss: raise SystemExit("missing: "+", ".join(miss))
for k in ["framework_module","macro_regime","cross_asset_confirmation","positioning","relative_value","catalysts"]:
    d.setdefault(k,[])
d.setdefault("source",""); d.setdefault("fulltext_status","partial")
d.setdefault("relationship_to_prior","APPLICATION")
d.setdefault("confidence",{"source_quality":0.5,"framework_confidence":0.5})
p.write_text(json.dumps(d,ensure_ascii=False,indent=2),encoding="utf-8")
print(p)
