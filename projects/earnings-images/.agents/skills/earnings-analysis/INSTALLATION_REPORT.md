# Earnings & Company Research V1.5 — Installation Report

As of: 2026-09-03 (Asia/Shanghai)

## Status

- Installed as the project Baseline at `.agents/skills/earnings-company-research`.
- Codex skill discovery path is active through the project `.agents/skills` convention.
- `scripts/validate_bundle.py` passed.
- `scripts/preflight.py` passed with two environment notices: EdgarTools and optional `jsonschema` are absent.
- `examples/sample_fact_pack.json` passed `scripts/verify_data.py` with zero errors and zero warnings.
- `scripts/calc_metrics.py` produced deterministic calculations from the sample pack.

## iFinD MCP discovery

The live authorized MCP returned 19 tools:

`THS_BD`, `THS_DS`, `THS_HQ`, `THS_HF`, `THS_RQ`, `THS_SS`, `THS_EDB`, `THS_DR`, `THS_WCQuery`, `THS_ReportQuery`, `THS_Special_ShapePredict`, `THS_Special_StockLink`, `THS_realTimeValuation`, `THS_DateQuery`, `THS_DateOffset`, `lookup_field_reference`, `get_stock_list`, `get_price_change`, and `get_guide`.

The verified mapping is stored in `config/ifind_tool_map.json`. Current direct access uses the existing authorized client at `C:/Users/urmylucky/Documents/每日复盘更新/scripts/ifind-mcp-client.mjs` and reads `IFIND_API_KEY` from the environment.

Verified capabilities:

- canonical security lookup;
- filing and announcement discovery;
- reported financial statements and historical series;
- market prices and price changes;
- valuation fields;
- sector/index constituent data;
- economic database data;
- screening;
- FY1 revenue and net-profit forecast snapshots;
- comparable pre/post FY1 estimate-revision calculations.

Verified capability boundaries:

- historical quarter and half-year consensus snapshots are unavailable in the current account/tool surface;
- a dedicated estimate-revision tool is absent, so revisions use comparable THS_BD snapshots;
- `THS_Special_ShapePredict` and `THS_realTimeValuation` are permission-limited;
- `THS_DR` returns index or sector constituents, while analytical peer selection remains a research step;
- `ths_roe_stock` and `ths_net_asset_stock` are disabled for reported consolidated metrics until their definitions reconcile with official filings.

## Reused analyst modules

- `mikko-kevin-research-system`
- `mikko-macro-analyst`
- `urmylucky-narrative-judgment`
- `fundamental-review`
- `catalyst-calendar`
- `thesis-tracker`

The Earnings + Company Analyst owns **WHAT happened**. Relevant TianTuan modules own **SO WHAT**. The embedded Research Council owns synthesis and the Targeted Challenge tests load-bearing claims.

## Presentation capability

The existing `presentations:Presentations` skill is available. It is called only after an explicit request to generate PPT and receives the locked Final Research Memo through SlideSpec.

## Reuse and supersession

- The older active `earnings-analysis` skill is registered as `reference_only` and is superseded by this V1.5 Baseline.
- Archived Matt modules such as earnings afterview/preview, financial-statement model, key-driver, segment decomposition, peer finder, and research jam remain reference material. They are excluded from the active pipeline.
- No user modules were deleted.

## Current pipeline

```text
one-sentence request
→ company / security / latest released period resolver
→ official filing + authorized structured-data retrieval
→ Fact Pack + Expectation Pack + Company Baseline Pack
→ data integrity and accounting-basis checks
→ deterministic Python calculations
→ Earnings + Company Analysis (WHAT)
→ dynamically selected TianTuan modules (SO WHAT)
→ Research Council
→ Targeted Challenge
→ final evidence-linked Research Memo
→ optional SlideSpec → existing Presentation skill → PPTX
```

## Current gaps and readiness

- EdgarTools is useful for deterministic local SEC/XBRL extraction. The SEC official web route already supports live US research, so installation can follow the first workflow that requires local batch extraction.
- Exact pre-release quarter/half-year consensus and complete analyst revision time series remain the principal expectation-engine gap.
- China ROE and consolidated-equity iFinD field definitions require a verified mapping before reuse.

The Baseline is ready for real use with explicit unresolved states whenever period consensus is unavailable.

