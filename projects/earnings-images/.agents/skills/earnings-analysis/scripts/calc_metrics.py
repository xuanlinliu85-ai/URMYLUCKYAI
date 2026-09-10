#!/usr/bin/env python3
"""Deterministic financial calculations from a normalized Fact Pack."""
import json, sys
from pathlib import Path

def safe_div(a,b):
    if a is None or b in (None,0): return None
    return a/b

def pct_change(cur, prev):
    if cur is None or prev in (None,0): return None
    return (cur/prev - 1.0) * 100.0

def main(src, dst):
    data = json.loads(Path(src).read_text(encoding="utf-8"))
    dps = data.get("datapoints", [])
    idx = {}
    for d in dps:
        if isinstance(d.get("value"), (int,float)):
            idx[(d.get("metric"), d.get("period"))] = d["value"]

    out = {
        "schema_version": "1.0",
        "company": data.get("company"),
        "period": data.get("period"),
        "calculations": []
    }

    # Explicit calculation requests can be included in the fact pack:
    # {"calculations_requested":[{"id":"C001","op":"pct_change","current":{"metric":"revenue","period":"Q2"},
    # "previous":{"metric":"revenue","period":"Q1"}}]}
    for req in data.get("calculations_requested", []):
        op = req.get("op")
        cid = req.get("id")
        def get(spec):
            if not spec: return None
            return idx.get((spec.get("metric"), spec.get("period")))
        result = None
        if op == "pct_change":
            result = pct_change(get(req.get("current")), get(req.get("previous")))
        elif op == "difference":
            a,b = get(req.get("current")), get(req.get("previous"))
            result = None if a is None or b is None else a-b
        elif op == "ratio":
            result = safe_div(get(req.get("numerator")), get(req.get("denominator")))
        out["calculations"].append({
            "calculation_id": cid,
            "op": op,
            "result": result,
            "inputs": req
        })

    Path(dst).write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {dst} with {len(out['calculations'])} calculation(s).")

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python calc_metrics.py <fact_pack.json> <calculation_pack.json>")
        raise SystemExit(2)
    main(sys.argv[1], sys.argv[2])
