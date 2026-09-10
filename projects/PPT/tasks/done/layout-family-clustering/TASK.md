# TASK — Semantic layout-family clustering

Status: DONE
Branch: `feature/layout-family-clustering`
Worktree: `.worktrees/layout-family-clustering`

Merged: `dc6ac4a`

## Classification

`PARTIAL`: reference analysis stores slide-layout relationship targets and now
infers semantic slide roles, but it does not group pages into reusable semantic
layout families.

## Goal

Extend the existing reference analyzer with deterministic semantic layout-family
classification using slide roles, normalized object geometry, native object
types and optional rendered-page evidence. Persist one family, confidence and
explainable evidence per slide plus deck-level family summaries in
`reference-analysis.json` and reference Style DNA.

Required Phase 1 families include at least `COVER`, `SECTION`, `EXEC_SUMMARY`,
`DATA_LEFT_TEXT_RIGHT`, `TEXT_LEFT_DATA_RIGHT`, `FULL_CHART`, `FULL_TABLE`,
`BIG_NUMBER`, `TWO_COLUMN`, `HERO_IMAGE`, `COMPARISON`, `PROCESS_TIMELINE`, and
honest `OTHER`.

## Constraints

- WRAP/extend the existing analyzer; do not rewrite it.
- Consume the merged reference-role evidence; do not reimplement role inference.
- `ppt-factory` remains the only top-level orchestrator.
- Preserve compatibility-only style activation behavior.
- Do not implement Golden Slide scoring/retrieval or renderer templates here.
- No external service. Ordinary real acceptance is limited to <=8 slides; do
  not rerun the 85-slide legacy deck.

## Acceptance

- Deterministic family classification and aggregation with confidence/evidence.
- Types/schemas/API/Style DNA persist the new intermediate artifacts with
  backward-compatible optional/default consumption.
- Tests cover Chinese business data/table pages, left/right compositions,
  hero image, section, process, ambiguous and deterministic cases.
- `pnpm test`, `pnpm typecheck`, `pnpm build` pass.
- One real editable <=8-slide PPTX is fully rendered and representative family
  assignments are visually checked against its contact sheet.
- Diff review and complete `RESULT.md`; commit source/tests/task only.
