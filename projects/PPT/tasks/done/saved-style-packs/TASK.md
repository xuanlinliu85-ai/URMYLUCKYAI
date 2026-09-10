# TASK — Saved Style Packs

Status: DONE
Merged: `e68e4e3`
Branch: `feature/saved-style-packs`
Worktree: `.worktrees/saved-style-packs`

## Classification

`MISSING`: Advanced Style Mixer persists a complete `STYLE_MIX.json`, and
deterministic semantic search already defines the narrow
`StylePackSearchLibrary` projection, but the repository has no Style Pack
authoring, immutable version model, storage API, or apply path.

## Decision

`WRAP`: preserve the existing Mixer, renderer and local stage storage. Add a
versioned Style Pack artifact and a bounded library/API that snapshots and
re-applies an existing Style Mix. `ppt-factory` remains the sole orchestrator.

## Goal

Implement deterministic local create/list/get/apply operations and safe updates
that append a new immutable semantic version. Persist complete Reference,
System and Prompt provenance, eight-dimension weights, ownership and locks,
plus the final Style DNA and reusable presentation metadata.

## Constraints

- Use existing project-local `style` storage; no cloud, auth, team sharing,
  marketplace, gallery or embeddings.
- Keep the `style-packs.json` projection compatible with deterministic semantic
  search.
- Applying a pack writes the existing `final-style` and `style-mix` contracts;
  it does not create another renderer or orchestrator.
- Never use the 85-page deck and never commit generated artifacts.

## Acceptance

- Versioned schema and TypeScript contract are explicit and validated.
- Create is deterministic/idempotent; conflicting immutable versions fail.
- Update creates a new version without mutating prior versions.
- List/get selection and latest-version resolution are deterministic.
- Apply preserves all eight weights/locks/ownership fields and feeds the
  existing final Style DNA / Style Mix storage boundary.
- Semantic search consumes saved Style Packs without an adapter rewrite.
- `pnpm test`, `pnpm typecheck`, `pnpm build`, `git diff --check` pass.
- Review the diff, produce `RESULT.md`, commit source/tests/task only.
