# TASK — Visual Quality Gate

## Goal

Turn the Phase 1 output from a technically valid prototype into a visually
credible professional business deck while keeping native editability and the
single `ppt-factory` orchestrator.

## Status

`DONE`

## User finding

The current generated PPT is visually unattractive. Technical QA scores do not
adequately capture this defect.

## Diagnosed baseline problems

- Flat grey background and muddy palette in selected direction B
- Coarse typography and weak information hierarchy
- Character-count charts presented as if they were business evidence
- Repeated split-column compositions and weak page rhythm
- Sparse pages without meaningful visual structure
- Technical QA conflates correctness with aesthetic quality

## Scope

- Improve typography scale, spacing, palette and composition rhythm
- Use extracted numeric business data instead of character counts
- Add native KPI, comparison and decision layouts
- Keep all CJK business text and charts editable
- Add visual-quality contract checks that catch known ugly defaults
- Regenerate A/B/C previews and one complete direction-B deck

## Out of scope

- V2/V3 features, Golden Slides, collaboration or cloud storage
- Image-heavy beautification
- Using the user's 85-slide practice deck as a style template

## Acceptance criteria

- A/B/C remain compositionally distinct
- No character-count chart or explanatory copy remains
- Direction B is not a full-deck flat-grey treatment
- At least four composition families across an 8-slide deck
- Numeric material evidence appears in native KPI/chart components
- Final PPTX reopens with at least 80% editable normal business objects
- CJK text intact; no overflow or critical QA issue
- User-facing contact sheet is visually reviewed, not accepted by score alone

## Worktree

- Branch: `feature/visual-quality-gate`
- Path: `.worktrees/visual-quality-gate`

## Verification

- Unit/contract tests: 15 passed
- TypeScript: passed
- Production build: passed
- Real acceptance project: `project_b1f1b796-a3d0-4a3d-9f3c-13e3649e286a`
- Acceptance status: PASS
- Native editability ratio: 1.0
- Reopened slides: 8 / 8
- Visual QA: 91 overall, 96 readability
