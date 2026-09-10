# TASK — Supabase Team Style Library repository

Status: DONE
Merged: `91b57e1`
Classification: `PARTIAL`
Branch: `feature/supabase-team-repository`
Worktree: `.worktrees/supabase-team-repository`
Migration choice: `WRAP / extend`

## Goal

Complete the documented remote repository slice behind the existing
`TeamStyleLibraryRepository` contract with a production-oriented
Supabase/Postgres implementation. Preserve the validated local repository and
service behavior.

## Existing Evidence

- `CURRENT_STATE.md` classifies Team Style Library as `PARTIAL` because the
  local foundation is complete while live Supabase Auth, RLS and Storage are
  not implemented.
- `adapters/supabase/team-style-library.ts` currently contains only the remote
  interface and redacted configuration diagnostics.
- `lib/team-style-library.ts` already defines the repository and immutable
  service contracts; these are retained, not rewritten.

## Scope

- Supabase/Postgres SQL migrations for tenants, teams, members, immutable
  artifact versions, append-only library revisions, indexes and RLS policy
  templates.
- Transactional Postgres RPCs for create and revision compare-and-swap writes.
- Server-only PostgREST repository using built-in `fetch`.
- Authenticated request actor boundary: user identity comes from verified
  Supabase Auth, never request JSON or caller-supplied user headers.
- Private Storage asset metadata and signed-download contract.
- Redacted configuration validation preferring the modern Supabase secret key
  while accepting the legacy service-role environment variable.
- Focused tests, full tests, typecheck, build, source/SQL acceptance inspection,
  diff review and `RESULT.md`.

## Out of Scope

- Brand governance, collaborative comments, review or approval workflows.
- UI work, renderer changes, PPTX generation or visual QA changes.
- Live remote deployment or acceptance without user-provided Supabase
  configuration.
- Browser/client exposure of privileged credentials.

## Acceptance Criteria

- Repository `read`, `create` and `write` satisfy the existing contract and
  validate canonical library payloads.
- Create/write use transactional RPCs; write uses expected-revision CAS and
  maps stale revisions to `CONFLICT`.
- SQL constraints preserve tenant/team scoping and immutable artifact identity,
  content, provenance and archive monotonicity.
- RLS policy templates are scoped through authenticated team membership.
- Remote HTTP actor identity is derived by verifying the bearer token with
  Supabase Auth; body/header user claims are ignored.
- Storage bucket is private and signed retrieval validates scoped asset
  metadata before requesting a signed URL.
- Public diagnostics contain no credential or bearer-token material.
- Modern secret key is preferred; legacy service-role configuration remains
  compatible and explicitly identified only by environment-variable name.
- `pnpm test`, `pnpm typecheck`, `pnpm build`, diff review and `RESULT.md` pass.

## PPT / Visual Acceptance

Not applicable: this slice changes only server-side repository, authentication,
database and asset-metadata behavior. No renderer or PPT output behavior changes.
