# RESULT — Explicit Preference Events

## Task

Implement the local V2 explicit preference-event foundation for Golden Slides
and saved Style Packs, with no automatic design learning.

## Status

`PASS / COMPLETE`

Merged to `master`: `dda5a36`

## Summary

Added deterministic project-local `favorite`, `use` and `reject` events,
validated exact subject/version references, idempotent append semantics,
explainable aggregate profiles, a local query/append API and an optional search
ranking signal. Preference ranking is neutral by default and never modifies a
Style Mix, Slide Plan, renderer input or PPTX.

## Files Changed

- `lib/preference-events.ts`
- `lib/semantic-search.ts`
- `app/api/preferences/events/route.ts`
- `app/api/search/semantics/route.ts`
- `schemas/preference-events.schema.json`
- `tests/preference-events.test.mjs`
- `scripts/run-preference-events-acceptance.mjs`
- `tasks/active/preference-events/TASK.md`
- `tasks/active/preference-events/RESULT.md`

## Architecture Changes

- Added a versioned journal (`ppt-factory/preference-event-journal/v1`) and
  aggregate profile (`ppt-factory/preference-profile/v1`) under the existing
  artifact-first architecture.
- Kept `ppt-factory` as the only top-level orchestrator.
- Wrapped deterministic semantic search with an optional signal rather than
  changing the search index or adding another orchestration layer.
- Kept the scope explicitly local (`local-project-user-placeholder`) and made
  no authentication, cloud or team-storage claim.

## Implementation

- Event IDs are SHA-256-derived from scope and canonical event payload.
- Sequence, event ID, action, subject and idempotency-key integrity are checked
  whenever the journal is read or appended.
- Identical idempotency retries are no-ops; conflicting payloads return a
  conflict.
- Golden subjects require an eligible candidate in a learn-style v1 library;
  Style Pack subjects require an exact active immutable version.
- Aggregate evidence records action counts, fixed weights (`+3`, `+1`, `-4`),
  weighted total and bounded signal.
- Search scores change by at most 10 points only with
  `preferenceRanking: "explicit"`; default and explicitly neutral calls retain
  the pre-preference score and ordering.
- Profile policy explicitly persists `automaticDesignChanges: false`.

## Tests

- `pnpm test`: `PASS` — 90/90.
- `pnpm typecheck`: `PASS`.
- `pnpm build`: `PASS`; `/api/preferences/events` is present in the production
  route manifest.
- Feature coverage includes all actions, deterministic replay, same/different
  idempotency payloads, tamper detection, local-scope isolation, inactive or
  ineligible references, exact versions and neutral/explicit ranking behavior.

## PPT Test

Not required. This worktree does not change Slide Plans, native PPT objects,
the renderer or generated deck behavior.

## Render Test

Not required for the same reason; no 85-page or other deck regeneration ran.

## Visual QA

Not applicable. There is no UI or rendered-output change.

## Bounded Artifact Acceptance

- `scripts/run-preference-events-acceptance.mjs`: `PASS`.
- Persisted and re-read three events covering `favorite`, `use` and `reject`.
- Confirmed identical replay did not append.
- Confirmed profile round-trip, no automatic design changes, default-neutral
  search and explicit preference evidence.
- Local ignored evidence:
  `generated/probes/preference-events/acceptance.json` plus journal/profile JSON.

## Known Issues

- This slice intentionally has no UI control; callers use the local API.
- A single placeholder user scope is local only. Authenticated multi-user and
  team storage remain deferred until credentials are actually required.
- Automatic learning from manual PPT edits remains out of scope.

## Risks

- Consumers opting into preference ranking should retain the exact subject
  version in their event; immutable version references are deliberate.
- Search adjustment weights are a transparent local v1 policy and may require
  later product calibration, but cannot affect default ranking.

## Regression Risk

Low. Existing search indexing and default score formula are unchanged; new
ranking behavior requires explicit opt-in. No PPT pipeline module changed.

## Recommendation

`COMPLETE`

## Next Steps

Keep manual-edit learning deferred. When team libraries are authorized later,
migrate these same immutable events and scopes to authenticated storage before
building automatic preference learning.
