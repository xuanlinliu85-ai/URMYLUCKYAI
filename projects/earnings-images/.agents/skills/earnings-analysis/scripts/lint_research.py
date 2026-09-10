#!/usr/bin/env python3
"""Lightweight research linter for Earnings Analyst OS."""
import re, sys
from pathlib import Path

REQUIRED = [
    "核心结论",
    "财报",
    "Guidance",
    "预期差",
    "风险",
    "最终"
]

def main(path):
    text = Path(path).read_text(encoding="utf-8")
    issues = []
    for token in REQUIRED:
        if token.lower() not in text.lower():
            issues.append(("WARN", f"Required concept/section may be missing: {token}"))

    if re.search(r"\b(TODO|TBD)\b|<[^>\n]{2,40}>", text, flags=re.I):
        issues.append(("ERROR", "Unresolved TODO/TBD/template placeholder found."))

    # Material numeric cues: percentages, currency amounts, multiples.
    nums = list(re.finditer(r"(?<![\w])(?:[$¥€£]\s*)?\d+(?:\.\d+)?\s*(?:%|x|倍|亿元|万元|百万|十亿|bn|mn)?", text, flags=re.I))
    uncited = []
    for m in nums:
        start = max(0, m.start()-100)
        end = min(len(text), m.end()+120)
        window = text[start:end]
        if not re.search(r"\[(?:E|C)\d{2,}\]|Evidence|Calculation|来源|Source|as of|截至", window, flags=re.I):
            uncited.append(m.group(0))

    if len(uncited) >= 5:
        issues.append(("WARN", f"Many numbers appear without nearby Evidence/Calculation cues. Sample: {uncited[:8]}"))

    for level, msg in issues:
        print(f"{level}: {msg}")
    errors = sum(1 for x in issues if x[0] == "ERROR")
    print(f"\nSummary: {errors} error(s), {len(issues)-errors} warning(s)")
    return 1 if errors else 0

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python lint_research.py <research.md>")
        raise SystemExit(2)
    raise SystemExit(main(sys.argv[1]))
