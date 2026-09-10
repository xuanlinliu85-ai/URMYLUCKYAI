# MIGRATION_PLAN

Authority: `PPT_FACTORY_CODEX_MASTER_V2_WORKTREE_MERGED.md`, sections 24, 33, 37 and 38.  
Migration rule: `KEEP > WRAP > REFACTOR > MIGRATE > REWRITE`.

## Goal

Take over the current half-built PPT Factory without reinitializing or rewriting it, preserve the working V1 chain, and close the exact Phase 1 acceptance gap before unrelated V2/V3 work.

## Baseline protected

- Baseline commit: `e526342`
- Tests, typecheck and production build pass
- Local production UI and project API respond successfully
- Real 85-slide WPS reference deck renders end-to-end through the compatibility adapter
- User files and generated artifacts are excluded from Git

## Migration decisions

| Existing module | Decision | Reason |
| --- | --- | --- |
| Next.js app and API routes | KEEP | Current flow is coherent and builds |
| Stage-based local storage | KEEP | Already matches artifact-first architecture |
| `ppt-factory` skill | KEEP | Satisfies single-orchestrator rule |
| OOXML reference analyzer | WRAP / extend | Working mechanical extraction should gain richer measurements, not be replaced |
| WPS compatibility sanitizer | KEEP | Proven on a real 85-slide file; source remains unchanged |
| Style DNA functions | REFACTOR incrementally | Preserve existing contracts while adding prompt/system provenance and richer dimensions |
| Native Artifact Tool renderer | WRAP / extend | Editable output works; move it toward strict Slide Plan input and a larger component library |
| A/B/C generator | REFACTOR locally | Keep API and artifact contract; replace token-only variation with composition-level directions |
| Visual QA adapter | REFACTOR incrementally | Keep report/API/rollback, add rendered-image checks and object-local issues |
| Auto Fix route | REFACTOR locally | Preserve cap/backups/rollback; introduce `REPAIR_PLAN.json` and targeted repair |
| `slides-grab` adapter | KEEP as boundary | Do not make it a runtime dependency until a bounded Phase 1 need is proven |
| Local storage vs Supabase | KEEP local for Phase 1 | No credential or multi-user requirement yet |

No current module justifies a rewrite.

## Worktree policy

Use dynamic worktrees only for a clear independent task. Allowed branch prefixes:

```text
feature/*
fix/*
experiment/*
refactor/*
```

The pre-V2 module worktrees and completed V1 acceptance worktree were removed
after their state and local evidence were preserved. Worktrees are not permanent
architecture: create them dynamically, give each one a single `TASK.md`, and
finish with `RESULT.md` before review.

## Ordered execution

### Step 1 — Governance without business refactor — COMPLETE

Create root `AGENTS.md`, optional module AGENTS files, and:

```text
tasks/backlog/
tasks/active/
tasks/review/
tasks/done/
```

Add `TASK.md` and `RESULT.md` templates. Acceptance: tests/build unchanged.

### Step 2 — Reproducible V1 happy-path task — COMPLETE

Create one task that drives the existing APIs through:

```text
Reference PPTX → render → Style DNA → controls → unrelated content
→ Storyline → A/B/C → select B → editable PPTX → render → QA → export
```

Persist all required artifacts and a machine-readable acceptance manifest.

### Step 3 — Fix the first acceptance blockers — COMPLETE FOR V1

Only after the happy-path run identifies them:

1. Ensure renderer consumes Slide Plan as structural source of truth.
2. Make A/B/C use distinct composition systems for cover, summary and data pages.
3. Generate visible and measurable Reference Strength 90 vs 50 evidence.
4. Verify CJK fonts and editable-object ratio.

### Step 4 — Close QA and repair loop — COMPLETE for the documented local technical checks

Add `REPAIR_PLAN.json` with slide/object/dimension targets. Preserve maximum three passes and rollback. Add checks for contrast, font fallback, image distortion and chart labels in priority order.

Rendered Reference Fidelity measurement is complete for the local Phase 1
path: eight weighted dimensions now compare persisted reference/final PNG and
layout evidence. Typography object-local AutoFix is also complete for the
local path: repair targets name native text families, preserve non-typography
controls and retain/rollback based on target-dimension improvement. Rendered
contrast is now operational too: QA combines native foreground colors with
local rendered pixel samples, emits slide/object repair targets and changes
only the affected foreground colors. CJK font fallback is now operational too:
requested, applied and resolved
typefaces are persisted per native text object; unsafe or substituted CJK
objects receive a local safe-typeface target. Successfully applied local
targets accumulate across passes so later repairs do not undo earlier ones.
Image distortion is operational on native metadata plus layout/inspect
evidence: invalid assets, bounds and stretched ratios emit object-local
fit/crop/frame targets with target-score rollback. Chart-label collision is
also operational: native chart metadata drives label-box checks and bounded
label-policy repair while preserving chart data, type and geometry. Contrast,
CJK font fallback, image distortion and chart-label collision now share the
cumulative object-local repair and target-score rollback path.

### Step 5 — Strengthen reference learning

Extend, do not replace, the current analyzer:

- Infer slide roles from XML plus rendered pages
- Cluster semantic layout families
- Measure typography hierarchy, density, whitespace and chart treatment
- Produce Golden Slide candidates only after the happy path passes

Reference-slide role inference is complete for the deterministic local path:
every slide persists a role, confidence and explainable XML/render evidence,
while ambiguous pages fall back to `other`. Ordinary regression uses an
eight-slide sample; the 85-slide legacy deck is reserved for milestone checks.
Semantic layout-family clustering and deterministic reference-style
measurements are complete for the local path. Per-slide and aggregate evidence
now covers typography hierarchy, CJK runs, information/visual density,
whitespace and native chart treatment. The strengthened Step 5 gate can now
proceed to bounded Golden Slide candidate scoring and retrieval.

### Step 6 — Review and merge

For each worktree:

1. Run unit/integration tests
2. Generate a real PPTX
3. Render all slides
4. Run technical QA
5. Run visual QA
6. Review diff for unrelated changes
7. Produce `RESULT.md`
8. Recommend `MERGE`, `NEEDS REVIEW`, or `DO NOT MERGE`

Merge order is dependency-driven, not permanent-module order.

## Immediate next task after this plan

Start Step 5 in documented order with reference-slide role inference, then
semantic layout-family clustering and measured typography hierarchy, density,
whitespace and chart treatment. Golden Slide candidates remain deferred until
that strengthened happy path passes. Collaboration, billing, animation and
enterprise permissions remain out of Phase 1 scope.

## Completion gate

This migration phase is complete only when one app-driven demo produces:

- Editable PPTX
- All slide PNGs and contact sheet
- `STYLE_DNA.json`
- `CONTENT_ANALYSIS.json`
- `STORYLINE.json`
- `SLIDE_PLAN.json`
- `STYLE_MIX.json`
- `QA_REPORT.json`
- `REPAIR_PLAN.json` when repair is needed
- Visual proof that Reference Strength 90 and 50 differ
- A/B/C previews with composition-level differences
- WPS/open/re-import success and intact Chinese text

## Post-Phase-1 V2/V3 execution order

The V1 happy path and documented local V2/guarded local V3 sequence are
operational. Remaining partial capabilities continue through bounded
incremental tasks and none justify a rewrite.

1. `DONE` — Golden Slide core now has a candidate schema, explainable scoring,
   local persistence, semantic retrieval, Slide Plan threshold fallback and a
   hard compatibility-only boundary; bounded editable 8-slide acceptance passed.
2. `DONE` for Advanced Mixer — Reference/System/Prompt sources, deterministic
   prompt interpretation and eight dimension weights/locks passed two editable
   8-slide acceptances. `DONE` — saved/versioned local Style Packs now use
   immutable versions, verified hashes, full Mixer provenance and deterministic apply.
3. `DONE` for local deterministic core — explainable structured search covers
   eligible Golden Slides and versioned Style Pack documents with threshold
   fallback and compatibility-only blocking; external embeddings remain deferred.
4. `DONE` for local JSON/CSV core — normalized maps, `{{path}}`, native
   text/chart targets and deterministic binding manifests passed editable
   5-slide acceptance. Excel and optional external sources remain later adapters.
5. `DONE` — update-existing-deck uses stable native targets, immutable output
   versions, embedded workbook synchronization, locked-dimension metadata and
   object-level diffs; ambiguous or unsafe targets fail closed.
6. `DONE` — long-image export is an independent bounded adapter/API path with
   1080×1920 and 2160px-wide outputs, ordered manifests and real 3-page visual
   acceptance. A dedicated UI chooser remains optional follow-up work.
7. `DONE` for native bar-chart core — versioned Chart DNA packs map explicitly
   to editable renderer options with deterministic fallback and per-chart manifests.
8. `DONE` — explicit favorite/use/reject journals are deterministic,
   idempotent and explainable; search remains neutral unless explicitly opted in.
   `DONE` — guarded learning from trusted immutable edit diffs now produces
   explainable dry-run proposals with user-scoped append-only journals, CAS
   snapshots and explicit decisions; it never mutates a deck automatically.
9. `PARTIAL` — the Team Style Library local foundation and bounded remote
   implementation now provide tenant/team RBAC, immutable version chains,
   local and Postgres RPC CAS persistence, verified Supabase Auth actor context,
   RLS policy templates and private Storage signed retrieval. Live deployment
   and remote acceptance still require user-provided project configuration.
10. `DONE` — Brand Governance now binds strict Team Brand Policies to
    create-once generation/update deck versions and tenant/team-scoped immutable
    evidence manifests. Native-only rule observation, audited exemptions,
    executable API security tests and real editable 8-slide acceptance passed.
11. `DONE` — Collaborative Review binds immutable authoritative deck, evidence
    and Brand Decision identities to native slide/object comments. Stored Team
    RBAC, physical append-only hash-chained events, cross-process revision CAS,
    strict snapshots and executable API boundaries passed real 8-slide acceptance.
12. `DONE` — Approval Workflow binds the authoritative immutable deck,
    evidence manifest, governance decision and closed review identities. Stored
    Team RBAC, review-exclusive validation, immutable terminal decisions,
    revision CAS and crash-safe intent recovery passed real 8-slide acceptance.
13. `DONE` — AI Design Memory composes strict persisted Style Pack, Golden
    Slide, explicit preference and accepted edit-learning evidence into
    content-addressed advisory profiles and recommendations. It requires exact
    source lineage and explicit downstream opt-in, never mutates a deck and
    remains below the single `ppt-factory` top-level orchestrator.

Local V2 and guarded local Phase 3 slices require no external credentials.
Remote Team Library, Collaborative Review and Approval acceptance require Auth,
Supabase/Postgres and object storage; request those only at the live boundary.
