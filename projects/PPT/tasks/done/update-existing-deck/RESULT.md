# RESULT

## Task

Bounded local V2 update-existing-deck core.

## Status

`PASS / COMPLETE`

Merged to `master`: `0ce41a9`

## Summary

An existing editable PPTX can now be cataloged and updated through an explicit, persisted update plan. The updater resolves stable OOXML object IDs or an unambiguous exact object name, changes only named native text/chart targets, synchronizes referenced chart caches with their embedded Excel workbook, verifies untouched objects, and writes a new immutable PPTX version plus an object-level manifest. It never overwrites the source.

## Files Changed

- Native updater and declaration: `adapters/native-pptx/update-existing-deck.*`
- API: `app/api/deck/update/route.ts`
- Path/version validation library: `lib/deck-update.ts`
- Plan and manifest schemas: `schemas/deck-update-plan.schema.json`, `schemas/deck-update-manifest.schema.json`
- Unit tests and real acceptance runner
- Ignore rule for local generated probe evidence

## Architecture Changes

- `ppt-factory` remains the sole top-level orchestrator.
- The existing native adapter, local project stages and file API are wrapped, not replaced.
- `DECK_UPDATE_PLAN` and `DECK_UPDATE_MANIFEST` are structured JSON sources of truth.
- Storyline and Slide Plan are not regenerated or mutated.

## Implementation

- Catalogs native text/chart objects using slide-scoped stable OOXML IDs.
- Allows exact object-name fallback only when the match is unique.
- Rejects missing, ambiguous, duplicate, type-mismatched or shared unnamed targets.
- Requires explicit text values and finite chart categories/series; series shape must match the source.
- Preserves text formatting/geometry while replacing native text runs.
- Updates both chart cache/literal data and, for referenced charts, the corresponding cells in the embedded `.xlsx` workbook.
- Rejects referenced charts without a safely writable embedded workbook.
- Persists source/output project/version/file/hash/slide metadata, plan hash, locked dimensions, object hashes and changed OOXML parts.
- Verifies all non-target native object containers are unchanged before writing output.
- Uses exclusive output creation so a version cannot be overwritten.

## Tests

- `pnpm test`: PASS, 96 / 96 after rebase to master `0fea1a3` (including preference events, Chart Packs and Style Packs).
- Focused coverage includes stable cataloging, text/chart updates, literal chart data, embedded workbook synchronization, immutable output, ambiguous/missing targets, non-finite data and series mismatch.
- `pnpm typecheck`: PASS.
- `pnpm build`: PASS; `/api/deck/update` appears in the production route table.

## PPT Test

- Generated a real 5-slide editable Chinese operating deck.
- Updated slide 1 `cover-title` from `二季度经营复盘` to `三季度经营复盘`.
- Updated slide 3 native bar chart from `72 / 81` to `76 / 88`.
- Source SHA-256 remained unchanged; output has a different hash and version.
- Output reopened successfully with 5 / 5 slides, native text and a native chart.

## Render Test

- Rendered all five source slides before update and all five output slides after update.
- Slides 2, 4 and 5 have identical rendered PNG hashes before/after.
- Every after-render layout parsed successfully and every object bbox remained inside the 1280×720 slide frame.

## Visual QA

- Both contact sheets were inspected at original resolution.
- The updated CJK cover title is intact and stays within the original hierarchy/layout.
- The chart visibly shows `76` and `88`; chart formatting, axes and surrounding decision panel remain unchanged.
- Untouched slides are visually identical; no new clipping, overlap or corruption was observed.

## Known Issues

- This bounded core updates native text and standard single-column category/value chart ranges. Multi-column chart formulas, external linked workbooks, pivot charts and exotic OOXML chart structures are rejected rather than partially updated.
- It does not add/remove slides, objects or chart series.
- No dedicated UI is included; the versioned API is ready for a later UI surface.

## Risks

- OOXML produced by non-standard presentation tools may use structures outside the bounded parser. These fail closed and leave the source/output untouched.

## Regression Risk

Low. The feature is additive, has a dedicated API/adapter, does not modify the generation route, and the complete existing test/build suite passes.

## Recommendation

`COMPLETE`

## Next Steps

Merge after parent review, archive the task, and update `CURRENT_STATE.md` / `MIGRATION_PLAN.md`. Do not expand this worktree into collaboration, cloud storage or approval workflow.
