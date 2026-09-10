---
name: earnings-analysis
description: Analyze a public company's latest or specified financial report from one natural-language request. Automatically retrieve official filings and licensed market data, verify reported facts, compare results and guidance against pre-earnings professional consensus, identify expectation gaps, analyze the company's business/industry/valuation context, synthesize relevant Analyst TianTuan views, and produce a rigorous PPT-ready research report. Use iFinD MCP as the preferred China/HK/consensus/valuation source and EdgarTools/SEC as the preferred US official-filing source. PPT generation is optional and only triggered when explicitly requested.
---

# Earnings & Company Research Skill

## 1. User experience

The default interaction should be as simple as:

```text
分析一下英伟达最新一季财报。
```

or:

```text
看看贵州茅台这次中报有什么预期差，顺便分析一下公司现在的情况。
```

The system should infer the company and latest available reporting period when possible, then automatically run the research workflow.

Default output:

```text
rigorous research report
```

Optional output, only when explicitly requested:

```text
PPT / SlideSpec
```

No video or voice generation.

Canonical integration output:

```text
RESEARCH_ARTIFACT.json (schema 1.0.0)
```

Generate it from completed run packs with `scripts/export_research_artifact.py`. Renderers consume this file and preserve its facts, sources, quality flags and provenance. PPT generation uses the PPT Factory Research Artifact endpoint and performs no additional research.

---

# 2. Core workflow

Keep the architecture lean:

```text
User Request
    ↓
Company / Period Resolver
    ↓
Data Router
    ↓
Fact Pack + Expectation Pack + Company Baseline
    ↓
Integrity & Calculation Gate
    ↓
Earnings + Company Analyst
    ↓
Relevant Analyst TianTuan
    ↓
Research Council + Targeted Challenge
    ↓
PPT-ready Research Memo
    ↓
Optional SlideSpec / PPT
```

Do not create extra standing agents when a deterministic script or structured checklist can do the job.

---

# 3. Capability discovery

Before hard-coding integrations, inspect the current Codex project and available MCP/tools.

Discover:

```text
iFinD MCP
EdgarTools / SEC access
existing Analyst TianTuan skill
existing PPT / presentation skill
```

Do not assume exact filenames or iFinD function names.

If iFinD is present:
- inspect its tool schemas;
- map actual tool names into `config/ifind_tool_map.json`;
- apply every `field_controls` rule in that map before accepting a reported metric;
- retain the exact field name, parameters, as-of date and returned reporting basis in the Evidence record;
- never invent an MCP function name.

If an existing Analyst TianTuan or PPT skill is present, reuse it rather than building another one.

---

# 4. Data routing

## China / Hong Kong / Chinese market context

Preferred structured provider:

```text
iFinD MCP
```

Use for:
- financial statements
- historical quarterly/annual data
- consensus estimates
- estimate revisions
- valuation
- stock price / market cap
- peer data
- industry data
- business KPIs when available

## US companies

Official reported facts:

```text
SEC / EdgarTools
```

Use for:
- 10-K
- 10-Q
- 8-K
- XBRL
- MD&A
- risk factors
- segment reporting

Use iFinD for consensus, valuation and analyst estimates if available.

## Narrative sources

Use official filings / IR materials / earnings-call transcripts for:
- management guidance
- management language
- business KPIs
- segment detail
- accounting footnotes
- risk changes
- Q&A analysis

Do not OCR a reported number if a reliable structured official source already provides it.

---

# 5. Build three research packs

The system should normalize inputs into three packs.

## 5.1 Fact Pack

Contains what the company actually reported:

```text
revenue
gross profit / margin
operating profit / margin
net income
EPS
CFO
FCF
capex
cash / debt
working capital
segment data
company-specific KPIs
guidance
```

Every material datapoint carries:

```text
metric
value
unit
currency
period
basis
source
source_tier
evidence_id
```

## 5.2 Expectation Pack

This is mandatory for expectation-gap analysis.

Contains:

```text
pre-earnings consensus
prior company guidance
post-earnings new guidance
post-earnings estimate revisions, if available
valuation / market expectations
```

## 5.3 Company Baseline Pack

Use enough history to prevent overreacting to one quarter.

Default history:

```text
last 8 quarters
+
last 3 fiscal years
```

Include:
- revenue growth trend
- margin trend
- cash-flow trend
- segment mix
- capex trend
- balance-sheet trend
- key KPI history
- valuation history where available
- key peer benchmarks

---

# 6. Expectation Snapshot Rule — non-negotiable

A correct surprise analysis must compare results with expectations that existed **before** the earnings release.

Preferred comparison timestamp:

```text
latest consensus snapshot available before the earnings release timestamp
```

Do not compare actual results against a consensus already revised after the print and call that a beat/miss.

Every consensus datapoint should include:

```text
consensus_as_of
source
metric_basis
```

Example:

```yaml
metric: adjusted_eps
actual: 1.24
consensus: 1.18
consensus_as_of: 2026-08-26
earnings_release_date: 2026-08-27
```

If historical pre-earnings consensus is unavailable:
- say so explicitly;
- do not fabricate a beat/miss;
- use prior guidance and other verified pre-release expectations as secondary anchors.

---

# 7. Match accounting bases before comparing

Never compare unlike metrics.

Examples:

```text
GAAP EPS vs GAAP consensus
Adjusted EPS vs adjusted consensus
reported revenue vs reported revenue consensus
constant-currency growth vs constant-currency expectation
```

If the basis is ambiguous:

```text
expectation_comparison_status = unresolved
```

Do not force a numerical surprise.

---

# 8. Deterministic calculations

Use Python for arithmetic.

Required calculations when inputs exist:

```text
YoY / QoQ
margin change
CFO growth
FCF margin
receivable growth
inventory growth
cash conversion
capex growth
actual vs consensus
actual vs prior guidance
new guidance vs pre-earnings consensus
new guidance vs prior guidance
```

Create:

```text
calculation_pack.json
```

Do not use LLM mental arithmetic for material figures.

---

# 9. Data Integrity Gate

Run before any analytical conclusion.

Check:
- source
- period
- currency
- unit
- consolidated / standalone basis
- reporting period alignment
- stale data
- cross-source conflicts
- latest report status
- primary-source coverage

Priority for reported company facts:

```text
official filing
>
company release
>
iFinD structured record
>
secondary sources
```

For professional consensus / analyst estimates:

```text
iFinD preferred when available
```

If official filing and iFinD disagree on reported facts:
- do not average;
- investigate basis/period/unit;
- use official filing as source of record.

For China reported ROE and equity/net-assets:
- use the official consolidated filing definition by default;
- use an iFinD field only after it reconciles to the same consolidated scope and calculation definition;
- treat fields marked disabled in `config/ifind_tool_map.json` as unavailable until their mapping is verified.

---

# 10. Sector & situation routing

Before applying metrics, identify:

```text
sector
subsector
business model
situation
```

Examples of situation:

```text
normal compounder
cyclical
high growth
turnaround
bank
insurer
resource company
holdco
recent IPO
```

Load `references/SECTOR_PLAYBOOKS.md`.

Do not apply generic industrial ratios to banks, insurers or resource businesses mechanically.

---

# 11. Earnings + Company Analyst

Use one primary analytical workflow.

It should answer two questions:

```text
A. What happened in this earnings report?
B. What does it mean for the company as a whole?
```

Analyze nine dimensions:

```text
1. Earnings Snapshot
2. Expectation Gap
3. Business / KPI
4. Earnings Quality
5. Guidance / Estimate Revision
6. Earnings Call Intelligence
7. Company & Industry Position
8. Valuation / Market Pricing
9. Key Variables / Risks
```

---

# 12. Earnings Snapshot

Summarize:

```text
what beat
what missed
what was in line
which changes are economically material
```

Do not mechanically use one universal surprise threshold.

A 1% revenue beat may be trivial for one company and meaningful for another.

Use:
- company history
- sector volatility
- consensus dispersion if available
- metric importance

---

# 13. Expectation Gap Engine — core output

The system must produce an explicit expectation-gap table.

At minimum:

| Layer | Compare | Question |
|---|---|---|
| Reported | Actual vs pre-earnings consensus | What surprised the Street? |
| Delivery | Actual vs prior company guidance | Did management over/under-deliver? |
| Forward | New guidance vs pre-earnings consensus | Are future estimates likely to move? |
| Revision | Post-print analyst revisions | Did professionals actually change forecasts? |
| Pricing | Result/guidance vs valuation/price reaction | Was the surprise already priced? |

Then identify:

```text
Headline Surprise
Fundamental Surprise
Forward Surprise
Hidden / Underappreciated Surprise
```

Do not assume the biggest headline beat is the most important expectation gap.

The most important expectation gap is:

> the new information most likely to change future earnings estimates, valuation framework, or the market's view of the business over the next 2–4 quarters.

---

# 14. Professional expectation analysis

When iFinD provides enough data, compare:

```text
consensus mean
median
high / low
analyst count
dispersion
revision direction
```

If historical estimates are available, track:

```text
30d / 60d / 90d estimate revisions
pre-print trend
post-print revisions
```

This helps distinguish:

```text
a real surprise
vs
a quarter where expectations had already moved before the print
```

Do not invent analyst dispersion or revisions if the source does not provide them.

---

# 15. Business / KPI analysis

Use sector-specific playbooks.

Ask:

```text
What operational variable actually drove the quarter?
Is growth price, volume, mix, users, units, capacity, or acquisition-driven?
Which KPI is leading the P&L?
Which KPI is deteriorating before it reaches the P&L?
```

For multi-segment companies:
- identify the segment driving incremental profit;
- distinguish revenue mix from profit mix;
- track segment margin where available.

---

# 16. Earnings Quality

Check:

```text
CFO vs net income
receivables vs revenue
inventory vs revenue
one-off gains
tax rate
non-GAAP adjustments
SBC
capitalized costs
accounting changes
working-capital movements
```

For Deep / Forensic analysis, add more advanced checks only when sector-appropriate.

Do not mechanically apply Beneish / Piotroski / Altman to sectors where the interpretation is inappropriate.

---

# 17. Guidance & Estimate Revision

Always build:

```text
Previous Guidance
→ Actual Delivery
→ New Guidance
→ Pre-earnings Consensus
→ Post-earnings Estimate Revision
```

This is the primary forward-looking bridge.

If analysts have not yet revised forecasts:

```text
post_earnings_revision = not_yet_available
```

Do not guess the revision.

---

# 18. Earnings Call Intelligence

If an earnings-call transcript is available, analyze:

```text
prepared remarks vs Q&A
CEO vs CFO tone
analyst question frequency
follow-up questions
management deflections
new topics
recurring topics
dropped topics
quarter-on-quarter language shifts
```

Prefer:

```text
specific → vague
direct → conditional
narrow range → wide range
clear visibility → monitoring
```

over simplistic positive/negative sentiment.

Use `references/EARNINGS_CALL_INTELLIGENCE.md`.

---

# 19. Management Credibility

If historical guidance exists, compare:

```text
what management said
vs
what later happened
```

Track:
- revenue
- margins
- capex
- product launches
- capacity
- cost reductions

Use this to weight current guidance.

Do not reduce credibility to an opaque score.

---

# 20. Company & Industry Position

The report must go beyond the quarter.

Analyze:

```text
business model
core growth engine
segment economics
competitive position
industry cycle
pricing power
capital intensity
reinvestment runway
balance-sheet strength
major structural risks
```

Use the Company Baseline Pack and relevant TianTuan specialists.

The goal is to explain:

> whether this quarter confirms, weakens, or changes the longer-term company thesis.

---

# 21. Valuation & Market Pricing

Use sector-appropriate valuation:

```text
PE
EV/EBITDA
PS
PB
DCF
SOTP
```

Prefer:
- historical valuation range
- peer range
- earnings sensitivity
- scenario range

over a single false-precision target price.

If post-earnings price reaction is available, it can be used as an overlay:

```text
company reaction
relative to index
relative to industry
```

Do not reverse-engineer the research conclusion from price action.

---

# 22. Analyst TianTuan

Preserve the user's existing Analyst TianTuan.

Do not retrain or rewrite all analysts into accounting analysts.

Separation:

```text
Earnings + Company Analyst
= WHAT happened and company fundamentals

Analyst TianTuan
= SO WHAT from specialist lenses
```

Dynamically call only relevant specialists.

Possible lenses:
- industry
- technology
- macro/rates
- cycle
- consumer/channel
- policy/regulation
- market strategy

Do not call every analyst by default.

Each TianTuan response should distinguish:

```text
Historical View
Framework Inference
Current Evidence
New Inference
Failure Conditions
```

---

# 23. Research Council

The Council synthesizes:

```text
Consensus
Disagreement
Unique Insight
Bull Case
Bear Case
Final Judge
```

Required output:

```yaml
consensus:
disagreements:
unique_insights:
bull_case:
bear_case:
biggest_expectation_gap:
critical_variables:
load_bearing_claims:
final_view:
confidence:
```

Confidence must be explained by:
- data coverage
- evidence quality
- consensus quality
- unresolved questions
- sensitivity
- management credibility
- analyst agreement

Never output unexplained "confidence = 8/10".

---

# 24. Targeted Challenge Pass

Challenge the 1–3 load-bearing claims that matter most.

Ask:

```text
If this claim is false, does the final view change?
What is the strongest counter-evidence?
Which single assumption most easily flips the conclusion?
```

Use dispositions:

```text
UPHELD
WEAKENED
REJECTED
UNRESOLVED
```

If a load-bearing claim is weakened/upheld against, revise the final view.

A challenge pass that can never change the conclusion is invalid.

---

# 25. Default research output — PPT-ready

The final research report should be rigorous but already structured for presentation.

Default sections:

```text
01 One-line View
02 Earnings vs Expectations
03 Biggest Expectation Gap
04 Business / KPI Drivers
05 Margin / Cash Flow / Earnings Quality
06 Guidance & Estimate Revisions
07 Earnings Call / Q&A
08 Company & Industry Position
09 Analyst TianTuan
10 Bull / Bear / Challenge
11 Valuation & Market Pricing
12 Key Variables / Catalysts / Risks
13 Final View
```

Every section starts with a decision-relevant headline, not a generic label.

Example:

Bad:
```text
毛利率分析
```

Better:
```text
毛利率压力仍在，但产品切换意味着最差阶段可能已经过去
```

This makes the research memo directly convertible into slides.

---

# 26. Evidence rules

Every material number must cite:

```text
Evidence ID
or
Calculation ID
```

Example:

```text
Revenue grew 32% YoY. [E014]
Gross margin declined 180bps QoQ. [C006]
```

Every claim should be tagged internally as one of:

```text
FACT
MANAGEMENT_GUIDANCE
CONSENSUS
ANALYST_INFERENCE
COUNCIL_JUDGMENT
```

This prevents opinions from being presented as facts.

---

# 27. PPT — optional

PPT is not part of the default run.

Only when the user explicitly says:

```text
生成 PPT
做成 PPT
做一份汇报
```

generate:

```text
presentation/slidespec.json
```

Then call the existing PPT / presentation skill.

PPT rules:
- one core message per slide;
- preserve Evidence IDs;
- never change the research conclusion;
- do not rediscover the thesis in the PPT renderer;
- charts should be generated from Fact/Calculation Pack.

Default slide sequence can mirror sections 01–13.

---

# 28. Quality gate before delivery

Before output:

```bash
python scripts/verify_data.py data/fact_pack.json
python scripts/lint_research.py research/final_research.md
```

Fix ERROR findings.

The final report must explicitly disclose:
- latest report period
- earnings release date
- research data cutoff
- consensus snapshot timestamp
- reporting basis
- currency/units
- unresolved data gaps

---

# 29. Cost policy

Default:

```yaml
allow_paid_provider: false
```

Priority:

```text
user-authorized iFinD
>
official free data
>
free/open-source tools
>
new paid APIs
```

Never silently add a new paid financial-data service.

---

# 30. Upgrade policy

Keep the system modular through four registries:

```text
Provider Registry
Skill Registry
Model Registry
Presentation Renderer Registry
```

New GitHub projects must pass:
1. real incremental value;
2. no duplicate capability;
3. license review;
4. paid-API review;
5. regression tests.

Do not install a project merely because it has many stars.

---

# 31. Regression set

Use at least:

```text
NVIDIA
贵州茅台
腾讯
招商银行
中芯国际
```

to test:
- US filing path
- A/H data path
- bank metrics
- consumer metrics
- internet metrics
- semiconductor metrics
- expectation-gap logic
- PPT-ready output structure

---

# 32. Core principle

The product is not:

```text
AI summarizes an earnings PDF
```

The product is:

> A research system that reconstructs what the market expected before the print, verifies what the company actually delivered, identifies which new information changes the forward earnings/valuation framework, and then places that quarter inside a broader company and industry thesis.

That is the definition of a useful earnings-research system.
