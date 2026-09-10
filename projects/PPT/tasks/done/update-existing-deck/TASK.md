# TASK

Worktree status: `DONE`
Merged: `0ce41a9`

## Goal

Add the bounded local V2 update-existing-deck core without replacing the working generation or rendering chain.

## Current State

Status: `MISSING`

The repository has native PPTX generation, import/render, JSON/CSV data binding and advanced style locks, but no existing-deck object catalog, update plan, immutable version output or object-level update manifest.

## Expected Behavior

Import an editable PPTX/project version, resolve explicitly named native text/chart targets by stable OOXML identity or an unambiguous exact object name, apply only those values, preserve every untouched slide/object and locked style dimension, and write a new PPTX version plus a deterministic update manifest.

## Scope

### In scope

- Local `.pptx` OOXML catalog and update adapter
- Native text and native chart data updates
- Stable object IDs and safe deterministic exact-name fallback
- Immutable source/output version metadata and object-level hashes
- JSON schema, API route, library/types, unit and real acceptance tests

### Out of scope

- Cloud storage, collaboration, approval or authentication
- UI rewrite
- Storyline, Slide Plan, layout or style invention
- Rasterizing editable business content
- Adding/removing slides or arbitrary objects

## Inputs

- Existing editable PPTX/project version
- Explicit update plan containing source version, target identity, kind and replacement value/data
- Locked style dimensions

## Outputs

- A new, never-overwritten PPTX version
- `DECK_UPDATE_MANIFEST.json` with immutable provenance and object-level diffs

## Requirements

- `ppt-factory` remains the sole top-level orchestrator.
- Reject missing or ambiguous targets, type mismatches, duplicate targets, missing values and non-finite chart data.
- Do not mutate Storyline or Slide Plan.
- Preserve untouched OOXML parts byte-for-byte at the logical ZIP-entry level where possible.
- Locked dimensions remain unchanged; this slice only changes text content or chart cache data.

## Edge Cases

- Duplicate object names require stable ID selection.
- A stable ID that does not exist fails without writing output.
- Chart series count mismatch fails instead of inventing or dropping series.
- Output path equal to source or pre-existing output version fails.

## Acceptance Criteria

- `pnpm test`, `pnpm typecheck`, and `pnpm build` pass.
- One real editable deck of no more than eight slides updates bounded CJK text and one native chart.
- Before/after all-slide render, technical QA, visual inspection, reopen and native-editability checks pass.
- Untouched slides/objects and locked dimensions remain stable.
- Generated evidence is not committed.

## Visual Acceptance

- Updated text/chart render correctly with intact CJK.
- Untouched slides remain visually stable.
- No clipping, overlap, chart-label collision or rasterized business text is introduced.

## Deliverables

- Update library/adapter, API, schema and types
- Unit tests and bounded real acceptance runner
- `RESULT.md`

## Verification

- Full suite after rebase to `0fea1a3`: 96 / 96 passed
- TypeScript: passed
- Production build: passed, including `/api/deck/update`
- Real acceptance: 5 / 5 editable slides generated, updated, reopened and rendered
- Technical QA: all rendered objects in bounds, native text/chart retained, CJK intact
- Visual QA: before/after contact sheets inspected; only slides 1 and 3 changed as planned

## Worktree

- Branch: `feature/update-existing-deck`
- Path: `.worktrees/update-existing-deck`
