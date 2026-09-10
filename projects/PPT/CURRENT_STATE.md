# CURRENT_STATE

Audit date: 2026-08-22  
Baseline commit: `e526342` (`master`)  
Audit authority: `PPT_FACTORY_CODEX_MASTER_V2_WORKTREE_MERGED.md`, section 38  
Status vocabulary: `DONE / PARTIAL / MISSING / BROKEN / UNKNOWN`

## 1. 已完成功能

| Module | Status | Evidence |
| --- | --- | --- |
| Project shell and stage storage | DONE | `storage/local-store.ts` creates `input/analysis/style/storyline/slide-plans/render/qa/output` |
| Single top-level orchestrator | DONE | Only `.codex/skills/ppt-factory` exists in the project skill root; architecture test passes |
| PPTX structural extraction | DONE for current V1 fields | Fonts, colors, positions, layouts, masters, charts, images and text counts are extracted from OOXML |
| Reference slide rendering | DONE | Real 85-slide WPS-authored PPTX rendered to 85 PNGs and a contact sheet |
| WPS negative chart-axis compatibility | DONE | Render-only copy normalized 48 negative `axId/crossAx` values across 7 charts; source file unchanged |
| Stage-based Style DNA persistence | DONE | Reference and active Style DNA are written as separate JSON artifacts |
| Reference-use boundary | DONE | Upload can be compatibility-only or explicit style learning; compatibility-only mode does not activate the uploaded deck's style |
| System style presets | DONE for initial presets | General professional baseline plus optional bank-internal-report preset |
| Required Phase 1 slider UI | DONE | Reference Strength, Minimal/Rich, Classic/Modern, Dense/Airy, Text/Visual, Financial/Technology, Low/High Impact |
| Required Phase 1 locks UI | DONE at control level | Typography, colors and layout controls are exposed |
| Local project API | DONE | Project creation endpoint works in production server baseline |
| Native PPTX generation | DONE at prototype level | Editable text, shapes, notes and native bar charts are emitted by the native adapter |
| Final rendering and export endpoints | DONE at prototype level | Final PNG/layout artifacts, contact sheet and PPTX are produced |
| Repair-pass cap and rollback | DONE | API caps Auto Fix at three passes and restores backup if score declines |
| Reproducible V1 Happy Path | DONE | App-driven acceptance runner produced, re-imported and QA-verified an 8-slide editable Chinese PPTX |
| Phase 1 intermediate contracts | DONE | Content Analysis, Slide Plan, Style Mix, Repair Plan and Acceptance Manifest are persisted independently |
| Compact long-deck contact sheets | DONE | Dynamic 3/4/5-column grid with non-overlapping page labels; real 85-slide WPS regression passed |
| Long-image export adapter | DONE | Ordered 1–8 rendered pages export to native 1080×1920 and 2160px-wide PNGs with a validated manifest; 3-page visual acceptance passed |
| Reproducible local data binding | DONE for JSON/CSV core | JSON/CSV normalization, `{{path}}`, named native text/chart targets and `BINDING_MANIFEST.json` passed deterministic editable 5-slide acceptance |
| Deterministic semantic search | DONE for local V2 core | Explainable local ranking over eligible Golden Slides and versioned Style Pack documents, threshold fallback and compatibility-only blocking passed persisted-artifact acceptance |
| Saved Style Packs | DONE for local V2 core | Immutable versioned local packs preserve full eight-dimension mixer provenance, hashes and deterministic apply; API/artifact acceptance and semantic-search integration passed |
| Native Chart DNA Packs | DONE for local V2 bar-chart core | Versioned restrained-light and contrast-dark native packs, deterministic selection/fallback and per-chart manifests passed two editable 3-slide render/reopen acceptances |
| Explicit preference events | DONE for local V2 foundation | Favorite/use/reject journals are deterministic and idempotent, validate exact Golden/Style Pack versions, aggregate explainable signals, and remain search-neutral unless explicitly enabled |
| Update existing editable deck | DONE for bounded local V2 core | Stable native text/chart targeting, embedded workbook synchronization, immutable output versions and object-level diffs passed a 5-slide update/render/reopen acceptance; ambiguous targets fail closed |
| Preference learning from manual edits | DONE for guarded local Phase 3 core | Trusted immutable edit diffs produce explainable proposals behind evidence/confidence gates; user-scoped append-only journals, CAS snapshots and explicit decisions never auto-mutate decks |
| Team Style Library | PARTIAL; local foundation and remote adapter code DONE | Tenant/team RBAC, immutable version chains, local/remote CAS repositories, verified-auth boundary, Postgres/RLS migration and private Storage retrieval contract are implemented; live Supabase deployment remains unconfigured and unaccepted |
| Brand Governance | DONE for guarded local Phase 3 core | Strict immutable policies, authoritative deck/evidence manifests, native-only rule observation, tenant/team scope, audited exemptions and hash-bound ALLOW/BLOCKED decisions passed executable API security tests and real 8-slide acceptance |
| Collaborative Review | DONE for guarded local Phase 3 core | Immutable deck/evidence/Brand Decision binding, stored Team RBAC, native slide/object comments, physical append-only hash-chained events, cross-process CAS and strict snapshots passed 141 tests, production build, independent audit and real 8-slide acceptance |
| Approval Workflow | DONE for guarded local Phase 3 core | Exact authoritative deck/evidence/Brand/review binding, stored Team RBAC, review-exclusive validation, one immutable terminal decision, CAS/idempotency and crash-safe intent recovery passed 152 tests, production build, independent audit and real 8-slide acceptance |
| AI Design Memory | DONE for guarded local Phase 3 core | Content-addressed profiles and query recommendations compose strict Style Pack, Golden Slide, explicit preference and accepted edit-learning evidence without mutating Style Mix, Slide Plan or PPTX; 164 tests, production build, independent audit and bounded real 8-slide acceptance passed |

## 2. 部分完成功能

| Module | Status | Current limitation |
| --- | --- | --- |
| Reference Style Learner | PARTIAL but strengthened | Deterministic XML/render role inference, semantic layout families, typography hierarchy, density, whitespace and chart treatment are persisted; deeper vision semantics, visual center, rhythm and decorative language remain |
| Style DNA depth | PARTIAL but measured | Title/body/caption/KPI distributions, density, whitespace and native chart treatment are measured; spacing/shape/imagery DNA remain incomplete |
| Slide role inference | DONE for deterministic local Phase 1 | Every reference slide persists a semantic role, confidence, evidence and XML/render signals; weak evidence falls back to `other` |
| Layout families | DONE for deterministic local Phase 1 | Per-slide semantic families, confidence/evidence and deck summaries are persisted from roles, normalized geometry and rendered signals |
| Style Inspector | PARTIAL | Shows typography/colors/composition and controls; does not edit every Style DNA dimension independently |
| Style Mixer | DONE for local V2 advanced core | Reference/System/Prompt sources, deterministic prompt interpretation, eight dimension weights/locks and resolved ownership passed two editable 8-slide visual acceptances |
| Lock enforcement | PARTIAL | Locks affect selected style-vector calculations but are not verified end-to-end against rendered fidelity |
| Reference Fidelity | PARTIAL but operational | Final and reference renders are now measured across typography, color, layout, chart style, density, composition, storytelling and visual tone; measurement is local/heuristic and does not yet use a semantic vision model |
| Material ingestion | PARTIAL | Plain text and PDF are supported; DOCX, XLSX, CSV, Markdown and image understanding are missing |
| Content Analyzer | PARTIAL | Conclusions, evidence, numeric data, risks, recommendations and sources are modeled; causality and semantic ranking remain heuristic |
| Storyline Planner | PARTIAL | Markdown-aware decimal-safe parsing and balanced page distribution work; deeper narrative reasoning remains heuristic |
| Slide Planner | PARTIAL | Renderer now consumes Slide Plans as its structural source; richer component-level constraints remain incomplete |
| A/B/C preview | DONE for V1 acceptance | Cover, summary and data pages use composition-level A/B/C systems; broader component coverage remains future work |
| Component Library | PARTIAL | Core text, shapes, basic bar chart and several layouts exist; tables, timelines, process, matrix, richer charts and SVG routing are incomplete |
| Technical QA | PARTIAL but operational | Bounds, small text, repetition, overlap, rendered contrast, requested/resolved CJK typefaces, native-image distortion/asset/bounds and native chart-label collision checks exist; broken SVG checks remain shallow |
| Visual QA | PARTIAL | Numeric scoring is rule-based and does not yet inspect rendered imagery for hierarchy, balance, contrast or style consistency |
| Auto Repair | PARTIAL but operational | Typography, contrast, CJK font fallback, image distortion and chart-label collision use slide/object targets. Applied object-local targets accumulate across passes, and unchanged/lower target scores still roll back. Other dimensions remain shallow |
| `slides-grab` adapter | PARTIAL | Adapter boundary exists, implementation is only a placeholder |
| Phase 1 UI | PARTIAL | Main flow is present on one page; progress recovery, persisted project reopening and detailed artifact inspection are limited |

## 3. 尚未开始功能

| Module | Status | Notes |
| --- | --- | --- |
| Golden Slide selection/retrieval | DONE for local V2 core | Explainable six-dimension scoring, persisted local library, semantic retrieval, threshold fallback and compatibility-only blocking passed an editable 8-slide acceptance |
| Prompt Style Interpreter | DONE for deterministic local V2 | Known Chinese/English professional intents map to structured Style DNA; unmatched intent remains explicitly neutral |
| Advanced Mixer | DONE for local V2 core | Eight dimension source weights and locks are exposed progressively while legacy Phase 1 controls remain compatible |
| `CONTENT_ANALYSIS.json` contract | DONE for V1 | Persisted by material ingestion |
| `STYLE_MIX.json` contract | DONE for V1 | Persisted per preview set and as the active mix |
| `REPAIR_PLAN.json` contract | DONE for V1 | Persisted when Auto Fix is invoked |
| AGENTS protocol | DONE | Root `AGENTS.md` defines repository-wide implementation and QA rules |
| Task protocol | DONE | `tasks/backlog`, `active`, `review`, `done` plus TASK/RESULT templates exist |
| Worktree `RESULT.md` protocol | DONE | Completed V1 acceptance and long-deck contact-sheet tasks have archived RESULT reports |
| Full real acceptance demo | DONE | Final project `project_8effec2a-4629-4945-b65c-41c4b6a0947c`; manifest status PASS |

## 4. 当前目录结构

```text
.
├── .codex/skills/ppt-factory/
├── adapters/
│   ├── native-pptx/
│   ├── reference-analyzer/
│   ├── slides-grab/
│   └── visual-qa/
├── app/
│   └── api/
├── generated/
├── lib/
├── schemas/
├── storage/
├── tests/
├── workers/
└── .worktrees/
```

The repository is close to the target structure and does not require a rewrite or directory migration.

## 5. 当前技术栈

- Next.js 16.3.1, React 19, TypeScript 5.9
- Local file-backed stage storage
- Artifact Tool native PPTX generation/import/render adapter
- JSZip + Fast XML Parser for OOXML analysis/compatibility
- PDF.js for PDF text ingestion
- Sharp for contact sheets
- Node built-in test runner
- Git worktrees for isolated feature development

No Supabase or external API key is required for the current local Phase 1 path.

## 6. 当前 Skills

| Skill | Status | Role |
| --- | --- | --- |
| `ppt-factory` | DONE | Unique top-level orchestrator |
| External presentation capabilities | PARTIAL | Used only through adapter/reference boundaries; no second top-level project skill |

## 7. 当前 Adapters

| Adapter | Status |
| --- | --- |
| `native-pptx` | PARTIAL but operational |
| `reference-analyzer` | PARTIAL but operational |
| `visual-qa` | PARTIAL |
| `slides-grab` | PARTIAL placeholder |

## 8. 当前 JSON Schemas

| Schema | Status |
| --- | --- |
| Style Controls | DONE for Phase 1 subset |
| Style DNA | PARTIAL |
| Storyline | DONE for current model |
| Slide Plan | PARTIAL relative to V2 |
| QA Report | PARTIAL relative to V2 |
| Content Analysis | DONE for V1 |
| Style Mix | DONE for V1 |
| Repair Plan | DONE for V1 |

## 9. 当前渲染链

```text
Storyline + Style + Controls
→ native-pptx adapter
→ editable PPTX
→ per-slide PNG + layout JSON
→ contact sheet
→ inspect NDJSON
```

Reference rendering adds a render-only WPS compatibility repair before import when required.

## 10. 当前 QA 能力

- Slide bounds check
- Preferred minimum body-size warning
- Heuristic text-overlap warning
- Structural repetition / AI-look penalty
- Aggregate score and pass/review/fail status
- Maximum three repair passes
- Backup and rollback if score declines

Missing or shallow: rendered-image semantic critique and broken-SVG validation. Rendered contrast, requested/resolved CJK font fallback, native image distortion/asset/bounds and chart-label collision measurement are operational with object-local repair.

## 11. 当前 UI 页面

One Creative Workstation-style page implements:

1. Create project
2. Upload/reference input
3. Compatibility-only vs explicit style-learning control
4. System style preset selection
5. Style Inspector and Phase 1 controls
6. Material ingestion and Storyline display
7. A/B/C preview selection
8. Full deck generation
9. QA, Auto Fix and download

## 12. 当前已知 Bug / 风险

1. A/B/C composition coverage is proven for cover, summary and data pages but not the future full component library.
2. Slide Plan is the structural renderer input, though plans do not yet encode every geometry constraint.
3. Typography, contrast, font fallback, image-distortion and chart-label Auto Fix are object-local and preserve global controls; other repair categories still apply several controls globally.
4. Reference Fidelity is measured from persisted render/layout evidence; typography matching remains the weakest dimension in the current demo and is now reported explicitly.
5. Visual QA does not inspect the rendered PNGs semantically.
6. Local runtime paths are environment-dependent; the adapter fallback must remain tested on Windows.
7. Generated acceptance evidence is local and Git-ignored; back it up separately if the workspace is moved or deleted.

## 13. 当前测试情况

Current verified `master` baseline:

- Full Node test suite: PASS, 164/164
- `pnpm typecheck`: PASS
- `pnpm build`: PASS
- Production homepage: HTTP 200 and expected title present
- Project API: PASS
- Real WPS regression: PASS, 85/85 slides rendered; 48 negative chart-axis identifiers normalized in a temporary copy
- Previously generated editable 10-slide Chinese PPTX: opens and re-imports; slide overflow test passed

Test gaps:

- The full API happy-path is reproducible through `pnpm acceptance`; it is not yet a lightweight CI fixture
- No committed synthetic PPTX fixtures for parser/renderer regression
- No 90-vs-50 fidelity comparison test
- No image-based visual QA regression suite

## 14. 与 V2 Spec 的差距

The repository has a viable V1 skeleton and should be extended incrementally. The largest gaps are:

1. Richer visual/semantic reference learning beyond deterministic local role inference
2. Measured, dimension-level style fidelity
3. Slide Plan as the renderer's strict source of truth
4. Truly distinct A/B/C composition systems
5. Structured local repair plans and rendered-image QA
6. AGENTS/TASK/RESULT governance
7. One reproducible end-to-end acceptance run

## 15. 推荐下一步

1. Keep the existing architecture and working adapters.
2. Retain only worktrees that own local evidence or an active task; create future worktrees dynamically.
3. Step 5 deterministic Reference Learner work is complete: role inference, semantic layout families and measured hierarchy/density/whitespace/chart treatment all passed bounded acceptance.
4. The documented local V2 core and guarded local Phase 3 sequence through AI Design Memory are complete. Live Supabase deployment and remote multi-user acceptance remain an explicit external-configuration boundary.
