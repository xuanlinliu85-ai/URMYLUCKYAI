# TASK — Long-image export adapter

Status: DONE
Merged: `d786445`
Branch: `feature/long-image-export`
Worktree: `.worktrees/long-image-export`

## Classification

`MISSING`: contact-sheet composition exists, but there is no user-facing,
validated long-image export for selected rendered slides.

## Goal

WRAP the existing Sharp/render pipeline with a deterministic export that takes
selected rendered slides in explicit order and produces:

- a 9:16 presentation-friendly PNG; and
- a 2160px-wide high-resolution vertical PNG.

Persist `LONG_IMAGE_MANIFEST.json` with source slides, order, dimensions,
scaling, gutters, background and output paths.

## Constraints

- Export only existing rendered PNGs; do not change PPTX or Storyline.
- Preserve aspect ratio, CJK legibility and slide order. No silent cropping.
- Validate page selection and reject missing/out-of-range slides.
- Keep contact-sheet behavior unchanged.
- No external service or 85-page run. Acceptance uses exactly 3 selected pages
  from an existing <=8-slide render.

## Acceptance

- Add bounded adapter/API/schema and deterministic tests for ordering,
  dimensions, aspect ratio, error handling and manifest persistence.
- `pnpm test`, `pnpm typecheck`, `pnpm build` pass.
- Export both variants from 3 real rendered pages and visually inspect at full
  resolution for clipping, distortion, order and CJK clarity.
- Review diff, write `RESULT.md`, commit source/tests/task only; generated PNGs
  remain uncommitted.
