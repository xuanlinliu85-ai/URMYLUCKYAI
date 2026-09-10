# RESULT — Chart label collision local repair

Status: PASS / MERGED
Recommendation: COMPLETE; accumulated object-local repair behavior was preserved during integration.

## Outcome

- Added `technical.chartLabelCollision` as an extension beside the existing
  `technical.contrast` report.
- Native chart generation now persists `ppt-factory/chart-labels/v1` metadata
  in each slide layout JSON: chart/object identity, chart and plot geometry,
  categories, series, scale and data-label policy.
- Technical QA estimates native column-chart label boxes, detects label-label
  intersections and chart-frame overflow, and emits one slide/object target per
  failing chart with dimension `chartLabelCollision`.
- Auto Fix keeps the repair object-local and compares the chart-label technical
  score. An unchanged/lower target score uses the existing retained-attempt and
  rollback path.
- The native renderer changes only the named chart's data-label font size,
  position or display strategy. It does not change data, chart type, chart
  geometry or Storyline/Slide Plan.

## Real PPTX acceptance

Project: `project_9a0d3269-3455-4cc2-a00e-97d8a32bf664`

- Dedicated editable one-slide PPTX with six crowded native column labels.
- Before: 1 chart / 6 labels checked, 6 failing, technical score 0.
- Repair target: slide 1, `metric-rate-chart`, `chartLabelCollision`.
- Applied policy: label font 48 -> 14, retained `outEnd` display and all values.
- After: 0 failing labels, technical score 100, QA overall 92, status PASS.
- Data/categories unchanged: PASS.
- Chart type unchanged (`bar` with column direction): PASS.
- Chart bbox unchanged: PASS.
- Final PPTX reopened 1/1; native chart and intact CJK confirmed.
- Visual inspection: before labels visibly overlap and breach the chart top;
  after labels are separated, legible, and remain above their original bars.

Archived acceptance evidence:

- `generated/showcase/chart-label-collision-repair/output/final.pptx`
- `generated/showcase/chart-label-collision-repair/output/chart-label-acceptance-manifest.json`
- `generated/showcase/chart-label-collision-repair/render/before/contact-sheet.webp`
- `generated/showcase/chart-label-collision-repair/render/after/contact-sheet.webp`
- `generated/showcase/chart-label-collision-repair/render/reopened/contact-sheet.webp`
- `generated/showcase/chart-label-collision-repair/qa/`

## Checks

- `pnpm test`: PASS, 29/29.
- `pnpm typecheck`: PASS.
- `pnpm build`: PASS.
- Real native PPTX generation: PASS.
- All-slide render and contact sheet: PASS, 1/1.
- Technical QA: PASS after repair.
- Visual QA: PASS by manual before/after inspection.
- Reopen/native chart/CJK: PASS.
- `git diff --check`: PASS (line-ending warnings only).

## Integration notes

This branch started at `a9a9fa0`, so the following files are expected merge
hotspots with the font-fallback and image-distortion worktrees:

- `lib/types.ts`
- `adapters/visual-qa/index.ts`
- `app/api/qa/fix/route.ts`
- `adapters/native-pptx/generate-deck.mjs`
- `schemas/qa-report.schema.json`
- `schemas/repair-plan.schema.json`

In particular, do not overwrite newer multi-pass logic that accumulates already
applied object-local repair targets. Keep that newer behavior, add
`chartLabelCollision` to its technical score dispatch and object-local target
set, and retain this branch's chart metadata/detector/renderer policy.
