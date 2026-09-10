# PPT Factory worktree layout

`master` is the Phase 1 integration line. Product orchestration remains in the
single top-level `.codex/skills/ppt-factory` skill; worktrees split code
ownership, not product authority.

| Worktree | Branch | Ownership |
| --- | --- | --- |
| None | — | New worktrees are created dynamically per active task |

The V1 Happy Path and long-deck contact-sheet branches were merged into
`master` after PASS results. Their tasks are archived under `tasks/done/`.
All completed/empty worktrees were removed on 2026-08-22 after their ignored
PPT and render evidence was copied into the main workspace. Future worktrees are
created dynamically per task.

## Integration rules

1. Each worktree changes only its owned module plus directly related tests.
2. Intermediate JSON contracts in `schemas/` and `lib/types.ts` are reviewed on
   `master` before two modules depend on them.
3. Generated decks, uploaded documents, rendered PNGs and local credentials are
   never committed.
4. Every branch must pass `pnpm test` and `pnpm typecheck` before merge.
5. Merge order is dependency-driven and each task must independently reach its
   acceptance gate.
6. External slide tooling stays behind `adapters/`; it cannot become a second
   top-level orchestrator.

## Current Phase 1 evidence

- The 85-slide WPS regression deck renders end-to-end after normalizing 48
  negative chart-axis identifiers in a render-only copy.
- The user's source file is not modified and is not used as a style template
  unless style learning is explicitly enabled.
- System style presets support a general professional baseline and an optional
  bank-internal-report scenario.
