# TASK — Long-deck Contact Sheet

## Goal

Integrate and verify the compact numbered contact-sheet renderer for short,
normal and long PowerPoint decks without changing PPT Factory orchestration.

## Status

`PASS`

## Scope

- Dynamic 3/4/5-column contact-sheet grids
- Small page-number overlays for review navigation
- Unit contract test
- Real 85-slide WPS regression rendering
- Short-deck regression using the final V1 acceptance output

## Out of scope

- Slide generation, Storyline or Style DNA changes
- Long-image export
- UI redesign
- V2/V3 modules

## Acceptance criteria

- Existing test suite, typecheck and production build pass
- 3-slide preview remains legible
- 8-slide output remains legible
- 85-slide reference renders completely to a materially shorter contact sheet
- Every tile has a zero-padded page label
- Source PPTX remains unchanged

## Worktree

- Branch: `feature/render-qa`
- Path: `.worktrees/render-qa`
