# TASK — Typography Local AutoFix

## Goal

Complete MIGRATION_PLAN Step 4 for the first measured failure by turning
`fidelity-typography` into a bounded object-level repair that improves the
typography dimension without regenerating storyline, color, layout or charts.

## Current State

- Status: `DONE`
- Measured Reference Fidelity is operational.
- The real acceptance deck isolates typography at 59 / target 70.
- Repair Plan exists but renderer actions remain mostly global.

## Expected Behavior

AutoFix persists the failed dimension, affected native object families and a
bounded typography profile. The native renderer applies it only to those text
objects, rerenders the deck, reruns QA and keeps the pass only if the score
improves; otherwise it rolls back.

## Scope

### In scope

- Add dimension/object targets to QA issues and Repair Plan
- Derive a bounded title/display typography adjustment from measured evidence
- Apply repair only to named native text families in the renderer
- Preserve typography locks and all non-typography controls
- Real before/after PPTX, render, QA and rollback verification

### Out of scope

- Color/layout/chart AutoFix
- Storyline or content regeneration
- Golden Slides and Step 5 Reference Learner work
- External AI or vision API

## Acceptance Criteria

- `REPAIR_PLAN.json` names `typography` and target object families.
- No global airiness/visualWeight change is used for typography-only repair.
- The renderer consumes the persisted repair target.
- Non-target text sizes and all colors/layout coordinates remain unchanged.
- Typography fidelity or overall QA improves; otherwise rollback is proven.
- Pass cap remains three; CJK/editability and real PPTX reopening pass.

## Worktree

- Branch: `fix/typography-local-autofix`
- Path: `.worktrees/typography-local-autofix`

## Verification

- Tests: 22 passed
- TypeScript: passed
- Production build: passed
- Normal acceptance: `project_d8fd39d6-604a-4724-8c77-ba1c98cee29e` — PASS
- Strict typography-lock exercise: `project_6f39296c-09d6-4e15-95dc-1231dae820b5`
- Repair target consumed: cover title 46 → 43 in retained attempt
- Target dimension did not improve, so rollback executed and original restored
- Final/reopened slides: 8 / 8; editability ratio 1.0; CJK intact
- Merged to master and evidence archived under
  `generated/showcase/typography-local-autofix/`
