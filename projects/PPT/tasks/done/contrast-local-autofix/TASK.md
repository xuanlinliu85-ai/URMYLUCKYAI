# TASK — Rendered Contrast Local AutoFix

## Goal

Continue MIGRATION_PLAN Step 4 in documented order by measuring text/background
contrast from persisted render evidence, emitting object-level repair targets,
and applying bounded native color repair without changing storyline, layout,
typography, charts, or unrelated objects.

## Current State

- Status: `DONE`
- Classification: `PARTIAL`
- Rendered fidelity and typography-local repair are operational.
- Technical QA currently lists contrast as shallow and does not persist
  rendered contrast evidence at the failing object level.

## Expected Behavior

QA records the failing slide/object, foreground/background evidence, measured
contrast ratio and required threshold. AutoFix changes only the named native
text object's color, rerenders, reruns QA, and keeps the pass only when the
target contrast score improves; otherwise it retains evidence and rolls back.

## Scope

### In scope

- Measure contrast for native text against its local rendered/background color
- Persist slide/object/dimension targets and bounded replacement colors
- Apply color repair only to named native text objects
- Preserve storyline, geometry, typography, charts and non-target colors
- Real PPTX generation, all-slide render, technical QA, visual QA and rollback

### Out of scope

- Font fallback, image distortion and chart-label collision
- Whole-deck color regeneration or palette redesign
- Step 5 Reference Learner and Golden Slides
- External vision/API dependencies

## Acceptance Criteria

- QA report persists contrast ratio, threshold and object target evidence.
- `REPAIR_PLAN.json` names `contrast`, slide and native object targets.
- Renderer consumes a bounded foreground-color adjustment only for targets.
- Non-target colors and all geometry/font sizes remain unchanged.
- Target contrast score improves or rollback is proven.
- Three-pass cap, CJK, editability and real PPTX reopening remain valid.

## Worktree

- Branch: `fix/contrast-local-autofix`
- Path: `.worktrees/contrast-local-autofix`

## Verification

- Tests: 26 passed
- TypeScript: passed
- Production build: passed
- Real acceptance: `project_1c9074d9-259e-422d-b203-0c404bf87989` — PASS
- Contrast score: 95.5 → 100; failing objects: 29 → 0
- QA overall: 88 → 93; no rollback required
- All 29 targets changed color only; geometry, font size and text were preserved
- Final/reopened slides: 8 / 8; editability ratio 1.0; CJK intact
- Merged to master and evidence archived under
  `generated/showcase/contrast-local-autofix/`
