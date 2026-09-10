# TASK

Execution status: `DONE`
Merged: `1bd6683`

## Goal

Add a bounded local V2 Chart DNA pack layer for reusable native editable charts.

## Current State

Status: `PARTIAL`

The reference analyzer already measures native chart treatment and the native
renderer emits one editable bar-chart treatment. There is no versioned Chart
Pack artifact, deterministic selector, Slide Plan/style reference, or explicit
fallback contract.

## Expected Behavior

The renderer resolves a built-in versioned Chart Pack deterministically, maps
it to the existing native bar-chart options, preserves bound data and CJK, and
records the decision in a machine-readable manifest. Unknown or incompatible
references fall back safely to the restrained business pack.

## Scope

### In scope

- Versioned Chart Pack library/schema and selection manifest
- Restrained business/bar pack and a contrasting signal pack
- Optional Slide Plan and Style DNA pack references
- Deterministic selection, explicit renderer mapping and safe fallback
- Unit, build and real editable PPT acceptance coverage

### Out of scope

- External services, marketplace, embeddings or collaboration
- UI rewrite or a second presentation orchestrator
- New narrative/layout ownership
- Non-native chart rendering

## Inputs

Slide Plan, Style DNA, direction, native chart data and local binding results.

## Outputs

Native editable PPTX charts and `chart-pack-manifest.json`.

## Requirements

- Preserve Storyline and Slide Plan content/data ownership.
- Keep business text and chart labels native; preserve CJK.
- Route Native PPT before SVG/Image.
- Never invent or mutate chart values.

## Edge Cases

- Missing pack reference
- Unknown pack id/version
- Pack unsupported by the current native chart type
- Chartless slides

## Acceptance Criteria

- Deterministic built-in pack selection and stable fallback
- At least two visibly different native chart packs
- Two real PPTX outputs, no more than eight slides each
- Reopen/native-chart/CJK/data-preservation checks pass
- Full render, technical QA and visual inspection pass

## Visual Acceptance

Compare all rendered slides for restrained-light versus contrasting-dark chart
treatment, checking legibility, hierarchy, CJK, labels and slide bounds.

## Deliverables

Source, schemas, tests, acceptance runner, local evidence, diff review and
`RESULT.md`.

## Worktree

- Branch: `feature/chart-packs-core`
- Path: `.worktrees/chart-packs-core`
