# TASK — Collaborative Review local core

Status: `DONE` on 2026-08-28 after implementation, bounded acceptance and independent audit.

## Goal

Add a guarded local Phase 3 Collaborative Review core that lets tenant/team
members create immutable, auditable review threads and comments against exact
authoritative deck/evidence versions and native slide/object identities. Keep
approval as the next separate module.

## Classification

| Capability | Status | Decision |
| --- | --- | --- |
| Team Style Library RBAC | `DONE` local / remote adapter pending live config | `KEEP / consume` |
| Brand Governance decision | `DONE` local | `KEEP / consume` |
| Authoritative deck/evidence manifests | `DONE` | `KEEP / consume` |
| Collaborative Review | `MISSING` | `ADD` |
| Approval Workflow | `MISSING` | `OUT OF SCOPE` |

No working review module exists, so duplicate work is absent.

## Required behavior

- Review sessions bind tenantId, teamId, projectId, deckVersionId, deck manifest
  hash, evidence manifest hash and Brand Governance decision hash.
- Comments target a slide and optionally an exact native object identity.
- Owner/editor/viewer may read. Owner/editor may open/close review; members may
  comment according to stored Team roles. Caller-provided roles have no authority.
- Comments and status events are append-only, canonical, idempotent and ordered
  deterministically. Edits use explicit superseding events; history stays visible.
- Cross-tenant/team access, mutable evidence, missing governance decision,
  unknown object targets, forged actor/time and idempotency conflicts fail closed.
- Local trusted-header mode stays disabled by default. Remote Supabase acceptance
  remains pending until external configuration is supplied.

## Artifacts

- `COLLABORATIVE_REVIEW_SESSION.json`
- `COLLABORATIVE_REVIEW_EVENTS.ndjson`
- `COLLABORATIVE_REVIEW_SNAPSHOT.json`
- JSON Schemas and executable framework-neutral API handlers

## Acceptance

- Unit/API tests cover RBAC, tenant isolation, immutable bindings, native target
  validation, append-only history, idempotency and close/reopen conflicts.
- Reuse existing real 8-slide editable PPT and persisted inspect/layout evidence;
  keep its source SHA-256 unchanged and avoid long-deck regeneration.
- Run `pnpm test`, `pnpm typecheck`, `pnpm build`, bounded artifact acceptance,
  diff review and independent read-only audit.
- Finish with `RESULT.md` containing `PASS`, `PARTIAL` or `FAIL` and a merge
  recommendation.

## Worktree

- Branch: `feature/collaborative-review`
- Path: `.worktrees/collaborative-review`
