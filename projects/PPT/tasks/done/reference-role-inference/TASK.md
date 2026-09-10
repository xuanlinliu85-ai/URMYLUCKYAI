# TASK — Reference slide role inference

Status: DONE
Branch: `feature/reference-role-inference`
Worktree: `.worktrees/reference-role-inference`

Merged: `8fe549a`

## Classification

`PARTIAL`: new-content slide roles exist, but reference-deck slides are not
semantically classified from their structural and rendered evidence.

## Goal

Implement the first bounded Step 5 capability without replacing the current
OOXML analyzer. Infer a stable semantic role for every reference slide from
existing XML/layout facts plus locally measurable rendered-page evidence, and
persist both the role and explainable evidence/confidence in the reference
analysis/Style DNA artifacts consumed by `ppt-factory`.

The role vocabulary must cover the current Phase 1 reference needs (at least
cover, agenda/section, summary, evidence/data, comparison, process/timeline,
and closing/other) while allowing an honest low-confidence `other` result.

## Constraints

- `ppt-factory` remains the only top-level orchestrator.
- Extend existing contracts and adapters; do not rewrite the project.
- Native PPT remains preferred; do not rasterize source content into output.
- Use deterministic local evidence. No API key, Supabase or semantic vision
  service is required for this task.
- Do not implement layout-family clustering, Golden Slides, V2/V3 modules or a
  second orchestrator in this worktree.
- Preserve compatibility-only behavior: a deck not authorized for style
  learning must not become the active style source.

## Acceptance

- Schema/types/API artifacts persist one role, confidence and evidence list for
  every reference slide, with backward-compatible defaults where needed.
- Unit/contract tests cover representative Chinese and English slide patterns,
  ambiguous pages and determinism.
- Run typecheck and production build.
- Run a lightweight real multi-slide reference-deck acceptance (normally no
  more than 8 slides), produce a role distribution/report and manually
  spot-check representative pages against their contact sheet. The 85-slide
  legacy deck is reserved for milestone regression and must not be rerun for
  ordinary iterations.
- Write `RESULT.md` with PASS/FAIL, evidence paths, limitations and merge advice.
- Commit only source/tests/task artifacts; leave bulky generated probes local
  for the main worktree to archive after review.
