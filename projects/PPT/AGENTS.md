# PPT Factory agent rules

These rules apply to the whole repository. A more specific `AGENTS.md` may add
module constraints but cannot weaken these rules.

1. Do not rewrite a working module without documented evidence that `KEEP`,
   `WRAP`, `REFACTOR`, and `MIGRATE` cannot satisfy the task.
2. Read `CURRENT_STATE.md`, `MIGRATION_PLAN.md`, the active task, and relevant
   module code before implementation.
3. Intermediate JSON artifacts are the source of truth. Prompts and PPTX
   binaries are not the only state.
4. `ppt-factory` is the only top-level presentation orchestrator. External
   tools and skills remain adapters or references.
5. Editable PPTX is the default output. Route `Native PPT > SVG > Image`.
6. Keep Chinese/CJK business text, data labels, KPI values, tables and standard
   charts native whenever possible. Never use image-generated business text.
7. The renderer must follow Storyline and Slide Plan; it must not invent a new
   deck narrative.
8. Every renderer change requires a real PPTX generation test and rendered PNG
   previews.
9. Every real PPT test requires technical QA and visual inspection before
   review.
10. Auto Repair is local, produces a repair plan, is capped at three passes and
    rolls back a pass that lowers quality.
11. Do not make unrelated refactors or commit uploads, credentials, generated
    decks, rendered pages, local caches or user data.
12. Read a module-level `AGENTS.md` before changing that module.
13. Large independent tasks use dynamic worktrees named only `feature/*`,
    `fix/*`, `experiment/*`, or `refactor/*`.
14. Before opening a worktree, classify the existing implementation as `DONE`,
    `PARTIAL`, `MISSING`, `BROKEN`, or `UNKNOWN` and avoid duplicate work.
15. Every worktree has one task, runs tests, reviews its diff and produces a
    `RESULT.md` with `PASS`, `PARTIAL`, or `FAIL` plus a merge recommendation.
16. Do not build collaboration, billing, animation, enterprise governance or
    advanced orchestration before the Phase 1 happy path passes.

## Required checks before review

```text
pnpm test
pnpm typecheck
pnpm build              # when application/build behavior changes
real PPTX generation    # when PPT behavior changes
all-slide render
technical QA
visual QA
git diff review
RESULT.md
```

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
