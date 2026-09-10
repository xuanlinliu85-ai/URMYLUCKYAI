import csv
import json
import re
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(r"C:\Users\urmylucky\Desktop\成交量100")
OUT = Path(r"C:\Users\urmylucky\Documents\每日复盘更新\analysis")
CODE_RE = re.compile(r"^(?:\d{6}\.(?:SZ|SH|BJ)|\d{5}\.HK)$")


def repair_mojibake(text: str) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return ""
    try:
        return text.encode("gb18030").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return text.replace("?/td>", "").strip()


def parse_html_rows(path: Path):
    raw = path.read_text(encoding="utf-8", errors="replace")
    rows = []
    for tr in re.findall(r"<tr\b[^>]*>(.*?)</tr>", raw, flags=re.I | re.S):
        cells = []
        parts = re.split(r"<td\b", tr, flags=re.I)[1:]
        for part in parts:
            attr, _, body = part.partition(">")
            colspan_match = re.search(r'colspan\s*=\s*["\']?(\d+)', attr, flags=re.I)
            colspan = int(colspan_match.group(1)) if colspan_match else 1
            body = re.split(r"<td\b|</tr>", body, maxsplit=1, flags=re.I)[0]
            body = re.sub(r"<[^>]+>", "", body)
            body = repair_mojibake(body)
            cells.append(body)
            cells.extend([""] * (colspan - 1))
        if cells:
            rows.append(cells)
    return rows


def parse_sheet1(path: Path):
    rows = parse_html_rows(path)
    records = []
    for row in rows:
        if row and CODE_RE.match(row[0]):
            vals = (row + [""] * 6)[:6]
            records.append({
                "code": vals[0], "name": vals[1], "price": vals[2],
                "pct": vals[3], "amount": vals[4], "rank": vals[5],
            })
    return records


def parse_sheet2(path: Path):
    rows = parse_html_rows(path)
    groups = []
    header_indexes = [i for i, row in enumerate(rows) if row and row[0] == "股票代码"]
    for block_index, header_idx in enumerate(header_indexes):
        category_idx = header_idx + 1
        if category_idx >= len(rows):
            continue
        category_row = rows[category_idx]
        next_header = header_indexes[block_index + 1] if block_index + 1 < len(header_indexes) else len(rows)
        block_groups = []
        for start in (0, 7, 14, 21):
            label = category_row[start] if start < len(category_row) else ""
            count_note = category_row[start + 5] if start + 5 < len(category_row) else ""
            if label:
                block_groups.append((start, {"category": label, "count_note": count_note, "stocks": []}))
        for row in rows[category_idx + 1:next_header]:
            for start, group in block_groups:
                if start < len(row) and CODE_RE.match(row[start]):
                    vals = (row[start:start + 6] + [""] * 6)[:6]
                    if not any(stock["code"] == vals[0] for stock in group["stocks"]):
                        group["stocks"].append({
                            "code": vals[0], "name": vals[1], "price": vals[2],
                            "pct": vals[3], "amount": vals[4], "rank": vals[5],
                        })
        groups.extend(group for _, group in block_groups)
    return rows, groups


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    days = []
    membership = defaultdict(Counter)
    category_days = Counter()
    issues = []
    for folder in sorted(ROOT.glob("*.files")):
        date = folder.name.removesuffix(".files")
        s1 = folder / "sheet001.htm"
        s2 = folder / "sheet002.htm"
        if not s1.exists() or not s2.exists():
            issues.append({"date": date, "issue": "missing sheet html"})
            continue
        top100 = parse_sheet1(s1)
        _, groups = parse_sheet2(s2)
        for group in groups:
            if group["category"]:
                category_days[group["category"]] += 1
            for stock in group["stocks"]:
                membership[stock["code"]][group["category"]] += 1
        if len(top100) < 90:
            issues.append({"date": date, "issue": f"sheet1 rows={len(top100)}"})
        days.append({"date": date, "top100": top100, "groups": groups})

    summary = {
        "day_count": len(days),
        "first_date": days[0]["date"] if days else None,
        "last_date": days[-1]["date"] if days else None,
        "category_days": category_days.most_common(),
        "issues": issues,
        "memberships": {
            code: counts.most_common() for code, counts in sorted(membership.items())
        },
    }
    (OUT / "history.json").write_text(json.dumps(days, ensure_ascii=False, indent=2), encoding="utf-8")
    (OUT / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    with (OUT / "memberships.csv").open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["股票代码", "分类", "出现次数"])
        for code, counts in sorted(membership.items()):
            for category, count in counts.most_common():
                writer.writerow([code, category, count])
    print(json.dumps({k: summary[k] for k in ("day_count", "first_date", "last_date", "category_days", "issues")}, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()
