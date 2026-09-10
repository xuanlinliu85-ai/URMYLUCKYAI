import json
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(r"C:\Users\urmylucky\Documents\每日复盘更新")


def normalize_category(value):
    value = str(value or "").replace("&nbsp;", "").strip()
    return {"ҽҩ": "医药"}.get(value, value)


history = json.loads((ROOT / "analysis" / "history.json").read_text(encoding="utf-8"))
today = json.loads((ROOT / "analysis" / "today_top100.json").read_text(encoding="utf-8"))
overrides = json.loads((ROOT / "analysis" / "category_overrides.json").read_text(encoding="utf-8"))
draft_path = ROOT / "analysis" / "today_classification_draft.json"
prior_draft = None
rerun_draft = None
if draft_path.exists():
    candidate = json.loads(draft_path.read_text(encoding="utf-8"))
    if candidate.get("asOf", "") < today.get("asOf", ""):
        prior_draft = candidate
    elif candidate.get("asOf", "") == today.get("asOf", ""):
        rerun_draft = candidate

assignments = defaultdict(list)
for day in history:
    for group in day.get("groups", []):
        category = normalize_category(group.get("category"))
        if not category or "→" in category or category.isdigit():
            continue
        for stock in group.get("stocks", []):
            assignments[stock["code"]].append((day["date"], category))

if prior_draft:
    for stock in prior_draft.get("rows", []):
        category = normalize_category(stock.get("category"))
        if category:
            assignments[stock["code"]].append((prior_draft["asOf"], category))

draft = []
rerun_categories = {
    stock["code"]: normalize_category(stock.get("category"))
    for stock in (rerun_draft or {}).get("rows", [])
    if normalize_category(stock.get("category"))
}
for row in today["rows"]:
    seen = assignments.get(row["code"], [])
    recent = [category for date, category in seen if date >= "2026-06-01"]
    all_counts = Counter(category for _, category in seen)
    recent_counts = Counter(recent)
    latest = seen[-1][1] if seen else ""
    history_choice = latest or (recent_counts.most_common(1)[0][0] if recent_counts else "") or (all_counts.most_common(1)[0][0] if all_counts else "")
    chosen = normalize_category(overrides.get(row["code"])) or rerun_categories.get(row["code"], "") or history_choice
    draft.append({
        **row,
        "category": chosen,
        "lastSeen": seen[-1][0] if seen else "",
        "recentCandidates": recent_counts.most_common(5),
        "allCandidates": all_counts.most_common(5),
        "override": overrides.get(row["code"], ""),
    })

if prior_draft:
    previous_date = prior_draft["asOf"]
    previous_counts = Counter(
        normalize_category(row.get("category")) for row in prior_draft.get("rows", [])
        if normalize_category(row.get("category"))
    )
elif rerun_draft:
    previous_date = rerun_draft.get("previousDate", "")
    previous_counts = Counter(rerun_draft.get("previousCounts", {}))
else:
    previous_date = history[-1]["date"] if history else ""
    previous_counts = Counter()
draft_path.write_text(
    json.dumps({
        "asOf": today["asOf"],
        "previousDate": previous_date,
        "previousCounts": previous_counts,
        "rows": draft,
    }, ensure_ascii=False, indent=2),
    encoding="utf-8",
)

unknown = [row for row in draft if not row["category"]]
ambiguous = [row for row in draft if len(row["recentCandidates"]) > 1]
counts = Counter(row["category"] or "未分类" for row in draft)
print(json.dumps({
    "counts": counts.most_common(),
    "unknown": [{k: row[k] for k in ("rank", "code", "name")} for row in unknown],
    "ambiguous": [{k: row[k] for k in ("rank", "code", "name", "category", "lastSeen", "recentCandidates")} for row in ambiguous],
}, ensure_ascii=True, indent=2))
