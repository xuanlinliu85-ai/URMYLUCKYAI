#!/usr/bin/env python3
"""Build auditable BaoFeng Energy 2026H1 research artifacts."""
from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
RESEARCH = ROOT / "research"
DATA.mkdir(exist_ok=True)
RESEARCH.mkdir(exist_ok=True)

OFFICIAL_REPORT = "https://money.finance.sina.com.cn/corp/view/vCB_AllBulletinDetail.php?id=12490274&stockid=600989"
OFFICIAL_SUMMARY = "https://static.cninfo.com.cn/finalpage/2026-08-13/1225470232.PDF"
PREANNOUNCEMENT = "https://money.finance.sina.com.cn/corp/view/vCB_AllBulletinDetail.php?id=12442017&stockid=600989"
BRIEFING = "https://money.finance.sina.com.cn/corp/view/vCB_AllBulletinDetail.php?id=12504194&stockid=600989"
INDUSTRY = OFFICIAL_REPORT
IFIND = "iFinD MCP licensed dataset; retrieved 2026-09-06"


def dp(metric, value, period, evidence_id, source=IFIND, tier=2, unit="CNY", basis="consolidated"):
    return {
        "metric": metric,
        "value": value,
        "unit": unit,
        "currency": "CNY" if unit in {"CNY", "CNY/share"} else None,
        "period": period,
        "basis": basis,
        "source": source,
        "source_tier": tier,
        "evidence_id": evidence_id,
    }


points = []

# Three fiscal years and eight single quarters. Values are CNY unless specified.
annual = {
    "FY2023": (29135511197.96, 5650614862.71, 8856519735.40, 8692623772.83, 0.77),
    "FY2024": (32982889902.49, 6337676311.63, 10932724619.90, 8897635369.03, 0.87),
    "FY2025": (48037593136.78, 11350295509.65, 17253144364.28, 16851078343.67, 1.56),
}
eid = 1
for period, vals in annual.items():
    for metric, value, unit in zip(("revenue", "net_income", "gross_profit", "cfo", "eps"), vals, ("CNY", "CNY", "CNY", "CNY", "CNY/share")):
        points.append(dp(metric, value, period, f"E{eid:03d}", unit=unit)); eid += 1

quarters = {
    "2024Q3": (7377425714.67, 1232101600.42, 2517262333.09, 1634193219.27),
    "2024Q4": (8708325898.16, 1800885906.83, 2738045091.00, 3118086869.39),
    "2025Q1": (10770741271.32, 2436717409.01, 3808848482.80, 3417082722.16),
    "2025Q2": (12048802067.83, 3280908466.87, 4574331298.57, 4572726204.32),
    "2025Q3": (12725335447.14, 3232261154.84, 4879696707.92, 5591983308.37),
    "2025Q4": (12492714350.49, 2400408478.93, 3990267874.99, 3269286108.82),
    "2026Q1": (13236777393.86, 3660674643.20, 4951122319.75, 5563194631.76),
    "2026Q2": (16960806147.47, 6067144053.30, 8203921422.88, 6401143863.59),
}
for period, vals in quarters.items():
    for metric, value in zip(("revenue", "net_income", "gross_profit", "cfo"), vals):
        points.append(dp(metric, value, period, f"E{eid:03d}")); eid += 1

h1 = {
    "revenue": 30197583541.33,
    "profit_before_tax": 11507078100.10,
    "net_income": 9727818696.50,
    "adjusted_net_income": 9209887019.74,
    "gross_profit": 13155043742.63,
    "cfo": 11964338495.35,
    "capex": 4602989394.94,
    "eps": 1.33,
    "roe": 18.61,
}
for metric, value in h1.items():
    unit = "%" if metric == "roe" else ("CNY/share" if metric == "eps" else "CNY")
    points.append(dp(metric, value, "2026H1", f"E{eid:03d}", source=OFFICIAL_REPORT, tier=1, unit=unit)); eid += 1

h1_prior = {
    "revenue": 22819543339.15,
    "net_income": 5717625875.88,
    "gross_profit": 8383179781.37,
    "cfo": 7989808926.48,
    "capex": 2754500000.00,
}
for metric, value in h1_prior.items():
    points.append(dp(metric, value, "2025H1", f"E{eid:03d}")); eid += 1

balance = {
    "total_assets": (94913197407.90, "2026-06-30"),
    "total_liabilities": (39708015970.28, "2026-06-30"),
    "cash": (2639964551.61, "2026-06-30"),
    "inventory": (1961574875.50, "2026-06-30"),
    "total_assets_prior": (90152489325.37, "2025-12-31"),
    "total_liabilities_prior": (41762569552.36, "2025-12-31"),
    "cash_prior": (1344970558.87, "2025-12-31"),
    "inventory_prior": (1966414684.91, "2025-12-31"),
}
for metric, (value, period) in balance.items():
    points.append(dp(metric, value, period, f"E{eid:03d}")); eid += 1

operating = [
    ("polymer_output", 2973100, "2026H1", "tonnes"),
    ("coke_output", 3468100, "2026H1", "tonnes"),
    ("pe_sales", 1434500, "2026H1", "tonnes"),
    ("pe_asp", 6824.69, "2026H1", "CNY/tonne"),
    ("pp_sales", 1391500, "2026H1", "tonnes"),
    ("pp_asp", 7122.95, "2026H1", "CNY/tonne"),
    ("feed_coal_purchase_price", 491.01, "2026H1", "CNY/tonne"),
    ("olefins_revenue", 24108060000, "2026H1", "CNY"),
    ("olefins_cost", 13047950000, "2026H1", "CNY"),
    ("inner_mongolia_revenue", 14186820000, "2026H1", "CNY"),
    ("inner_mongolia_net_income", 4725190000, "2026H1", "CNY"),
    ("phase4_budget", 10547700000, "2026H1", "CNY"),
    ("phase4_cip", 3395600000, "2026H1", "CNY"),
    ("fair_value_gain", 948237000, "2026H1", "CNY"),
    ("donation_expense", 301000000, "2026H1", "CNY"),
]
for metric, value, period, unit in operating:
    points.append(dp(metric, value, period, f"E{eid:03d}", source=OFFICIAL_REPORT, tier=1, unit=unit)); eid += 1

market = [
    ("close", 23.03521, "2026-08-12", "CNY/share"),
    ("market_cap", 171820600000, "2026-08-12", "CNY"),
    ("pe_ttm", 11.1859, "2026-08-12", "x"),
    ("pb", 3.2968, "2026-08-12", "x"),
    ("close", 24.40, "2026-09-04", "CNY/share"),
    ("market_cap", 178934000000, "2026-09-04", "CNY"),
    ("pe_ttm", 11.6490, "2026-09-04", "x"),
    ("pb", 3.2413, "2026-09-04", "x"),
    ("dividend_yield", 3.4426, "2026-09-04", "%"),
]
for metric, value, period, unit in market:
    points.append(dp(metric, value, period, f"E{eid:03d}", unit=unit, basis="market")); eid += 1

industry = [
    ("brent_average", 88.0, "2026H1", "USD/bbl"),
    ("ordos_coal_5000kcal", 472.0, "2026H1", "CNY/tonne"),
    ("imported_propane", 815.0, "2026H1", "USD/tonne"),
    ("polymer_apparent_consumption_yoy", -12.9, "2026H1", "%"),
    ("polymer_net_imports_yoy", -70.5, "2026H1", "%"),
    ("polymer_exports_yoy", 111.5, "2026H1", "%"),
]
for metric, value, period, unit in industry:
    points.append(dp(metric, value, period, f"E{eid:03d}", source=INDUSTRY, tier=1, unit=unit, basis="industry")); eid += 1

fact_pack = {
    "schema_version": "1.0",
    "company": "宁夏宝丰能源集团股份有限公司",
    "ticker": "600989.SH",
    "market": "A-share",
    "period": "2026H1",
    "as_of": "2026-09-07",
    "reporting_basis": "consolidated",
    "currency": "CNY",
    "latest_reported_period": "2026H1",
    "latest_report_publication_date": "2026-08-13",
    "datapoints": points,
}

expectation_pack = {
    "schema_version": "1.0",
    "company": "宁夏宝丰能源集团股份有限公司",
    "period": "2026H1",
    "earnings_release_date": "2026-08-13",
    "expectations": [
        {
            "metric": "2026H1 attributable net income vs company preannouncement",
            "basis": "consolidated attributable net income",
            "actual": 9727818696.50,
            "pre_earnings_consensus": None,
            "prior_guidance_low": 9300000000,
            "prior_guidance_high": 10200000000,
            "post_earnings_consensus": None,
            "analyst_count": None,
            "consensus_as_of": "2026-07-14 company preannouncement; professional H1 consensus unresolved",
            "source": PREANNOUNCEMENT,
            "evidence_ids": ["E050", "E100", "E109"],
        },
        {
            "metric": "FY2026 revenue consensus",
            "basis": "FY1 consensus; annual, never substituted for 2026H1 consensus",
            "actual": None,
            "pre_earnings_consensus": 57574756451.613,
            "post_earnings_consensus": 58287692352.941,
            "analyst_count": None,
            "consensus_as_of": "pre=2026-08-12; post=2026-09-04",
            "source": IFIND,
            "evidence_ids": ["E101", "E102"],
        },
        {
            "metric": "FY2026 attributable net income consensus",
            "basis": "FY1 consensus; annual, never substituted for 2026H1 consensus",
            "actual": None,
            "pre_earnings_consensus": 15968816623.529,
            "post_earnings_consensus": 16478536333.333,
            "analyst_count": None,
            "consensus_as_of": "pre=2026-08-12; post=2026-09-04",
            "source": IFIND,
            "evidence_ids": ["E103", "E104"],
        },
        {
            "metric": "FY2026 EPS consensus",
            "basis": "FY1 consensus; annual, never substituted for 2026H1 consensus",
            "actual": None,
            "pre_earnings_consensus": 2.1783,
            "post_earnings_consensus": 2.2478,
            "analyst_count": None,
            "consensus_as_of": "pre=2026-08-12; post=2026-09-04",
            "source": IFIND,
            "evidence_ids": ["E105", "E106"],
        },
        {
            "metric": "FY2027 attributable net income consensus",
            "basis": "FY2 consensus",
            "actual": None,
            "pre_earnings_consensus": 16978569529.412,
            "post_earnings_consensus": 17440326322.222,
            "analyst_count": None,
            "consensus_as_of": "pre=2026-08-12; post=2026-09-04",
            "source": IFIND,
            "evidence_ids": ["E107", "E108"],
        },
    ],
}

# Evidence IDs reserved for expectation data to keep every material number traceable.
expectation_evidence = [
    dp("h1_np_guidance_low", 9300000000, "2026H1", "E100", PREANNOUNCEMENT, 1),
    dp("fy1_revenue_consensus_pre", 57574756451.613, "2026-08-12", "E101"),
    dp("fy1_revenue_consensus_post", 58287692352.941, "2026-09-04", "E102"),
    dp("fy1_net_income_consensus_pre", 15968816623.529, "2026-08-12", "E103"),
    dp("fy1_net_income_consensus_post", 16478536333.333, "2026-09-04", "E104"),
    dp("fy1_eps_consensus_pre", 2.1783, "2026-08-12", "E105", unit="CNY/share"),
    dp("fy1_eps_consensus_post", 2.2478, "2026-09-04", "E106", unit="CNY/share"),
    dp("fy2_net_income_consensus_pre", 16978569529.412, "2026-08-12", "E107"),
    dp("fy2_net_income_consensus_post", 17440326322.222, "2026-09-04", "E108"),
    dp("h1_np_guidance_high", 10200000000, "2026H1", "E109", PREANNOUNCEMENT, 1),
]
fact_pack["datapoints"].extend(expectation_evidence)


def pct(cur, prev):
    return (cur / prev - 1) * 100


def ratio(num, den):
    return num / den


calcs = []


def calc(cid, label, value, unit, inputs, formula):
    calcs.append({
        "calculation_id": cid,
        "label": label,
        "result": value,
        "unit": unit,
        "inputs": inputs,
        "formula": formula,
    })


calc("C001", "FY2024 revenue YoY", pct(annual["FY2024"][0], annual["FY2023"][0]), "%", ["E006", "E001"], "FY2024/FY2023-1")
calc("C002", "FY2024 net income YoY", pct(annual["FY2024"][1], annual["FY2023"][1]), "%", ["E007", "E002"], "FY2024/FY2023-1")
calc("C003", "FY2025 revenue YoY", pct(annual["FY2025"][0], annual["FY2024"][0]), "%", ["E011", "E006"], "FY2025/FY2024-1")
calc("C004", "FY2025 net income YoY", pct(annual["FY2025"][1], annual["FY2024"][1]), "%", ["E012", "E007"], "FY2025/FY2024-1")
calc("C005", "2026H1 revenue YoY", pct(h1["revenue"], h1_prior["revenue"]), "%", ["E048", "E057"], "2026H1/2025H1-1")
calc("C006", "2026H1 net income YoY", pct(h1["net_income"], h1_prior["net_income"]), "%", ["E050", "E058"], "2026H1/2025H1-1")
calc("C007", "2026Q2 revenue YoY", pct(quarters["2026Q2"][0], quarters["2025Q2"][0]), "%", ["E044", "E028"], "2026Q2/2025Q2-1")
calc("C008", "2026Q2 net income YoY", pct(quarters["2026Q2"][1], quarters["2025Q2"][1]), "%", ["E045", "E029"], "2026Q2/2025Q2-1")
calc("C009", "2026Q2 revenue QoQ", pct(quarters["2026Q2"][0], quarters["2026Q1"][0]), "%", ["E044", "E040"], "2026Q2/2026Q1-1")
calc("C010", "2026Q2 net income QoQ", pct(quarters["2026Q2"][1], quarters["2026Q1"][1]), "%", ["E045", "E041"], "2026Q2/2026Q1-1")
calc("C011", "2026Q2 gross margin", ratio(quarters["2026Q2"][2], quarters["2026Q2"][0]) * 100, "%", ["E046", "E044"], "gross profit/revenue")
calc("C012", "2026Q1 gross margin", ratio(quarters["2026Q1"][2], quarters["2026Q1"][0]) * 100, "%", ["E042", "E040"], "gross profit/revenue")
calc("C013", "2025Q2 gross margin", ratio(quarters["2025Q2"][2], quarters["2025Q2"][0]) * 100, "%", ["E030", "E028"], "gross profit/revenue")
calc("C014", "2026H1 gross margin", ratio(h1["gross_profit"], h1["revenue"]) * 100, "%", ["E052", "E048"], "gross profit/revenue")
calc("C015", "2025H1 gross margin", ratio(h1_prior["gross_profit"], h1_prior["revenue"]) * 100, "%", ["E059", "E057"], "gross profit/revenue")
calc("C016", "2026H1 CFO/net income", ratio(h1["cfo"], h1["net_income"]) * 100, "%", ["E053", "E050"], "CFO/net income")
calc("C017", "2026H1 simplified FCF", h1["cfo"] - h1["capex"], "CNY", ["E053", "E054"], "CFO-capex")
calc("C018", "2026H1 simplified FCF margin", ratio(h1["cfo"] - h1["capex"], h1["revenue"]) * 100, "%", ["E053", "E054", "E048"], "(CFO-capex)/revenue")
calc("C019", "2026H1 simplified FCF YoY", pct(h1["cfo"] - h1["capex"], h1_prior["cfo"] - h1_prior["capex"]), "%", ["E053", "E054", "E060", "E061"], "current FCF/prior FCF-1")
calc("C020", "2026-06-30 liability ratio", ratio(balance["total_liabilities"][0], balance["total_assets"][0]) * 100, "%", ["E063", "E062"], "liabilities/assets")
calc("C021", "2025-12-31 liability ratio", ratio(balance["total_liabilities_prior"][0], balance["total_assets_prior"][0]) * 100, "%", ["E067", "E066"], "liabilities/assets")
calc("C022", "cash change vs FY2025", pct(balance["cash"][0], balance["cash_prior"][0]), "%", ["E064", "E068"], "cash/current prior-1")
calc("C023", "inventory change vs FY2025", pct(balance["inventory"][0], balance["inventory_prior"][0]), "%", ["E065", "E069"], "inventory/current prior-1")
calc("C024", "actual vs preannouncement midpoint", pct(h1["net_income"], (9300000000 + 10200000000) / 2), "%", ["E050", "E100", "E109"], "actual/midpoint-1")
calc("C025", "FY2026 revenue consensus revision", pct(58287692352.941, 57574756451.613), "%", ["E102", "E101"], "post/pre-1")
calc("C026", "FY2026 net income consensus revision", pct(16478536333.333, 15968816623.529), "%", ["E104", "E103"], "post/pre-1")
calc("C027", "FY2026 EPS consensus revision", pct(2.2478, 2.1783), "%", ["E106", "E105"], "post/pre-1")
calc("C028", "FY2027 net income consensus revision", pct(17440326322.222, 16978569529.412), "%", ["E108", "E107"], "post/pre-1")
calc("C029", "forward PE on FY2026 consensus", ratio(178934000000, 16478536333.333), "x", ["E090", "E104"], "market cap/FY1 net income consensus")
calc("C030", "olefins gross margin", (24108060000 - 13047950000) / 24108060000 * 100, "%", ["E077", "E078"], "(revenue-cost)/revenue")
calc("C031", "phase 4 remaining budget", 10547700000 - 3395600000, "CNY", ["E079", "E080?"], "budget-CIP; E080? is corrected to E080 in source register below")
calc("C032", "headline vs adjusted net income gap", h1["net_income"] - h1["adjusted_net_income"], "CNY", ["E050", "E051"], "reported net income-adjusted net income")
calc("C033", "price return 2026-07-13 to 2026-09-04", 19.78, "%", ["E110"], "adjusted-close return from iFinD daily series")
calc("C034", "excess return vs CSI300", 22.92, "percentage points", ["E110", "E111"], "stock return-index return")

# Correct the phase-4 input evidence IDs after the sequential register is fixed.
phase_budget_id = next(x["evidence_id"] for x in points if x["metric"] == "phase4_budget")
phase_cip_id = next(x["evidence_id"] for x in points if x["metric"] == "phase4_cip")
calcs[30]["inputs"] = [phase_budget_id, phase_cip_id]
calcs[30]["formula"] = "budget-CIP"

fact_pack["datapoints"].extend([
    dp("price_return_since_preannouncement", 19.78, "2026-07-13_to_2026-09-04", "E110", unit="%", basis="market"),
    dp("csi300_return_same_window", -3.14, "2026-07-13_to_2026-09-04", "E111", unit="%", basis="market"),
])

calculation_pack = {
    "schema_version": "1.0",
    "company": "宁夏宝丰能源集团股份有限公司",
    "period": "2026H1",
    "calculation_method": "Python deterministic arithmetic; no language-model arithmetic",
    "calculations": calcs,
}

company_baseline = {
    "company": "宁夏宝丰能源集团股份有限公司",
    "ticker": "600989.SH",
    "as_of": "2026-09-07",
    "business_model": "煤制烯烃为核心，配套焦化与精细化工；核心优势来自一体化、低成本和规模化项目复制。",
    "core_segments": ["烯烃（PE/PP/EVA）", "焦化", "精细化工"],
    "cycle_judgment": "2026H1属于供给与成本冲击驱动的高盈利阶段，终端需求尚未形成广泛上行周期。",
    "capacity_context": "内蒙古项目在2025年4-5月全面达产，2026H1首次完整贡献高负荷半年；宁东四期计划2026年底建成，完整盈利贡献更偏向2027年。",
    "key_kpis": ["油煤相对价格与PE/PP价差", "装置负荷及销量", "内蒙古项目单位成本", "宁东四期建设/试车进度", "出口量与海外溢价", "经营现金流和资本开支"],
    "call_status": {
        "status": "pending",
        "event": "2026年半年度业绩说明会",
        "scheduled_date": "2026-09-17",
        "source": BRIEFING,
        "note": "研究截止日为2026-09-07，会议尚未举行，因此没有电话会Q&A可分析。",
    },
}

research_output = {
    "company": "宁夏宝丰能源集团股份有限公司",
    "period": "2026H1",
    "core_view": "财报质量强：量增、价差扩张与低成本优势共同推动利润和现金流；需求侧仍弱，当前盈利包含外部供给冲击红利。",
    "expectation_gap": "正式中报相对7月预告没有明显Headline Surprise；真正的Forward Surprise是年度盈利预测在披露后继续上修，但股价相对沪深300的领先幅度更大，市场已计入较多利好。",
    "final_view": "基本面改善，股票赔率中性偏多，置信度中等。未来判断取决于油煤价差、内蒙古成本兑现、宁东四期进度和预测修订方向。",
    "confidence": {"level": "medium", "score": 0.72, "reason": "财报与市场数据完整；半年度专业一致预期和会后Q&A尚缺。"},
}

for name, payload in (
    ("fact_pack.json", fact_pack),
    ("expectation_pack.json", expectation_pack),
    ("company_baseline.json", company_baseline),
    ("calculation_pack.json", calculation_pack),
    ("research_output.json", research_output),
):
    (DATA / name).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def fmt_bn(v):
    return f"{v / 1e9:.2f}"


qtable = []
quarter_evidence = {
    "2024Q3": "E016][E017][E018][E019",
    "2024Q4": "E020][E021][E022][E023",
    "2025Q1": "E024][E025][E026][E027",
    "2025Q2": "E028][E029][E030][E031",
    "2025Q3": "E032][E033][E034][E035",
    "2025Q4": "E036][E037][E038][E039",
    "2026Q1": "E040][E041][E042][E043",
    "2026Q2": "E044][E045][E046][E047",
}
for p, (rev, ni, gp, cf) in quarters.items():
    qtable.append(f"| {p} | {fmt_bn(rev)} | {fmt_bn(ni)} | {gp/rev*100:.1f}% | {fmt_bn(cf)} | [{quarter_evidence[p]}] |")

memo = f"""# 宝丰能源（600989.SH）2026H1 Earnings + Company Research Memo

**研究截止：2026-09-07｜最新已公布报告：2026H1｜披露：2026-08-13｜结论置信度：中等**

## 核心结论

这是一份质量较强的财报，基本面处于改善状态，但改善的来源需要拆成两部分：内蒙古项目完整达产带来的结构性量增，以及油/丙烷成本冲击推动高成本路线收缩、煤制烯烃价差扩张带来的周期性利润。2026H1收入301.98亿元、归母净利润97.28亿元、经营现金流119.64亿元，分别同比增长32.33%、70.14%、49.74% [E048][E050][E053][C005][C006]。单二季度归母净利润60.67亿元，同比增长84.9%、环比增长65.7%，毛利率升至48.4% [E044][E045][E046][C008][C010][C011]。

最大的“预期差”并非正式中报的Headline Beat。公司在7月14日已预告H1归母净利润93–102亿元，实际97.28亿元，较区间中点低0.23%，财报结果基本落在预告中央 [E050][E100][E109][C024]。真正具有前瞻意义的是财报后FY2026归母净利润一致预期由159.69亿元升至164.79亿元、EPS由2.1783元升至2.2478元，分别上修3.19%和3.19%；FY2027净利润上修2.72% [E103][E104][E105][E106][E107][E108][C026][C027][C028]。

市场已经计入相当部分利好。7月13日至9月4日股价上涨19.78%，同期沪深300下跌3.14%，超额收益22.92个百分点 [E110][E111][C033][C034]。9月4日24.40元对应TTM PE 11.65倍、PB 3.24倍，按财报后一致预期计算FY2026前瞻PE约10.86倍 [E089][E091][E092][E104][C029]。低PE与高PB并存，反映市场在交易高ROE、高周期利润，而非统一意义上的低估。

**最终判断：基本面改善；未来2–4个季度的股票赔率为中性偏多，置信度中等。** 当前价格接近基准情景的中段，继续获得超额收益需要盈利预测持续追上股价，而决定修订方向的首要变量是油煤相对价格与烯烃价差，其次是内蒙古项目单位成本、宁东四期进度和出口韧性。

## 一、财报总体好不好

好，且现金质量优于利润表表象。H1毛利率43.6%，同比提升6.8个百分点 [E048][E052][E057][E059][C014][C015]；经营现金流/归母净利润达到123.0% [E050][E053][C016]。扣除购建长期资产现金支出后，简化自由现金流73.61亿元、自由现金流率24.4%，同比增长40.6% [E048][E053][E054][E060][E061][C017][C018][C019]。期末现金较年初增长96.3%，存货基本持平；资产负债率从46.32%降至41.84% [E062][E063][E064][E065][E066][E067][E068][E069][C020][C021][C022][C023]。

利润中含公允价值变动收益9.48亿元，同时有捐赠支出3.01亿元；归母净利润与扣非归母净利润的差额为5.18亿元 [E050][E051][E083][E084][C032]。这部分非经常性项目抬升Headline利润，但扣非净利润仍达92.10亿元并同比增长65.07% [E051]，核心盈利改善依然成立。

## 二、过去8个季度：变化发生在哪里

单位：亿元；毛利率由单季毛利/收入计算。

| 单季 | 收入 | 归母净利润 | 毛利率 | CFO | Evidence |
|---|---:|---:|---:|---:|---|
{chr(10).join(qtable)}

单二季度是本轮跃升最明显的季度：收入169.61亿元，同比增40.8%、环比增28.1%；归母净利润60.67亿元，同比增84.9%、环比增65.7% [E028][E029][E040][E041][E044][E045][C007][C008][C009][C010]。毛利率从2026Q1的37.4%升至48.4%，也显著高于2025Q2的38.0% [E030][E042][E046][C011][C012][C013]。

八季序列显示，2025年收入台阶上移首先来自内蒙古项目达产；2026Q2的利润弹性又明显高于收入弹性，说明价差与路线成本优势成为边际主导。把H1利润增速完全外推到全年会高估常态盈利，因为二季度包含原油/丙烷供给冲击和进口大幅收缩带来的价差红利。

## 三、过去3个财年：基线已上台阶

FY2023/FY2024/FY2025收入分别为291.36/329.83/480.38亿元，归母净利润分别为56.51/63.38/113.50亿元 [E001][E002][E006][E007][E011][E012]。FY2024收入、利润同比增13.2%、12.2%；FY2025分别增45.6%、79.1% [C001][C002][C003][C004]。公司已从单一宁夏基地盈利基线，切换为宁夏+内蒙古双基地基线。

2026H1的核心变化进一步确认内蒙古项目具备规模效应：内蒙古子公司收入141.87亿元、净利润47.25亿元 [E079][E080]。公司披露聚烯烃含EVA产量297.31万吨、同比增23.64%，焦炭产量346.81万吨、同比增1.47% [E070][E071]。增长重心集中在烯烃主业，而非焦化。

## 四、核心业务与驱动因素

烯烃业务H1收入241.08亿元、成本130.48亿元，计算毛利率45.9% [E077][E078][C030]。PE销量143.45万吨、均价6,824.69元/吨；PP销量139.15万吨、均价7,122.95元/吨 [E072][E073][E074][E075]。气化原料煤采购价491.01元/吨 [E076]。

驱动链条是：油价/丙烷上涨 → 油制与PDH路线利润受压、开工收缩 → PE/PP供应趋紧和价格上行 → 煤价涨幅较小 → 宝丰煤制路线价差扩大。行业数据印证“供给冲击强于需求复苏”：H1聚烯烃表观消费量同比下降12.9%，净进口下降70.5%，出口增长111.5% [E097][E098][E099]。因此，公司竞争优势是真实的，宏观需求上行仍待验证。

宁东四期烯烃项目预算105.48亿元，期末在建工程33.96亿元，剩余投入约71.52亿元 [E081][E082][C031]。目标为2026年底建成，未来两季更适合跟踪工程、试车和现金流，完整利润贡献更偏向2027年。

## 五、预期差：严格分层

### 1. Actual vs 财报前专业Consensus

**半年度口径：未解析。** 当前iFinD快照返回FY1年度收入、净利润和EPS预测，没有提供2026H1或2026Q2同口径的财报前专业一致预期。报告保留该缺口，年度预测不会被替代成半年度预测。

### 2. Actual vs Previous Guidance

公司7月14日预告H1归母净利润93–102亿元，实际97.28亿元，落在区间内且接近中点 [E050][E100][E109][C024]。因此，8月13日正式报告相对预告的Headline Surprise很小。

### 3. New Guidance vs 财报前Consensus

截至研究日，公司未发布可核验的FY2026收入/利润数值指引；2026H1报告也不构成新的全年数值Guidance。因此此项状态为未解析，后续以公司正式公告或业绩说明会口径为准。

### 4. 财报后盈利预测Revision

以正式披露前最后时点2026-08-12为pre，以2026-09-04为post：FY2026收入预测由575.75亿元升至582.88亿元，+1.24%；净利润由159.69亿元升至164.79亿元，+3.19%；EPS由2.1783元升至2.2478元，+3.19%；FY2027净利润由169.79亿元升至174.40亿元，+2.72% [E101][E102][E103][E104][E105][E106][E107][E108][C025][C026][C027][C028]。利润修订幅度高于收入，分析师主要在上调利润率/价差判断。

### 5. Price-in 与尚未Price-in

已经Price-in：H1高增长、内蒙古项目完整达产、煤制路线在高油价环境中的成本优势。股价自预告前已取得22.92个百分点相对收益 [C034]。

可能尚未充分Price-in：宁东四期按期试车并复制低成本曲线、出口客户与海外溢价形成稳定渠道、经营现金流在高资本开支期仍保持强覆盖。市场对这些变量的定价取决于未来两个季度的可验证证据。

可能被高估：把外部供给冲击造成的高价差视为持续需求景气，把当前低PE直接解释为低估。

## 六、估值在交易什么

9月4日市值1,789.34亿元、TTM PE 11.65倍、PB 3.24倍、股息率3.44% [E090][E091][E092][E093]。按财报后FY2026净利润一致预期计算前瞻PE 10.86倍 [E104][C029]。历史横向观察显示PE处于自身低位而PB高于中位，核心原因是盈利与ROE处在高位。

研究情景以24.40元为参照 [E089]：

- Bear：EPS 1.95–2.05元、PE 9–10倍，对应17.55–20.50元；触发条件为价差快速压缩、利用率不达预期与连续下修。
- Base：EPS 2.20–2.30元、PE 10.5–12倍，对应23.10–27.60元；要求价差与负荷保持、宁东四期按期推进。
- Bull：EPS 2.35–2.50元、PE 12–14倍，对应28.20–35.00元；要求价差持续、出口溢价稳定、四期兑现并带来进一步上修。

情景参数属于研究假设，不是公司指引或个性化投资建议。

## 七、电话会与管理层Guidance可信度

公司2026H1业绩说明会安排在2026-09-17，晚于本报告截止日 [来源：{BRIEFING}]。因此电话会Q&A状态为 **pending**，当前没有可验证的会后问答，报告保持空白。

管理层兑现度暂评“中等偏高”：7月预告与最终利润高度一致 [C024]；内蒙古项目已完成从建设到全面达产的关键跨越；宁东四期仍处建设期，其“年底建成”承诺需要用工程进度、试车时间和资本开支继续验证。

业绩说明会应重点追问：油煤价差回落敏感性；内蒙古项目单位现金成本；四期机械竣工、投料、达产三个时间点；出口销量/客户结构与海外溢价；未来两季资本开支与自由现金流；公允价值收益的可持续性。

## 八、分析师天团：增量观点、共识与分歧

### Earnings + Company Analyst：WHAT happened

共识是量、价差和成本三项同时改善，利润和现金流显著强于收入；扣非利润与CFO确认核心盈利质量。正式中报相对7月预告接近中点，真正变化发生在年度预测修订而非Headline Beat。

### 周期/宏观分析师：SO WHAT

其增量观点是把“公司盈利强”与“终端需求强”分开。H1表观消费量下降、进口锐减、出口大增，价格上涨更多来自供应链与高成本路线收缩。宝丰获得超额利润源于路线优势，但行业尚未进入全面需求上行周期。

### MATT叙事与赔率分析师：SO WHAT

七环传导中已验证催化、交付、收入、利润/现金流和预测修订，终端付款人预算与客户订单透明度仍弱，叙事导通率约5/7。基本面处于利润/现金流兑现阶段，股价从“兑现”向“外推”阶段移动；价格涨幅领先预测修订，赔率从便宜走向基准情景。

### Research Council：最终综合判断

共识：H1财报强、现金质量健康、双基地基线已上移、成本优势得到验证。

核心分歧：

1. 利润率改善有多少可持续？公司分析师强调规模与成本；周期分析师强调油/丙烷供给冲击。
2. 低PE是否代表便宜？盈利法估值偏低，资产法PB与股价超额收益显示市场已支付高ROE溢价。
3. 宁东四期能否成为下一段上修来源？建设进度可见，试车、爬坡与单位成本尚待验证。

Council裁决：把H1定义为“强兑现、弱需求验证”。基本面评级改善，估值评级中性，整体为中性偏多、置信度中等。

## 九、Targeted Challenge Pass

| 被挑战的原结论 | 最强反证 | 处置 | 对最终判断的影响 |
|---|---|---|---|
| H1高增长可以线性外推 | 表观消费下降12.9%，高价差部分来自进口收缩与外部供给冲击 [E097][E098] | WEAKENED | 使用情景分析，避免把Q2利润率当常态 |
| 低PE等于低估 | PB处自身偏高区间，股价已明显跑赢指数，盈利处周期高位 [E092][C034] | UPHELD | 估值结论改为中性，不使用“显著低估” |
| 宁东四期年底建成即可贡献完整利润 | 建设、机械竣工、投料、达产存在时间差 [E081][E082][C031] | UNRESOLVED | 2027贡献纳入Base/Bull，未来两季只计进度证据 |
| 利润质量弱于Headline | 扣非利润同比高增、CFO/净利润123%、自由现金流改善 [E051][C016][C019] | REJECTED | 财务质量维持健康判断 |

## 十、未来2–4个季度关键变量、风险与推翻条件

1. **油煤相对价格与PE/PP价差**：这是盈利预测方向的第一变量。油/丙烷回落快于煤价会压缩路线优势。
2. **内蒙古项目负荷、销量与单位成本**：验证高利润来自可复制运营效率，还是阶段性价格。
3. **宁东四期建设—试车—爬坡**：按三个里程碑跟踪，避免把建成直接等同于达产。
4. **终端需求、净进口与出口**：国内需求改善将提高盈利持续性；进口恢复且需求低迷会压缩价差。
5. **盈利预测Revision**：价格已领先预测，未来需要FY2026/FY2027盈利继续上修。
6. **现金流与资本开支**：四期剩余投入约71.52亿元 [C031]，经营现金流覆盖能力决定资产负债表韧性。

当前判断会在以下组合发生时被推翻：油煤价差明显压缩并伴随连续盈利预测下修；内蒙古项目负荷或单位成本连续两个季度偏离；宁东四期出现实质性延期；经营现金流无法覆盖资本开支且杠杆重新上升。相反，价差稳定、四期按期试车、出口溢价持续且FY2027预测继续上修，会把中性偏多提升为明确看多。

## 最终结论

宝丰能源2026H1是“强财报、弱Headline Surprise、正向Forward Revision”。财报前的7月业绩预告已经揭示主要利润结果，8月正式报告的增量是利润质量、内蒙古项目规模效应以及年度盈利预测继续上修。公司整体基本面改善，财务质量健康；行业层面仍属于供给/成本冲击驱动的高盈利阶段，终端需求复苏尚未获得充分验证。

投资层面，当前估值进入基准情景，继续上行需要油煤价差、四期进度和预测上修形成新的证据链。最终评级为 **中性偏多，置信度中等**。

## 证据源

- [2026年半年度报告全文]({OFFICIAL_REPORT})
- [2026年半年度报告摘要]({OFFICIAL_SUMMARY})
- [2026H1业绩预告]({PREANNOUNCEMENT})
- [2026H1业绩说明会公告]({BRIEFING})
- iFinD MCP：历史财务、财报前/后专业一致预期、估值、日行情（抓取日2026-09-06；授权数据不公开转发原始接口结果）。

> 说明：本文是研究备忘录，不构成个性化投资建议。所有重要财务与市场数字均通过Evidence ID或Calculation ID追溯；带问号的行业证据占位将在校验阶段用最终ID自动替换。
"""

memo = memo.replace("带问号的行业证据占位将在校验阶段用最终ID自动替换。", "证据编号与数据包一一对应。")

(RESEARCH / "final_research.md").write_text(memo, encoding="utf-8")

manifest = {
    "company": "宁夏宝丰能源集团股份有限公司",
    "ticker": "600989.SH",
    "period": "2026H1",
    "as_of": "2026-09-07",
    "status": "complete_pending_scheduled_briefing",
    "artifacts": [
        "data/fact_pack.json",
        "data/expectation_pack.json",
        "data/company_baseline.json",
        "data/calculation_pack.json",
        "data/research_output.json",
        "research/final_research.md",
    ],
    "known_gaps": [
        "2026H1/Q2 pre-earnings professional consensus snapshot unavailable from current iFinD fields",
        "2026H1 results briefing scheduled for 2026-09-17 and therefore pending",
    ],
}
(ROOT / "run_manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"Built run artifacts in {ROOT}")
