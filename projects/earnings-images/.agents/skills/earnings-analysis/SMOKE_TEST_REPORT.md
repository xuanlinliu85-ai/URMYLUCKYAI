# V1.5 Smoke Test Report

Run date: 2026-09-03

## US Test — NVIDIA

### Resolver and evidence

Resolved NVIDIA Corp. (`NASDAQ: NVDA`, CIK `1045810`) to FY2027 Q2, thirteen weeks ended 2026-07-26 and released 2026-08-26. Primary evidence:

- `E-NV-001`: [official earnings release](https://investor.nvidia.com/news/press-release-details/2026/NVIDIA-Announces-Financial-Results-for-Second-Quarter-Fiscal-2027/default.aspx)
- `E-NV-002`: [SEC 10-Q](https://www.sec.gov/Archives/edgar/data/1045810/000104581026000075/nvda-20260726.htm)
- `E-NV-003`: [prior-quarter release and Q2 guidance](https://investor.nvidia.com/news/press-release-details/2026/NVIDIA-Announces-Financial-Results-for-First-Quarter-Fiscal-2027/default.aspx)
- `E-NV-004`: [2026-08-24 pre-release Visible Alpha preview](https://www.spglobal.com/market-intelligence/en/news-insights/research/2026/08/nvidia-earnings-preview-q2-2027)
- `E-NV-006`: [officially hosted earnings-call transcript](https://investor.nvidia.com/files/content_files/TRANSCRIPT_-NVIDIA-Corp-NVDA-US-Q2-2027-Earnings-Call-26-August-2026-5_00-PM-ET.pdf)

### Result

- Revenue was USD 96.221bn, +17.9% QoQ and +106% YoY; GAAP gross margin was 75.0%; GAAP net income was USD 59.688bn; non-GAAP EPS was USD 2.22. [`E-NV-001`, `E-NV-002`]
- Data Center revenue was USD 89.0bn, +18% QoQ and +117% YoY. [`E-NV-001`]
- Pre-release revenue consensus was USD 92.2bn and Data Center consensus was USD 85.7bn. Actual beat those values by 4.36% and 3.85%. [`E-NV-004`; `C-NV-001`, `C-NV-002`]
- Prior Q2 revenue guidance midpoint was USD 91.0bn; actual exceeded it by 5.74%. [`E-NV-003`; `C-NV-004`]
- New Q3 revenue guidance was USD 108.0bn ±2%. [`E-NV-001`]
- The largest forward expectation gap was management's first FY2028 revenue-growth indication of about 70%, together with Rubin and ACIE demand expansion. [`E-NV-006`]
- Q2 cash conversion was the central challenge: derived CFO was USD 24.077bn, simplified FCF USD 21.400bn, CFO/GAAP net income 40.3%; accounts receivable rose 54.9% QoQ and inventory rose 22.4% QoQ versus revenue growth of 17.9%. [`E-NV-002`; `C-NV-008`]

Council view: fundamentally strong and forward-positive; the next two quarters must verify supply delivery, customer-financing quality and cash conversion. The Challenge weakened the claim that demand visibility alone makes FY2028 guidance fully de-risked.

Test status:

- company, period, official data, prior/new guidance, eight-quarter and three-year baseline: passed;
- pre-release revenue snapshot: passed;
- exact pre-release adjusted EPS, Q3/FY2028 historical snapshots and full post-release revision series: unresolved pending licensed snapshot coverage;
- relevant TianTuan, Council and Targeted Challenge: passed.

## China Test — 贵州茅台

### Resolver and evidence

Resolved 贵州茅台酒股份有限公司 (`600519.SH`) to 2026H1, ended 2026-06-30 and disclosed 2026-08-15. Primary evidence:

- `E-MT-001`: [2026H1 official report](https://static.cninfo.com.cn/finalpage/2026-08-15/1225475868.PDF)
- `E-MT-005`: [official earnings briefing](https://www.moutai.com.cn/mtgf/2026-08/21/article_2026082123484646519.html)
- `E-IF-001`: iFinD THS_ReportQuery and THS_BD 2026H1 snapshot
- `E-IF-002`: iFinD THS_BD 2025H1 comparable snapshot
- `E-IF-003`: iFinD FY1 forecast snapshot as of 2026-08-14
- `E-IF-004`: iFinD FY1 forecast snapshot as of 2026-09-02

### Result

- Revenue was CNY 90.703bn, +1.47% YoY; attributable net profit was CNY 44.517bn, -1.95%; basic EPS was CNY 35.57. [`E-MT-001`, `E-IF-001`]
- Gross profit was CNY 81.229bn and deterministic gross margin was 89.56%, down 1.74ppt YoY. [`E-IF-001`, `E-IF-002`; `C-MT-001`]
- Q2 revenue was CNY 36.794bn, -5.14% YoY; attributable net profit was CNY 17.274bn, -6.90%. [`E-MT-001`; `C-MT-008`, `C-MT-009`]
- i茅台 revenue was CNY 40.264bn, +274.18%; direct revenue was CNY 51.962bn, +29.91%; wholesale/agency revenue was CNY 38.697bn, -21.60%. [`E-MT-001`; `C-MT-004`–`C-MT-007`]
- Consolidated CFO was CNY 70.691bn, +438.84%, while sales receipts were CNY 98.422bn, +3.51%. The CFO increase was driven materially by finance-company deposit flows, so sales receipts provide the cleaner operating collection signal. [`E-MT-001`]
- Pre-release 2026H1/Q2 consensus was unavailable; quantitative period Beat/Miss remains unresolved.
- Comparable FY1 revenue consensus fell from CNY 179.653bn before release to CNY 177.695bn after release, -1.09%; FY1 attributable net-profit consensus fell from CNY 85.989bn to CNY 84.872bn, -1.30%. [`E-IF-003`, `E-IF-004`; `C-MT-016`, `C-MT-017`]

Council view: neutral-to-cautious. Channel reform has improved direct consumer reach, while its revenue mix and pricing effects have yet to convert into profit improvement. The Challenge reclassified i茅台 growth as channel-reach evidence rather than equal-sized incremental end demand and replaced headline consolidated CFO with operating collection evidence.

Test status:

- company, period, official filing, iFinD reported facts, eight-quarter and three-year baseline: passed;
- FY1 pre/post revision chain: passed;
- pre-release H1/Q2 consensus: unresolved;
- reported ROE and consolidated-equity iFinD fields: failed reconciliation and are now disabled in `config/ifind_tool_map.json`;
- relevant TianTuan, Council and Targeted Challenge: passed.

## Overall acceptance

The pipeline correctly resolved both companies and periods, routed US facts to SEC/IR and China facts to official filings plus iFinD, preserved consensus timestamp discipline, separated reported and calculated facts, invoked relevant analyst lenses, surfaced Council disagreement, and changed load-bearing conclusions through the Challenge pass.

The tests exposed three concrete next-use constraints: period-specific historical consensus coverage, complete post-print revision time series, and verified China ROE/consolidated-equity field definitions. These constraints are recorded as explicit unresolved or disabled states rather than inferred values.

