# DeerFlow Finance V3.1 Integration Report

## Outcome

The eight Codex projects now have one explicit capability map and one production orchestrator. DeerFlow owns orchestration, each research/data capability has one owner, and all renderers consume the shared `RESEARCH_ARTIFACT` 1.0.0 contract.

Integration date: 2026-09-10 (Asia/Shanghai)

## Git baselines

- Analyst Dream Team pre-integration baseline: `a63c395`.
- DeerFlow imported upstream snapshot baseline: `58d457a`.
- Recorded DeerFlow upstream main commit: `0d4925305a6330a3442dcd336ed25750aea87cbd`.
- Upstream archive SHA-256: `4D72E7B14CF63DA8D6D1B4FD2104F24113EAE37FBCD3E927E81F12BDBA52871F`.

Integration commits:

- Analyst Dream Team: `cc13258`
- Daily Review: `1858c31`
- PPT Factory: `696a0bc`
- Earnings project: `a1ae956`
- DeerFlow integration branch: `3ccbb2a`

## Eight-project mapping

| Project | Production role | Decision |
|---|---|---|
| 分析师天团 | multi-framework routing and synthesis | sole router |
| MIKKO+KEVIN | personal default macro framework | reused by router |
| 叙事判断 / MATT | A-share narrative, valuation and execution | reused by router |
| 每日复盘更新 | A-share data, classification and site | sole market-data owner |
| 财报PPT计划 | earnings research | canonical `earnings-analysis` |
| PPT | presentation rendering and QA | artifact consumer |
| 基金经理 | fund-data prototype | registered, non-production |
| AA20 | entertainment product | isolated from finance core |

The authoritative map is `config/finance-capability-registry.json`. Its `singleOwners` section assigns every production capability once.

## Duplicate removal

- `earnings-company-research` was renamed and merged into the canonical `earnings-analysis` entrypoint.
- The previous global `earnings-analysis` was preserved outside the Skill discovery root at `C:\Users\urmylucky\.codex\skill-backups\earnings-analysis-pre-v3_1-20260910` and replaced by the richer canonical implementation.
- V3 `earnings-research` is represented only as a merge decision and has no active Skill directory.
- V3 `analyst-consensus` is represented only as a merge decision; the analyst-dream-team Router owns framework selection and synthesis.
- `market-daily-review` is the only new DeerFlow custom finance Skill. It calls the existing Daily Review boundary and contains no ingestion, classification, storage, site or chart pipeline.

## Real interfaces

Daily Review producer inputs:

- `public/market-snapshot.json`
- `public/dashboard-snapshot.json`
- `public/attribution-snapshot.json`
- `public/turnover-template.json`

Daily Review command: `npm run artifact:export`.

PPT consumer: `POST /api/materials/research-artifact`.

The Daily Review snapshot dated 2026-09-09 records a successful real iFinD compatibility audit at `2026-09-09T11:34:12.614Z`: 19 discovered tools, every required tool present, field-reference calls verified, and live/history samples dated 2026-09-09. The exact required tools are `lookup_field_reference`, `get_stock_list`, `THS_HQ`, `THS_RQ`, `THS_DR`, and `THS_DateQuery`. The integration copied no secret and invented no tool name. The current workspace contains `.env.example` only, so a fresh authenticated check requires the operator to inject `IFIND_API_KEY`.

## Research Artifact validation

- Pack validation: PASS.
- JSON Schema draft 2020-12 parsing: PASS.
- Pack example validation: PASS.
- Real market Artifact validation: PASS, 13 facts.
- Real earnings Artifact validation: PASS, 111 facts.
- Real analyst synthesis Artifact validation: PASS, 3 integration facts and 4 archived research conclusions.
- Analyst Dream Team tests: 14 passed.
- PPT TypeScript check: PASS.
- PPT consumer invariant: every fact ID is preserved and no additional fact line is created.
- Canonical Artifact SHA-256 remains unchanged before and after PPT consumption.

## End-to-end evidence

### Market flow

`Daily Review snapshots → market Artifact → article renderer + PPT consumer`

- Artifact: `market-review-2026-09-09`
- Fact count: 13
- SHA-256 after both consumers: `0708bd187d09ad14de9d8df35b096f54980d5a674d56aaded8b73561858cadb9`
- Repeated research: false

### Earnings flow

`earnings-analysis packs → fundamental-review synthesis already embedded in the completed run → earnings Artifact → article renderer + PPT consumer`

- Artifact: `earnings-600989-sh-2026h1`
- Fact count: 111
- SHA-256 after both consumers: `a746b59ab8f6b22450de712a67a6a51312253386e16efba75b79dc10990c4662`
- Consensus gap remains explicit in `quality.warnings`.
- Repeated research: false

### Router flow

`analyst-dream-team-router → MIKKO+KEVIN research archive + MATT A-share mapping → synthesis Artifact → article renderer + PPT consumer`

- Artifact: `analyst-synthesis-storage-cycle-2026-08`
- Fact count: 3
- SHA-256 after both consumers: `441faf08cacc062a6091e9983996451dbd28515bcfe41333e397a218b7b9eaa8`
- The MIKKO+KEVIN source owns the macro/industry mechanism; MATT owns the A-share mapping. The synthesis stage cites both and performs no new search.
- Repeated research: false

## Current boundary

Scheduling remains inactive until the user configures runtime credentials and the manual flows pass again in that runtime. The integration depends only on DeerFlow current main features: custom skills, `extensions_config` schema, local scripts and the official skill loader. It uses no unmerged PR feature.
