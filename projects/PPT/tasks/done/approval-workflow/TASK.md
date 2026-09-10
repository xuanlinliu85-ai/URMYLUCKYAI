# TASK — Approval Workflow local core

Status: `MISSING` after repository search on 2026-08-28.

## Goal

Add the guarded local Phase 3 Approval Workflow that consumes the completed
Collaborative Review core. An approval request and its terminal decision must
bind the exact authoritative deck, evidence, Brand Governance decision, closed
review session and closed review snapshot. AI Design Memory remains next.

## Classification

| Capability | Status | Decision |
| --- | --- | --- |
| Team Style Library RBAC | `DONE` local / remote live config pending | `KEEP / consume` |
| Brand Governance | `DONE` local | `KEEP / consume` |
| Collaborative Review | `DONE` local | `KEEP / consume` |
| Approval Workflow | `MISSING` | `ADD` |
| AI Design Memory | `MISSING` | `OUT OF SCOPE` |

No approval repository, API, schema or decision artifact exists, so duplicate
work is absent.

## Required behavior

- Owner/editor may submit an approval request; owner may approve or reject;
  owner/editor/viewer may read according to stored Team roles.
- Caller-provided roles, actors, timestamps, hashes and decision fields have no
  authority.
- Submission resolves the review from the tenant/team repository and requires
  a closed, hash-valid snapshot with no active unresolved comments.
- Submission re-resolves the authoritative deck/evidence/Brand Decision and
  requires exact equality with the review binding. A `BLOCKED` Brand Decision
  cannot enter approval.
- Request binding includes tenantId, teamId, projectId, deckVersionId, deck
  manifest hash, evidence manifest hash, Brand decision hash, review session
  hash, review snapshot hash and review revision.
- Approval/rejection is a single terminal append-only event with server-derived
  actor/role/time, canonical idempotency, expected-revision CAS and strict
  runtime validation. A terminal request cannot reopen or change outcome.
- Cross-scope access, mutable evidence, open review, unresolved comments,
  forged fields, invalid decisions and idempotency/revision conflicts fail closed.
- Local trusted-header identity stays disabled by default. Live remote acceptance
  remains pending Auth/Supabase configuration.

## Artifacts

- `APPROVAL_REQUEST.json`
- `APPROVAL_EVENTS.ndjson`
- `APPROVAL_SNAPSHOT.json`
- `APPROVAL_DECISION.json` after terminal decision
- JSON Schemas and framework-neutral executable API handlers

## Acceptance

- Unit/API tests cover RBAC, tenant isolation, exact review/deck/evidence/
  governance binding, unresolved comments, terminal-state immutability,
  idempotency, concurrency and tamper detection.
- Reuse the existing real 8-slide editable PPT, persisted inspect/layout and
  Collaborative Review acceptance path. Keep the source SHA-256 unchanged and
  perform no long-deck regeneration.
- Run full tests, typecheck, production build, bounded artifact acceptance,
  diff review and independent read-only audit.
- Finish with `RESULT.md` containing `PASS`, `PARTIAL` or `FAIL` and a merge
  recommendation.

## Worktree

- Branch: `feature/approval-workflow`
- Path: `.worktrees/approval-workflow`
