# TASK — Reproducible data binding core

Status: DONE
Merged: `9cc33e5`
Branch: `feature/data-binding-core`
Worktree: `.worktrees/data-binding-core`

## Classification

`MISSING`: Business metrics and native chart data exist, but there is no stable
placeholder contract, JSON/CSV binding input, binding manifest or reproducible
text/chart substitution path.

## Goal

Add a bounded local data-binding pipeline:

`JSON/CSV input -> normalized binding map -> {{path}} placeholders in Slide
Plan -> native text and native chart values -> BINDING_MANIFEST.json`.

The same inputs must yield the same resolved text/chart data. Missing or invalid
bindings must be reported explicitly and must never silently invent numbers.

## Constraints

- Extend Content Analysis, Slide Plan and the native renderer; do not replace
  Storyline or let bindings invent narrative.
- Keep Chinese/CJK labels, KPI values and charts native/editable.
- Support JSON and simple CSV first. XLSX and live external sources remain
  later adapters.
- Persist source provenance, resolved keys, unresolved keys, target slide/object
  and a deterministic input hash in `BINDING_MANIFEST.json`.
- Compatibility with decks/projects that contain no bindings.
- No Supabase/API key. No 85-page run; acceptance <=8 slides.

## Acceptance

- Types/schemas/API accept JSON/CSV bindings and Slide Plan binding targets.
- Native renderer resolves named text and chart series/category bindings while
  preserving chart type, geometry and editability.
- Tests cover nested JSON, CSV headers/rows, CJK keys, numeric parsing,
  determinism, missing bindings and no-binding compatibility.
- `pnpm test`, `pnpm typecheck`, `pnpm build` pass.
- Generate a real editable <=8-slide PPTX with at least one bound KPI and one
  bound native chart; rerun with identical inputs and compare manifest/data;
  fully render and run technical/visual QA.
- Review diff, complete `RESULT.md`, commit source/tests/task only.
