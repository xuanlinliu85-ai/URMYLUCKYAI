# TASK — Preference Learning from Explicit Edit Diffs

## Goal

Add a bounded local Phase 3 preference-learning layer that derives explainable
style recommendations only from explicit, inspectable manual-edit diff artifacts.

## Current State

Status: `DONE`
Merged: `dba3a55`

The local V2 explicit preference-event journal supports favorite/use/reject
signals over immutable Golden Slide and Style Pack versions. It intentionally
does not learn style preferences from manual deck edits. No versioned edit-diff
contract, learned style profile or recommendation/decision artifact exists.

Decision: `WRAP / extend`. Preserve the existing preference-event module and
reuse it only as optional corroborating evidence. Do not rewrite it.

## Expected Behavior

Given a small ordered edit history with immutable before/after deck and style
version references, supported object/style deltas, and explicit acceptance or
revert evidence, deterministically extract supported style preferences. Apply
recency decay, consistency, minimum-evidence and confidence gates. Return a
dry-run recommendation by default. Persisting a proposal or decision requires
explicit opt-in and never mutates Style Mix, Slide Plan, renderer input or PPTX.

## Scope

### In scope

- Versioned local edit-event/journal schema.
- User-key-scoped persistence for every learning artifact.
- Shared user-scoped explicit-preference snapshot naming with safe legacy
  `preference-events.json` migration.
- Immutable version/hash and parent-chain validation.
- Fail-closed reconciliation against persisted deck-update manifests and
  immutable Style Pack versions through an explicit trusted-ingestion adapter.
- Supported style-dimension paths for native object and style deltas.
- Accepted/reverted evidence, with optional validation against existing
  explicit preference events.
- Deterministic sequence-based decay, minimum evidence and confidence gates.
- Explainable learned profile, proposal and decision artifacts.
- Dry-run API plus explicit opt-in proposal/decision operations.
- Project/user in-process serialization, revision CAS and same-directory atomic
  temp-file rename for coherent snapshots.
- Small synthetic acceptance history.

### Out of scope

- Automatic mutation of Style Mix, Slide Plan, PPTX or renderer inputs.
- Inference from ambiguous edits, content/text rewriting or invented values.
- Cloud storage, auth, team/collaboration/approval, embeddings or ML models.
- Renderer changes, image generation or large/85-page acceptance decks.

## Inputs

- Local project/user placeholder scope.
- Ordered versioned style edit events.
- Optional existing `analysis/preference-events.json` journal.

## Outputs

- `analysis/preference-<userKey>-events-snapshot.json` for migrated/current
  explicit event journal plus profile.
- `analysis/preference-<userKey>-learning-snapshot.json` as one coherent
  revisioned journal/profile/proposal bundle.
- `analysis/preference-<userKey>-decision-snapshot.json` as a revisioned wrapper
  around the append-only decision journal.
- Dry-run API response without storage mutation.

## Requirements

- `ppt-factory` remains the sole top-level orchestrator.
- JSON artifacts are the source of truth.
- Same input and policy must produce the same profile/proposal IDs and values.
- Retried edit/decision keys must be idempotent; conflicting canonical payloads
  must fail without replacing persisted journals.
- Unsupported content paths and ambiguous/low-confidence edits fail closed.
- At least two independent pieces of evidence are required per recommendation.
- Sequence-based decay is explicit and reproducible.
- Caller/history append order defines recency; content IDs remain independent
  of sequence and array position.
- Accepted/rejected proposal decisions must remain inspectable and must state
  that downstream mutation was not performed.

## Edge Cases

- Reused version ID with a different content hash.
- Broken after-to-before parent chain.
- Duplicate event IDs or sequence numbers.
- Unknown outcome, implicit edit or unsupported content/text path.
- Conflicting values, one-off edits and decayed evidence below threshold.
- Missing/mismatched explicit preference-event evidence.
- Decision for a stale or unknown proposal.

## Acceptance Criteria

- Synthetic accepted and reverted edit history produces deterministic profile
  and proposal artifacts with evidence, decay and confidence details.
- Repeated supported edits can cross the evidence/confidence gates.
- Ambiguous, unsupported and low-confidence edits are rejected or withheld.
- Default recommendation call is dry-run and performs no project write.
- Proposal/decision persistence requires `explicitOptIn: true`.
- No API path mutates existing Style Mix, Slide Plan or PPTX artifacts.
- `pnpm test`, `pnpm typecheck` and `pnpm build` pass.

## Visual Acceptance

Not applicable. Renderer and PPT behavior do not change.

## Deliverables

- Preference-learning library and TypeScript contracts.
- JSON Schema.
- Local API route.
- Unit tests and bounded synthetic acceptance script.
- `RESULT.md` with diff review and merge recommendation.

## Worktree

- Branch: `feature/preference-learning`
- Path: `.worktrees/preference-learning`
