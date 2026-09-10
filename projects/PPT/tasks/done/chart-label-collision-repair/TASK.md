# TASK — Chart label collision local repair

Status: DONE
Branch: `fix/chart-label-collision-repair`
Worktree: `.worktrees/chart-label-collision-repair`

Merged: `556dba6`
Handoff: acceptance evidence archived under `generated/showcase/chart-label-collision-repair/`.

## Classification

`PARTIAL`: the native renderer already emits a simple editable bar chart with
value labels, but Technical QA does not measure chart-label collision or bounds,
and Auto Fix has no chart-object target or chart-label-only mutation path.

## Goal

Incrementally extend Step 4 with chart-label collision/bounds measurement and
object-local repair. Persist slide/object/dimension targets, alter only the
target native chart's label position/font/display strategy, compare the target
technical score after rerendering, and roll back when it does not improve.

## Non-goals

- No storyline, data, chart-type or chart-position changes.
- No rasterized business chart or labels.
- No Step 5 / Golden Slides work.
- No new top-level orchestrator.

## Acceptance

- Unit/contract tests, typecheck and build pass.
- A dedicated real editable PPTX contains a reproducible label collision.
- All slides render; technical QA identifies slide and chart object.
- Repair Plan changes only native chart label properties.
- Target score improves or the pass rolls back with attempt evidence retained.
- Visual inspection confirms chart data, chart type and layout are unchanged.
- `RESULT.md` recommends merge status.
