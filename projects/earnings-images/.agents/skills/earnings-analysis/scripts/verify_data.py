#!/usr/bin/env python3
"""Lightweight data-integrity gate for Earnings Analyst OS.
Uses only Python stdlib. It does not prove correctness; it catches common mechanical defects.
"""
import json, sys, math
from collections import defaultdict
from pathlib import Path

def fail(msg): return ("ERROR", msg)
def warn(msg): return ("WARN", msg)

def main(path):
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    issues = []
    dps = data.get("datapoints", [])
    if not dps:
        issues.append(fail("No datapoints found."))

    bases = set()
    currencies = set()
    seen_evidence = set()
    by_key = defaultdict(list)
    primary_core = 0
    core_total = 0
    core = {"revenue","net_income","net_profit","cfo","operating_cash_flow","debt","cash","equity","eps"}

    for i, d in enumerate(dps):
        pfx = f"datapoint[{i}]"
        for k in ("metric","value","period","source","source_tier","evidence_id"):
            if d.get(k) in (None, ""):
                issues.append(fail(f"{pfx}: missing {k}"))
        tier = d.get("source_tier")
        if tier not in (1,2,3,4):
            issues.append(fail(f"{pfx}: source_tier must be 1..4"))
        ev = d.get("evidence_id")
        if ev:
            if ev in seen_evidence:
                issues.append(fail(f"{pfx}: duplicate evidence_id {ev}"))
            seen_evidence.add(ev)

        basis = d.get("basis")
        if basis: bases.add(str(basis).lower())
        cur = d.get("currency")
        if cur: currencies.add(str(cur).upper())

        metric = str(d.get("metric","")).lower()
        period = str(d.get("period",""))
        by_key[(metric, period, str(basis))].append(d)

        if metric in core:
            core_total += 1
            if tier in (1,2,3):
                primary_core += 1
            if tier == 4:
                issues.append(fail(f"{pfx}: core metric {metric} relies on Tier-4 source only"))

        val = d.get("value")
        if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
            issues.append(fail(f"{pfx}: invalid numeric value {val}"))

    if len(bases) > 1:
        issues.append(warn(f"Multiple reporting bases found: {sorted(bases)}. Verify standalone/consolidated are not mixed in calculations."))
    if len(currencies) > 1:
        issues.append(warn(f"Multiple currencies found: {sorted(currencies)}. Verify conversions before comparison."))

    for key, vals in by_key.items():
        numeric = [v.get("value") for v in vals if isinstance(v.get("value"), (int,float))]
        if len(numeric) > 1:
            lo, hi = min(numeric), max(numeric)
            denom = max(abs(lo), abs(hi), 1e-12)
            divergence = abs(hi-lo)/denom
            if divergence > 0.10:
                issues.append(fail(f"Conflicting values >10% for {key}: {numeric}"))
            elif divergence > 0.02:
                issues.append(warn(f"Conflicting values >2% for {key}: {numeric}"))

    if core_total and primary_core / core_total < 0.8:
        issues.append(warn(f"Only {primary_core}/{core_total} core datapoints use Tier 1-3 sources."))

    latest = data.get("latest_reported_period")
    pubdate = data.get("latest_report_publication_date")
    if not latest:
        issues.append(warn("latest_reported_period missing"))
    if not pubdate:
        issues.append(warn("latest_report_publication_date missing"))

    for level, msg in issues:
        print(f"{level}: {msg}")
    errors = sum(1 for x in issues if x[0] == "ERROR")
    print(f"\nSummary: {errors} error(s), {len(issues)-errors} warning(s)")
    return 1 if errors else 0

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python verify_data.py <fact_pack.json>")
        raise SystemExit(2)
    raise SystemExit(main(sys.argv[1]))
