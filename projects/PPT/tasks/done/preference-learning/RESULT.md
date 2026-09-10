# RESULT — Preference Learning from Explicit Edit Diffs

## Task

Implement bounded local Phase 3 preference learning from explicit, inspectable
manual-edit diff artifacts without automatic design mutation.

## Status

`PASS / COMPLETE`

Merged to `master`: `dba3a55`

## Summary

Added a deterministic edit-diff learning core, versioned intermediate
contracts and a dry-run-first local API. The safety review blockers are closed:
all persisted learning artifacts are scoped by validated `userKey`; every edit
is reconciled against persisted immutable deck-update and Style Pack evidence;
edit journals merge append-only with durable idempotency; and decisions use an
append-only journal with canonical decision-key conflict rejection. Repeated accepted or reverted style
edits can produce explainable recommendations only after minimum-evidence,
independent-version, consistency, recency-decay and confidence gates. One-off,
ambiguous, unsupported or conflicting evidence fails closed.

The implementation, bounded synthetic acceptance and final repository-wide
regression all pass. The final parent verification also fixed the JSON-schema
object-root declaration and one API narrowing error discovered by those checks.

## Files Changed

- `lib/preference-learning.ts`
- `lib/preference-learning-ingestion.ts`
- `lib/preference-artifacts.mjs`
- `lib/preference-artifacts.d.mts`
- `lib/preference-event-migration.ts`
- `lib/preference-lock.ts`
- `lib/preference-events.ts`
- `storage/preference-store.ts`
- `app/api/preferences/learning/route.ts`
- `app/api/preferences/events/route.ts`
- `schemas/preference-learning.schema.json`
- `schemas/preference-events.schema.json`
- `tests/preference-learning.test.mjs`
- `tests/preference-events.test.mjs`
- `scripts/run-preference-learning-acceptance.mjs`
- `tasks/active/preference-learning/TASK.md`
- `tasks/active/preference-learning/RESULT.md`

Generated acceptance artifacts remain Git-ignored.

## Architecture Changes

- Preserves `ppt-factory` as the sole top-level orchestrator.
- Wraps the existing explicit preference-event foundation; it does not rewrite
  or silently activate those signals.
- Writes user-scoped local analysis artifacts only. It reads immutable evidence
  from `output` and `style`, but does not mutate renderer, Style Mix, Slide Plan
  or native PPTX generation.

## Implementation

- Versioned `style-edit-event` and `style-edit-journal` contracts record:
  immutable before/after deck and style version IDs plus SHA-256 hashes,
  explicit parent chains, supported native object/style deltas and auditable
  acceptance/revert evidence.
- The explicit trusted-ingestion adapter loads named immutable
  `deck-update-manifest-<outputVersion>` artifacts and verified Style Pack
  `id@version` snapshots. Missing or mismatched persisted evidence fails closed.
- Existing persisted edit events are validated and retained. New events are
  appended in caller/history order while retaining sequence-independent
  content-derived identity; each event is appended once, and
  retried keys are accepted only when their canonical payload is identical.
- Reused version IDs with different hashes, broken parent chains, duplicate
  keys, unknown/implicit outcomes and content-bearing paths fail closed.
- Existing favorite/use/reject events can optionally corroborate an edit when
  the referenced event exists and its action agrees with the outcome.
- Supported numeric edits learn a direction and decayed weighted target;
  categorical edits learn an explicit value. At least two events from two
  independent output deck versions are required.
- Sequence-based half-life decay, consistency and confidence calculations are
  persisted with complete evidence strings. Withheld candidates state why.
- Default `recommend` API mode is a no-write dry run. `propose` persistence and
  `decide` both require explicit opt-in. Accepting a decision authorizes only a
  future downstream consumer and records `downstreamMutationPerformed: false`.
- Decision records are append-only and idempotent by `decisionKey`; a reused key
  with another canonical payload is rejected.
- Proposal IDs are content-derived; stale or modified proposals cannot be used
  for decisions.
- Both preference APIs share the same user-scoped naming and safe legacy event
  migration loader, so learning reads the actual explicit-event journal.
- A project/user in-process lock protects every read/merge/write cycle. Event,
  learning and decision snapshots carry monotonic revisions and content hashes;
  writes use revision CAS plus same-directory temp-file atomic rename.
- The learning snapshot persists journal/profile/proposal together, preventing
  cross-file partial state. Dry-run recommendation does not persist migration or
  learning state.
- Malformed edit shapes are rejected by domain preflight before nested fields
  are dereferenced, producing the API's 400-class error path.

## Tests

- Targeted preference-learning tests: `PASS`, 9/9.
- Existing explicit-preference tests after shared migration: `PASS`, 6/6.
- Combined targeted tests: `PASS`, 15/15.
- Syntax checks for library and acceptance script: `PASS`.
- `pnpm test`: `PASS`, 106/106.
- `pnpm typecheck`: `PASS`.
- `pnpm build`: `PASS`; `/api/preferences/learning` is present in the production route manifest.

Targeted coverage includes deterministic accepted/reverted learning,
minimum-evidence and conflict withholding, content-path rejection, immutable
version enforcement, trusted persisted-artifact reconciliation, user-scoped
paths, sequence-independent event identity, append/merge idempotency, explicit
event corroboration/contradiction, caller-order recency, concurrent lock
serialization, shared legacy migration, atomic revision CAS, malformed-shape
preflight, append-only decision conflicts and API mutation-boundary checks.

## PPT Test

Not required. No renderer, Slide Plan or PPTX behavior changed.

## Render Test

Not required. No rendering behavior changed.

## Visual QA

Not applicable for a JSON/API-only local learning module.

## Bounded Artifact Acceptance

`scripts/run-preference-learning-acceptance.mjs`: `PASS`.

- 7 synthetic explicit edit events appended in two batches.
- 3 eligible recommendations.
- 1 one-off candidate withheld.
- Durable retry appends zero duplicate events and preserves the 7-event journal.
- Caller order is preserved while event IDs remain sequence-independent.
- Eight concurrent lock mutations serialize without a lost update.
- Shared user-scoped migration, atomic revisioned snapshot and malformed-input
  preflight checks pass.
- Immutable parent chains, evidence/confidence gates and sequence decay pass.
- Append-only decision retry is idempotent and still records no downstream mutation.
- Evidence written under ignored
  `generated/probes/preference-learning/acceptance.json` and sibling artifacts.

## Known Issues

- Learned recommendations are intentionally not applied to Style Mix, Slide
  Plan or PPTX. A future explicitly authorized consumer must read the accepted
  decision artifact and create its own immutable output version.
- Supported paths are deliberately bounded to inspectable style properties;
  adding a new path requires an explicit contract/test update.
- Repository-wide dependency-backed checks must be rerun outside the current
  child sandbox before merge.

## Risks

- Local persisted manifests remain only as trustworthy as the local project
  directory. The adapter verifies schema, ownership, immutable hashes and Style
  Pack content hashes, but does not provide cryptographic user identity.
- Exact categorical preferences and numeric directions are intentionally
  conservative; mixed intent remains withheld.

## Regression Risk

Low. The change is additive, the existing preference-event module is untouched,
and the new API writes only new named analysis artifacts after explicit opt-in.

## Diff Review

Manual file-by-file review: `PASS` for scope. The worktree contains only the
listed implementation/task files; generated probe artifacts and the
local dependency junction are ignored. No credentials, user files, generated
decks, rendered pages or unrelated refactors are included.

## Recommendation

`COMPLETE`

Merge after parent diff review. Downstream automatic application remains a
separate explicitly authorized task.

## Next Steps

1. Run `pnpm test`, `pnpm typecheck` and `pnpm build` in an environment with
   readable local dependencies.
2. Review the additive diff and generated acceptance report.
3. Merge only after those checks pass; downstream automatic application remains
   a separate explicitly authorized task.
