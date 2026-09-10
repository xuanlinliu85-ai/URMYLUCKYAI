# TASK — Explicit Preference Events

Execution status: `DONE`
Merged: `dda5a36`

## Goal

Add the ordered local V2 foundation for explicit user preference events over
Golden Slides and immutable Style Pack versions without enabling automatic
design learning.

## Current State

Status: `MISSING`

Golden Slides, saved/versioned Style Packs and deterministic semantic search
are operational, but there is no preference event schema, append/idempotency
logic, aggregate signal artifact or query API. Search ranking has no explicit,
opt-in preference signal.

## Expected Behavior

Explicit `favorite`, `use` and `reject` events append deterministically to a
versioned local artifact after the referenced Golden candidate or Style Pack
version is validated. Replaying an idempotency key is a no-op when the payload
matches and a conflict when it does not. Explainable aggregate signals can be
queried and can influence semantic search only when a caller explicitly opts
in; default ranking remains unchanged.

## Scope

### In scope

- Versioned event journal and aggregate-profile JSON contracts.
- Project-local/user-placeholder scope with no authentication claims.
- Exact Golden candidate and Style Pack version reference validation.
- Deterministic append, event IDs, ordering, idempotency and aggregation.
- Local POST/GET API and persisted intermediate JSON artifacts.
- Optional semantic-search ranking signal behind explicit opt-in.
- Unit, API-contract, build and bounded persisted-artifact acceptance.

### Out of scope

- Learning automatically from manual edits or silently changing designs.
- Team/cloud storage, accounts, auth, collaboration or approvals.
- Embeddings, ML preference learning, marketplaces or another orchestrator.
- Renderer, Slide Plan, native PPTX or UI changes.

## Inputs

- Project ID and local placeholder user key.
- Event action, idempotency key and exact subject reference.
- Existing `analysis/golden-slides.json` and/or `style/style-packs.json`.

## Outputs

- `analysis/preference-events.json`.
- `analysis/preference-profile.json`.
- Optional preference evidence in semantic-search results only on opt-in.

## Requirements

- Keep `ppt-factory` as the unique top-level orchestrator.
- Preserve existing Golden Slide, Style Pack and search contracts by wrapping.
- Use JSON artifacts as source of truth.
- Default preference ranking must be neutral.
- Aggregate evidence must state counts, weights and resulting signal.

## Edge Cases

- Duplicate idempotency key with same/different payload.
- Missing, inactive, ineligible or version-mismatched subjects.
- Cross-project or cross-placeholder-user journal reuse.
- Empty journal/profile and explicitly disabled ranking.

## Acceptance Criteria

- `favorite`, `use` and `reject` append and aggregate deterministically.
- Repeated identical append does not duplicate an event.
- Invalid subject/version and conflicting idempotency key are rejected.
- Default semantic search result equals the pre-feature result.
- Explicit opt-in produces bounded, explainable preference ranking evidence.
- `pnpm test`, `pnpm typecheck` and `pnpm build` pass.
- Bounded local acceptance persists and re-reads both JSON artifacts.

## Visual Acceptance

Not applicable: this task does not change PPT rendering or UI. No PPTX
regeneration is required.

## Deliverables

- Library, JSON schema, API route, search integration, tests and acceptance
  runner/report.
- `RESULT.md` with diff review and merge recommendation.

## Worktree

- Branch: `feature/preference-events`
- Path: `.worktrees/preference-events`
