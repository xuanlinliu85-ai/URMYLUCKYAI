from __future__ import annotations

import re
from collections import Counter
from typing import Any, Iterable


DATA_QUALITY_VERSION = "fund-universe-quality-v1"
FUND_CODE_PATTERN = re.compile(r"^\d{6}\.(?:OF|SH|SZ)$")


def validate_universe_rows(rows: Iterable[dict[str, Any]]) -> dict[str, Any]:
    materialized = list(rows)
    code_counts = Counter(str(row.get("fund_code", "")).upper() for row in materialized)
    results: list[dict[str, Any]] = []
    for index, row in enumerate(materialized):
        code = str(row.get("fund_code", "")).upper()
        issues: list[dict[str, str]] = []
        if not FUND_CODE_PATTERN.fullmatch(code):
            issues.append({"field": "fund_code", "issue_type": "invalid_format", "severity": "error"})
        if code_counts[code] > 1:
            issues.append({"field": "fund_code", "issue_type": "duplicate", "severity": "error"})
        if not str(row.get("fund_name", "")).strip():
            issues.append({"field": "fund_name", "issue_type": "missing", "severity": "error"})
        if not str(row.get("investment_type", "")).strip():
            issues.append({"field": "investment_type", "issue_type": "missing", "severity": "warning"})
        aum = row.get("aum")
        if aum is not None and aum < 0:
            issues.append({"field": "aum", "issue_type": "negative", "severity": "error"})
        nav = row.get("nav")
        if nav is not None and nav <= 0:
            issues.append({"field": "nav", "issue_type": "non_positive", "severity": "error"})
        status = "invalid" if any(item["severity"] == "error" for item in issues) else "warning" if issues else "validated"
        results.append({"row_index": index, "fund_code": code, "quality_status": status, "issues": issues})
    return {
        "quality_version": DATA_QUALITY_VERSION,
        "total_rows": len(materialized),
        "validated_rows": sum(item["quality_status"] == "validated" for item in results),
        "warning_rows": sum(item["quality_status"] == "warning" for item in results),
        "invalid_rows": sum(item["quality_status"] == "invalid" for item in results),
        "results": results,
    }

