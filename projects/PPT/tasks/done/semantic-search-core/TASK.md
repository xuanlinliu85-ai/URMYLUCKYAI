# TASK — Semantic search core

Status: DONE
Merged: `630bca7`
Classification: `MISSING`
Branch: `feature/semantic-search-core`
Worktree: `.worktrees/semantic-search-core`

## Evidence and migration decision

The repository has a working Golden Slide library and a purpose-specific
`retrieveGoldenSlide` function, but no shared semantic-search index, query
contract, Style Pack search document, persisted search artifact, or search API.
The existing Golden Slide scorer/retriever remains working and is not rewritten.
This task uses `WRAP`: eligible Golden Slide metadata is projected into a local
search index, and versioned Style Pack metadata can enter through a narrow JSON
contract when present.

## Scope

- Deterministic local semantic search over persisted Golden Slides and optional
  current/future Style Packs.
- Structured matching for tags, role, layout family, density, chart need,
  style identity and audience.
- Explainable dimension scores, stable ordering, threshold fallback and bounded
  result limits.
- A hard compatibility-only boundary: such references never become searchable
  Golden Slides.
- Persist the search index and latest query result as intermediate JSON artifacts.
- Add schemas, API/library contracts, tests and a bounded real-artifact search
  acceptance.

## Out of scope

- Embeddings, vector databases, external APIs or credentials.
- Gallery, marketplace or collaboration features.
- Style Pack authoring UI or cloud persistence.
- Changes to storyline, Slide Plan, native renderer or PPTX content.
- A second top-level orchestrator.

## Acceptance

- `pnpm test`
- `pnpm typecheck`
- `pnpm build`
- Real local project artifacts containing eligible Golden Slides and a versioned
  Style Pack produce deterministic ranked results and persisted index/result JSON.
- Compatibility-only Golden Slides are absent from results.
- Diff review and `RESULT.md` with merge recommendation.

PPT regeneration is not required because this task only reads metadata and
writes JSON search artifacts; it does not alter PPTX generation or rendering.

## Review evidence

- Post-rebase `pnpm test`: PASS, 75/75, including Advanced Mixer and Data Binding coverage.
- `pnpm typecheck`: PASS.
- `pnpm build`: PASS; `/api/search/semantics` is present in the production route table.
- `node scripts/run-semantic-search-acceptance.mjs`: PASS with three persisted
  documents and deterministic results (`style_pack` 95, Golden data slide 84.28).
- Compatibility-only blocking: PASS in unit coverage; zero Golden documents.
- Generated acceptance artifacts remain Git-ignored and are not part of review.
- Rebased cleanly onto master `d136070`; the mixer/data-binding contracts and
  semantic-search contracts coexist without conflict.
