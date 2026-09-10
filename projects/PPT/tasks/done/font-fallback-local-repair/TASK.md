# TASK — Font Fallback Local Repair

## Goal

Continue MIGRATION_PLAN Step 4 in documented order by comparing requested and
resolved typefaces from persisted native-render evidence, identifying CJK font
substitution or missing-glyph risk, and repairing only affected native text.

## Current State

- Status: `DONE`
- Classification: `PARTIAL`
- Contrast and typography local repair already use object-level targets and
  target-score rollback.
- Font substitution remains a shallow technical-QA gap.

## Scope

### In scope

- Persist requested/applied typeface evidence per native text object
- Compare renderer evidence with final layout-resolved typefaces and inspect IDs
- Flag requested/resolved mismatch, unsafe CJK typefaces and replacement glyphs
- Emit slide/object/`fontFallback` targets with a safe CJK replacement
- Change only target-object typeface; preserve text, size, color and geometry
- Reuse the three-pass cap and target-score rollback
- Real PPTX generation, all-slide render, technical QA and visual QA

### Out of scope

- Image distortion and chart-label collision
- Whole-deck typography redesign
- Step 5 Reference Learner or Golden Slides
- External font services or vision APIs

## Acceptance Criteria

- QA persists requested, applied and resolved typefaces with inspect/layout evidence.
- `REPAIR_PLAN.json` names slide, object and `fontFallback` dimension targets.
- Renderer applies a safe CJK typeface only to named targets.
- Target text, font size, color and geometry remain unchanged.
- Font-fallback score improves, or rollback is proven.
- CJK text, editability and PPTX reopen remain valid.

## Worktree

- Branch: `fix/font-fallback-local-repair`
- Path: `.worktrees/font-fallback-local-repair`

## Verification

- Tests: 30 passed
- TypeScript: passed
- Production build: passed
- Real acceptance: `project_e7762e9b-ec71-4b7b-8d32-5901098e278f` — PASS
- Font fallback: 0 → 100; failing CJK objects: 44 → 0
- Contrast: 95.5 → 100; both repairs retained across two passes
- QA overall: 88 → 93; readability: 70 → 96
- 44/44 targets changed typeface only; text, geometry, font size and color preserved
- Final/reopened slides: 8 / 8; editability ratio 1.0; CJK intact
- Merged to master and evidence archived under
  `generated/showcase/font-fallback-local-repair/`
