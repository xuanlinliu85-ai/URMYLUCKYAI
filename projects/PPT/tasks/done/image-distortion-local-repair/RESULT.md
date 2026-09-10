# Image distortion local repair result

Status: PASS

Merged and archived.

## Handoff

- Editable acceptance deck: `generated/showcase/image-distortion-local-repair/image-distortion-acceptance.pptx`
- Before/after/reopened contact sheets and QA/Repair Plan evidence are archived
  in the same directory.
Recommendation: MERGE after the font-fallback branch, adapting the shared AutoFix selection/target-score switch onto its accumulated-target implementation.

## Outcome

- Added `technical.imageDistortion` without replacing `technical.contrast`.
- QA reads `image-metadata.json`, corroborates named objects with layout JSON and `inspect.ndjson`, and detects missing/invalid assets, invalid geometry, out-of-bounds frames and stretched source/display aspect ratios.
- Repair Plan targets carry slide, `qa-fixture-image`, `imageDistortion`, `contain`, zero crop and a bounded aspect-preserving frame.
- The native renderer changes only the named image fit/crop/frame. It does not change Storyline, Slide Plan, CJK text, charts or non-target objects.
- Existing three-pass cap and rollback compare `technical.imageDistortion.score`; unchanged/lower target quality is rejected.

## Real acceptance

Project: `project_3f441b66-7129-422b-874d-a564fd8edbf4` (`acceptance-manifest.json`: `PASS`)

- Real editable 8-slide PPTX generated and reopened successfully.
- 122 native objects plus 1 editable image; native/editable ratio `0.9919`; CJK intact.
- Before: source ratio `1.7778`, display ratio `0.7188`, `stretched_aspect_ratio`, evidence `native-image-metadata, inspect, layout`, image score `0`.
- Repair: frame `{ left: 1000, top: 375.31, width: 230, height: 129.38 }`, fit `contain`, zero crop.
- After: image score `100`, failures `1 -> 0`, repair retained, overall `91 -> 91`.
- Visual inspection confirms the vertically stretched circle becomes circular while all text and other slides remain unchanged.
- Reopened PPTX contains the named native image at the repaired bbox.
- Final general QA remains `REVIEW` only because direction A still has three known contrast warnings and chart-style fidelity is below target; these are unrelated to the image target and were intentionally not changed by this repair.

## Evidence

- `generated/projects/project_3f441b66-7129-422b-874d-a564fd8edbf4/output/final.pptx`
- `generated/projects/project_3f441b66-7129-422b-874d-a564fd8edbf4/output/acceptance-manifest.json`
- `generated/projects/project_3f441b66-7129-422b-874d-a564fd8edbf4/render/repair-backup-1/contact-sheet.webp`
- `generated/projects/project_3f441b66-7129-422b-874d-a564fd8edbf4/render/final/contact-sheet.webp`
- `generated/projects/project_3f441b66-7129-422b-874d-a564fd8edbf4/qa/qa-report-pass-0.json`
- `generated/projects/project_3f441b66-7129-422b-874d-a564fd8edbf4/qa/qa-report-pass-1.json`
- `generated/projects/project_3f441b66-7129-422b-874d-a564fd8edbf4/qa/repair-plan.json`
- `generated/projects/project_3f441b66-7129-422b-874d-a564fd8edbf4/qa/repair-event-1.json`

## Verification

- `pnpm test`: PASS, 31/31.
- `pnpm typecheck`: PASS.
- `pnpm build`: PASS.
- Real PPTX generation: PASS.
- All-slide render/contact sheet: PASS, 8/8.
- Technical QA: PASS for image target (`0 -> 100`).
- Visual QA: PASS for the scoped repair; before/after contact sheets inspected.
- PPTX reopen/inspect: PASS, 8/8 and named image preserved.

## Expected merge conflicts

- `app/api/qa/fix/route.ts`: font-fallback work is expected to add accumulated repair targets. Preserve that implementation and add the `imageDistortion` selection, object-local classification and technical target-score branch.
- `lib/types.ts`, `schemas/qa-report.schema.json`, `schemas/repair-plan.schema.json`: union/schema additions may overlap but are additive.
- `adapters/native-pptx/generate-deck.mjs`: retain both font repair state and `activeImageRepairs`; do not let later repair passes discard previously applied targets.
