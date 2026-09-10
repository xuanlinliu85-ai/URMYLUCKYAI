# RESULT — Long-image export adapter

Status: PASS
Recommendation: COMPLETE

Merged to `master`: `d786445`

## Summary

- Wrapped the existing rendered-PNG/Sharp pipeline without changing PPTX,
  Storyline, Slide Plan or contact-sheet behavior.
- Added ordered 1–8 slide export to fixed 1080×1920 9:16 PNG and dynamic-height
  2160px-wide PNG.
- Every slide is resized proportionally with `contain`; manifest placements
  record `cropped: false` and preserve explicit input order.
- Added `/api/export/long-image` and file URLs for both variants and the
  persisted `LONG_IMAGE_MANIFEST.json`.
- Added validation for duplicate, invalid and missing slide selections and
  bounded render-set selection (`final` or `reference`).

## Files changed

- `adapters/native-pptx/long-image.mjs`
- `adapters/native-pptx/long-image.d.mts`
- `app/api/export/long-image/route.ts`
- `schemas/long-image-manifest.schema.json`
- `scripts/run-long-image-acceptance.mjs`
- `tests/long-image-export.test.mjs`
- task/result documents

## Checks

- `pnpm test`: PASS, 55/55.
- `pnpm typecheck`: PASS.
- `pnpm build`: PASS; `/api/export/long-image` is present in the production
  route table.
- Schema parse/contract tests: PASS.
- `git diff --check`: PASS after final review.

## Real artifact acceptance

- Source: existing editable 8-slide acceptance project
  `project_8effec2a-4629-4945-b65c-41c4b6a0947c`, slides 1, 4 and 7.
- No PPTX regeneration was necessary because this adapter consumes already
  rendered pages and cannot mutate the deck.
- 3/3 source PNGs found in the 8-slide render; the 85-slide deck was not run.
- 9:16 output: 1080×1920, slide order `1,4,7`, no crop or distortion.
- High-resolution output: 2160×3642, slide order `1,4,7`, no crop or distortion.
- Aspect-ratio check: PASS for every placement in both variants.
- Existing source technical QA: PASS, editable ratio 1.0 and intact CJK.
- Visual QA: both full-resolution outputs inspected; Chinese text, page order,
  whitespace, gutters and slide edges are intact with no clipping or stretching.

Generated probes remain uncommitted under
`generated/probes/long-image-export/`.

## Risks / known limits

- This slice exposes the API and manifest contract but does not add a dedicated
  UI chooser; a later UI task can call the endpoint without changing the
  adapter.
- The 9:16 variant scales down when many pages are selected, so 1–3 pages are
  recommended for readable social/presentation output. The 2160px variant is
  the loss-minimizing choice for larger selections.
- The adapter requires pre-rendered PNGs and deliberately does not render or
  alter PPTX files itself.

## Next step

Merge as an independent V2 capability. Keep it separate from Golden Slides,
Style Mixer, data binding and future UI/gallery work.
