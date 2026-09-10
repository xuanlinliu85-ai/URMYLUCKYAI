# RESULT — Supabase Team Style Library repository

Status: `PASS`
Prior classification: `PARTIAL`
Implementation recommendation: `COMPLETE`
Merged to `master`: `91b57e1`
Live Supabase deployment/acceptance: `PARTIAL` (configuration not provided)

## Outcome

The existing local Team Style Library and `TeamStyleLibraryRepository`
contract were kept and wrapped. A production-oriented server-only remote
repository now implements the same `read`, `create` and compare-and-swap
`write` boundary through Supabase Auth, PostgREST and transactional Postgres
RPCs.

This work does not add brand governance, review, approval, collaboration, UI,
renderer or PPT behavior.

## Implementation

- Added a built-in-`fetch` PostgREST repository bound to one verified request
  actor and tenant/team scope.
- Added Supabase Auth bearer verification through `/auth/v1/user`; the actor
  `userId` comes only from the verified response. Request JSON and
  `x-ppt-user-id` cannot supply remote identity.
- Replaced the remote API fail-closed placeholder with a request-scoped
  Supabase repository when `PPT_FACTORY_TEAM_LIBRARY_BACKEND=supabase`.
- Preserved local mode as the default and preserved its explicit trusted-local
  identity flag.
- Added redacted configuration validation that prefers
  `PPT_FACTORY_SUPABASE_SECRET_KEY` and retains compatibility with
  `PPT_FACTORY_SUPABASE_SERVICE_ROLE_KEY`. Public diagnostics expose only the
  selected environment-variable name and configuration state.
- Added private Storage asset metadata lookup plus bounded 60–3600 second signed
  retrieval. Object paths must remain under `<tenant>/<team>/`.
- Added `.env.local.example` server-only configuration documentation.
- Grouped member and team-name authorization under one explicit owner predicate,
  so owner mutations succeed while editor mutations remain forbidden.
- Serialized tenant bootstrap with a transaction advisory lock keyed by tenant,
  followed by a locked tenant creator/owner-membership authorization read.
- Required every new artifact row to start published without archive provenance;
  only an owner can transition an existing published row to archived, with the
  authenticated actor and current library revision time recorded as provenance.
- Revoked authenticated table/function access before granting the bounded read,
  RPC and asset-metadata capabilities.

## Postgres / RLS Design

Migration `supabase/migrations/202608240001_team_style_library.sql` adds:

- tenants and teams with composite tenant/team ownership and revision checks;
- team members with owner/editor/viewer roles;
- immutable semantic-version artifact rows with content hashes, parent lineage,
  publication provenance and archive-monotonic triggers;
- append-only full library revision snapshots;
- scoped private Storage asset metadata;
- tenant/team/member/artifact/revision/asset indexes;
- RLS policy templates driven by authenticated team membership;
- transactional create and `FOR UPDATE` compare-and-swap RPCs;
- database-level enforcement that viewers cannot mutate, editors cannot manage
  members/team metadata or archive, and publisher/archiver identity must match
  `auth.uid()`;
- a private default Storage bucket plus scoped read/write object policies.

RPCs accept library snapshots and expected revision only. They do not accept an
actor identity parameter.

## Files Changed

- `.env.local.example`
- `CURRENT_STATE.md`
- `MIGRATION_PLAN.md`
- `adapters/supabase/team-style-library.ts`
- `app/api/team/style-library/route.ts`
- `supabase/migrations/202608240001_team_style_library.sql`
- `tests/team-style-library.test.mjs`
- `tests/supabase-team-style-library.test.mjs`
- `tasks/active/supabase-team-repository/TASK.md`
- `tasks/active/supabase-team-repository/RESULT.md`

## Verification

- Focused Team Style Library + Supabase suite: `PASS`, 17/17.
- `pnpm test`: `PASS`, 123/123.
- `pnpm typecheck`: `PASS`.
- `pnpm build`: `PASS`; `/api/team/style-library` is present in the production
  route manifest.
- `git diff --check`: `PASS`.
- Source/security review: `PASS` for redaction, request identity boundary,
  scope binding, RPC CAS, database roles, immutable versions/revisions and
  private signed retrieval.

Tests use deterministic local libraries plus mocked Auth/PostgREST/Storage HTTP
responses. They verify that a forged `x-ppt-user-id` is ignored, RPC requests
carry scoped data without an actor parameter, stale revisions map to bounded
`CONFLICT` errors, modern credentials win over legacy configuration, secrets do
not appear in diagnostics, and Storage signing follows scoped metadata lookup.
SQL contract checks also verify grouped owner authorization, tenant-lock ordering
and locked reauthorization, published-only artifact creation, owner/actor-bound
archive transitions, and the exact authenticated grant boundary.

The first sandboxed full-suite attempt could not read the worktree's linked
dependency tree. The same `pnpm test`, `pnpm typecheck` and `pnpm build` commands
were rerun with approved access to the existing dependency installation and
produced the passing results above.

## PPT / Render / Visual QA

Not applicable. No renderer, Storyline, Slide Plan, PowerPoint or QA behavior
changed, so real PPTX generation and rendered PNG inspection were not run.

## Live Deployment Boundary

No Supabase credentials or project were supplied. The SQL migration was not
applied to a live database and no remote object was created. Live status remains
honestly `PARTIAL` until an operator:

1. exposes the `ppt_factory` schema in Supabase API settings;
2. applies the migration and confirms the private bucket name;
3. configures the URL and server-only modern secret key (or legacy fallback);
4. sets `PPT_FACTORY_TEAM_LIBRARY_BACKEND=supabase`;
5. runs authenticated cross-tenant, RLS, CAS and signed-asset acceptance against
   the target project.

## Worktree Environment Note

No packages were downloaded or committed. A failed sandboxed dependency probe
left an untracked `node_modules.partial-offline/` directory; it was preserved as
requested. The active `node_modules` is an untracked junction to the existing
main-workspace dependencies and is not part of the diff.

## Merge Recommendation

`MERGE`. The bounded remote implementation is complete and regression checks
pass. Do not mark live Supabase deployment complete until the external
acceptance steps above pass.
