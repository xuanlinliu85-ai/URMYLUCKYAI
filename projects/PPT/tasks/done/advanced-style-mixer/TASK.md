# TASK — Advanced Style Mixer

Status: DONE
Merged: `8a560dc`
Branch: `feature/advanced-style-mixer`
Worktree: `.worktrees/advanced-style-mixer`

## Classification

`PARTIAL`: `mixStyle()` combines one reference with global strength, a few
sliders and three locks. Prompt/System provenance, per-dimension source weights
and the full eight fidelity locks are missing.

## Goal

Incrementally extend Style Mixer to combine Reference Style, deterministic
Prompt Style, System Style, slider overrides and per-dimension locks for:
Typography, Color, Layout, Chart, Density, Composition, Storytelling and Visual
Tone. Persist all source IDs, weights, locks, resolved dimension ownership and
the final Style DNA in `STYLE_MIX.json`.

Add a bounded local Prompt Style Interpreter for common Chinese/English
professional style phrases. It must produce structured Prompt Style DNA and
honestly leave unknown intent neutral; no model/API key is required.

## Constraints

- Keep existing Phase 1 controls and three-lock UI backward-compatible.
- Advanced controls may be progressive/optional; do not turn the page into a
  parameter-heavy admin panel.
- `ppt-factory` remains the only top-level orchestrator.
- Locks survive preview regeneration and full-deck generation; unlocked
  dimensions follow documented weighted mixing.
- Do not implement saved Style Packs, Golden Slides, preference learning,
  collaboration or cloud storage in this worktree.
- No 85-page run. Real acceptance uses <=8 slides.

## Acceptance

- Types/schemas/API/UI persist Reference/System/Prompt sources, eight dimension
  weights, locks and resolved ownership with legacy defaults.
- Tests prove locked dimensions remain unchanged, unlocked dimensions respond
  to weights/sliders, prompt interpretation is deterministic and unknown terms
  stay neutral.
- A/B/C previews remain composition-level distinct.
- `pnpm test`, `pnpm typecheck`, `pnpm build` pass.
- Generate two <=8-slide editable outputs from the same material with materially
  different mixer settings; fully render, run technical QA and visually verify
  the intended unlocked change while locked dimensions remain stable.
- Review diff, complete `RESULT.md`, commit source/tests/task only.
