# TASK — Team Style Library foundation

Status: DONE for local foundation
Merged: `7f296c4`
Branch: `feature/team-style-library`
Worktree: `.worktrees/team-style-library`

## Goal

Add the first Phase 3 team Style Library foundation after the completed local
Golden Slide and saved Style Pack cores. Keep `ppt-factory` as the only
top-level orchestrator and make shared storage a bounded repository adapter.

## Current State

`MISSING` at the team layer. The repository already has immutable local Style
Pack versions and a local Golden Slide library, so this task uses `WRAP` rather
than replacing either module. There is no tenant/team/member model, shared
artifact publication state, permission boundary or remote repository contract.

## Expected Behavior

- Canonical JSON contracts model tenants, teams, members and
  `owner`/`editor`/`viewer` roles.
- Style Pack and Golden Slide versions are immutable by
  `(tenant, team, type, id, version)` and retain source provenance.
- Published versions may be archived without changing their immutable content.
- Versions form a monotonic semantic-version chain with parent version/hash
  lineage.
- All reads and writes are scoped by tenant and team; service methods authorize
  the actor from persisted membership rather than accepting a claimed role.
- A deterministic local file repository supports tests and offline operation.
- Local API identity is disabled by default and only enabled by an explicit
  trusted-development flag; request bodies never supply actor identity.
- A Supabase/Postgres adapter contract validates required configuration while
  never returning, logging or persisting credentials.

## Scope

- Team Style Library types, canonicalization, service and errors.
- Local file-backed repository implementation.
- Optional Supabase/Postgres adapter contract and redacted config validation.
- Bounded API for local bootstrap, membership, publish, list/get and archive.
- JSON schemas, unit/integration tests and a small artifact acceptance runner.

## Out of Scope

- Live cloud acceptance without user-provided credentials.
- Authentication provider implementation.
- Collaborative comments, review or approval workflow.
- Brand governance, billing, enterprise policy, design memory or UI polish.
- Renderer/PPTX changes or regeneration of the legacy 85-page deck.

## Inputs

- Existing `StylePackVersion` snapshots.
- Existing eligible Golden Slide candidate plus its library provenance.
- Trusted local caller identity (`tenantId`, `teamId`, `userId`); production
  identity verification is a later auth adapter.

## Outputs

- `TEAM_STYLE_LIBRARY.json`-compatible local artifact.
- Versioned Style Pack / Golden Slide publication records.
- Redacted Supabase configuration diagnostics.
- Acceptance manifest under ignored `generated/probes/`.

## Acceptance Criteria

- Owner can bootstrap a team, manage members, publish and archive.
- Editor can publish but cannot manage members or archive.
- Viewer can list/get but cannot mutate.
- Cross-tenant/team access and non-member access are rejected.
- Re-publishing identical content is idempotent; replacing an existing immutable
  version with different content is rejected.
- Archived records retain the same content hash and no longer appear in the
  default published listing.
- Same-scope in-process writes serialize and stale compare-and-swap writes
  conflict; temp names are unique.
- Full Style Pack and Golden Slide runtime shapes are validated before publish.
- Additional properties are rejected at library/member/artifact/provenance and
  nested Style Pack/Golden contract boundaries before hashing or persistence.
- A later version points to the immediately prior version/hash and non-monotonic
  publication is rejected.
- Local output is deterministic under an injected clock.
- Supabase validation lists the exact missing environment variables and its
  returned diagnostics contain no secret value.
- `pnpm test`, `pnpm typecheck`, `pnpm build`, bounded acceptance, diff review
  and `RESULT.md` complete before handoff.

## Visual / PPT Acceptance

No renderer behavior changes. A PPTX/render run is not required. Inspect the
bounded JSON acceptance artifact for stable ordering, provenance, publication
state and absence of credential material.
