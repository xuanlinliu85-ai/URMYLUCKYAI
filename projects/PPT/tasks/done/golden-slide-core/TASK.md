# TASK — Golden Slide core

Status: DONE
Merged: `f5f5946`
Branch: `feature/golden-slide-core`
Worktree: `.worktrees/golden-slide-core`

## Classification

`MISSING`: Slide Plan exposes `golden_slide` as a layout-source enum, but the
repository has no Golden Slide schema, candidate scorer, persisted library,
retriever or explainable fallback path.

## Goal

Implement the first bounded V2 Golden Slide core on top of completed reference
roles, semantic layout families and style measurements. Score reusable
reference-slide candidates across layout quality, clarity, reusability, style
representativeness, hierarchy and balance; persist `GOLDEN_SLIDES.json`; retrieve
role/layout/density/chart-compatible candidates with explainable scores; and let
Slide Plan select `golden_slide` only above a documented threshold, otherwise
fall back to `generative_layout`.

## Constraints

- `ppt-factory` remains the only top-level orchestrator.
- WRAP existing analyzer/Style DNA/Slide Plan; do not build a Gallery,
  marketplace, semantic embeddings or a second renderer.
- Preserve Storyline as narrative source of truth.
- Candidate and retrieval decisions must be deterministic JSON artifacts.
- A Golden result may reference source slide/layout evidence, but final output
  remains editable Native PPT; do not rasterize source business content.
- Compatibility-only references may be analyzed but must not activate or feed
  Golden retrieval unless style learning was explicitly enabled.
- No external API or Supabase. Acceptance uses <=8 pages; never run 85 pages.

## Acceptance

- Add validated Golden Slide candidate/library/retrieval contracts and storage.
- At least one high-quality page in the fixed <=8-slide sample becomes a
  candidate with explainable dimension scores; low-quality/low-match cases
  fall back to `generative_layout`.
- Slide Plan persists optional Golden ID/evidence without changing Storyline.
- Tests cover scoring determinism, thresholding, role/layout/chart/density
  compatibility, compatibility-only boundary and fallback.
- `pnpm test`, `pnpm typecheck`, `pnpm build` pass.
- Generate and fully render one real editable <=8-slide PPTX using a Golden
  selection where eligible; run technical QA and visually inspect all slides.
- Review diff, write complete `RESULT.md`, commit source/tests/task only.
