# TASK — Reference style measurements

Status: DONE
Branch: `feature/reference-style-measurements`
Worktree: `.worktrees/reference-style-measurements`

Merged: `95f3aa9`

## Classification

`PARTIAL`: the analyzer already extracts aggregate fonts, colors, positions,
charts and images, but Style DNA lacks measured per-slide typography hierarchy,
density, whitespace and chart-treatment evidence.

## Goal

Extend the existing reference analyzer and Style DNA contracts with deterministic,
explainable measurements for title/body/caption/KPI typography, information and
visual density, whitespace/occupied-area ratios, and native chart treatment.
Persist the measurements as intermediate JSON evidence consumed by
`ppt-factory`; do not replace the analyzer.

## Scope and constraints

- `ppt-factory` remains the only top-level orchestrator.
- Use OOXML plus locally available rendered/layout evidence where appropriate.
- Preserve compatibility-only versus learn-style activation behavior.
- Backward-compatible optional/default fields for older artifacts.
- Do not implement slide-role inference, layout-family clustering, Golden
  Slides, prompt style interpretation, renderer components or V2/V3 UI here.
- No external API, Supabase or vision model.
- Ordinary acceptance uses no more than 8 slides; do not rerun the 85-slide deck.

## Acceptance

- Types and schemas persist explainable measurement summaries and per-slide
  evidence without breaking old artifacts.
- Tests cover Chinese/CJK sizes, title/body separation, sparse/dense pages,
  whitespace bounds and chart-treatment defaults.
- `pnpm test`, `pnpm typecheck`, and `pnpm build` pass.
- A real editable <=8-slide PPTX is rendered fully and its measurement report
  is visually spot-checked against the contact sheet.
- `RESULT.md` contains PASS/PARTIAL/FAIL and merge recommendation.
- Commit source/tests/task only; leave generated probes uncommitted.
