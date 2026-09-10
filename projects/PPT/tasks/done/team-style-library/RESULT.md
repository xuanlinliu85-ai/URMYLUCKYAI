# RESULT — Team Style Library foundation

Status: `PARTIAL`
Local core: `PASS`
Live Supabase/Postgres integration: `PARTIAL` (not configured or remotely accepted)
Recommendation: `COMPLETE` the validated local foundation; keep live Supabase integration `PARTIAL`

Merged to `master`: `7f296c4`

## Summary

The existing immutable local Style Pack and Golden Slide implementations were
kept and wrapped. The new team-library foundation provides a canonical,
versioned shared-library contract; deterministic local persistence; stored
member roles; service-level tenant/team isolation; immutable publication; and
archive state without changing artifact content. `ppt-factory` remains the
only orchestrator.

No renderer, Storyline, Slide Plan, PPTX, chart or QA behavior changed.

## Classification and Architecture

- Prior state: `MISSING` at the team layer.
- Migration choice: `WRAP` existing Style Pack / Golden Slide versions.
- Repository boundary: `TeamStyleLibraryRepository`.
- Service boundary: `TeamStyleLibraryService` resolves permissions from
  persisted membership; callers never supply a role.
- Local adapter: atomic file-backed JSON repository under
  `generated/team-style-library/<tenant>/<team>/TEAM_STYLE_LIBRARY.json`.
- Remote boundary: `SupabasePostgresTeamStyleLibraryRepository` plus redacted
  configuration validation. No live backend behavior is claimed.

## Implementation

- Canonical team library schema with tenant, team, revision, member provenance,
  and deterministic artifact ordering.
- Roles: `owner`, `editor`, `viewer`.
  - owner: manage membership, publish, archive, read;
  - editor: publish and read;
  - viewer: read only.
- Artifact types: immutable Style Pack and eligible Golden Slide snapshots.
- States: `published`, `archived`; archive preserves the immutable content hash.
- Every artifact id has a monotonic semantic-version chain. New versions persist
  `parentVersion` and `parentContentHash`; gaps, forks and older-version inserts
  are rejected.
- Existing key + identical content is idempotent; different content at the same
  type/id/version is a conflict.
- Style Pack source hashes are verified before team publication.
- Local optimistic revision checks prevent silent stale writes.
- Same-scope local reads/checks/writes are serialized in-process and atomic
  writes use per-write UUID temp names.
- API: `/api/team/style-library` supports local team bootstrap, membership,
  publish, list/get and archive plus redacted Supabase config diagnostics.
- The local API is fail-closed by default. Trusted offline development must set
  `PPT_FACTORY_TEAM_LIBRARY_ALLOW_LOCAL_IDENTITY=true`; actor identity is then
  read only from headers, never from the request body.

## Files Changed

- `lib/team-style-library.ts`
- `adapters/supabase/team-style-library.ts`
- `app/api/team/style-library/route.ts`
- `schemas/team-style-library.schema.json`
- `schemas/team-style-artifact-version.schema.json`
- `schemas/team-style-library-acceptance.schema.json`
- `tests/team-style-library.test.mjs`
- `scripts/run-team-style-library-acceptance.mjs`
- `tasks/active/team-style-library/TASK.md`
- `tasks/active/team-style-library/RESULT.md`

## Tests

- Team-library focused tests: `PASS`, 8/8.
- `pnpm test`: `PASS`, 114/114 after rebase onto the Preference Learning master.
- `pnpm typecheck`: `PASS`.
- `pnpm build`: `PASS`; `/api/team/style-library` is present in the production
  route manifest.
- Final post-review focused suite: `PASS`, 8/8; bounded acceptance rerun:
  `PASS`.
- Parent post-rebase `pnpm typecheck` and production build: `PASS`.

## Final Security Review

Source-level review covered tenant isolation, path traversal, immutable
versions, publication/archive provenance, malformed API input, schema alignment
and credential reflection. The review found and fixed these local issues:

- runtime scope IDs now require bounded ASCII-safe identifiers before they are
  used as file path segments; `..`, separators, missing values and overlong IDs
  are rejected;
- artifact IDs use a separate bounded identifier that retains the existing
  Style Pack core's Chinese-ID compatibility without ever becoming a path;
- direct repository writes cannot replace/remove an immutable version, rewrite
  publication provenance, republish an archive or rewrite archive provenance;
- wrapper Style Pack id/version/source hash and Golden Slide source id must
  match their immutable content snapshots;
- published records cannot carry forged archive metadata, in runtime validation
  or the JSON Schema;
- malformed/missing Style Pack and Golden payloads return bounded `INVALID`
  errors instead of falling through to generic runtime failures;
- API artifact id/type pairs and JSON-object request bodies are validated;
- local API identity is disabled unless the explicit trusted-local flag is
  exactly `true`; body-supplied tenant/team/user identity is never accepted;
- same-scope local repository operations are serialized, stale concurrent
  writes conflict, and UUID temp names cannot collide within one process;
- Style Pack and Golden Slide snapshots receive full runtime structural checks
  against their canonical required contracts before hashing/publication;
- library, member, artifact, provenance, Style Pack, Style Mix, mixer and Golden
  envelopes reject additional properties before hashing or persistence, closing
  the unhashed-envelope-state bypass found in the second audit;
- artifact publication is an auditable monotonic snapshot chain with immutable
  parent version/hash lineage;
- Supabase diagnostics normalize URLs to a safe origin, reject credential/query
  components and invalid schema/bucket identifiers, and do not reflect invalid
  raw values or secrets.

No unresolved path traversal or cross-tenant file-selection route was found.
Tenant/team authorization still intentionally depends on the service boundary;
the documented local HTTP identity headers are not production authentication.

## Bounded Artifact Acceptance

`scripts/run-team-style-library-acceptance.mjs`: `PASS`.

The ignored acceptance output contains one team, three role levels, one valid
immutable Style Pack chain, one eligible Golden Slide publication and archive,
and a machine-readable manifest. Checks passed for:

- published Style Pack;
- monotonic Style Pack parent version/hash lineage;
- Golden Slide publish then archive with unchanged content hash;
- archived artifact hidden from the default listing;
- viewer mutation rejection;
- cross-tenant access rejection;
- honest missing-remote-config status;
- absence of credential material.

Artifact evidence is local and intentionally not committed:
`generated/probes/team-style-library/ACCEPTANCE_MANIFEST.json`.

## PPT / Render / Visual QA

Not applicable. This task changes library metadata, storage and API behavior
only. It does not alter renderer output, so no PPTX regeneration or PNG render
was run. The bounded JSON output was inspected for ordering, roles, provenance,
states, scope and credential leakage.

## Supabase/Postgres Status and Required Configuration

Live remote integration is specifically `PARTIAL`; no credentials were present
and no remote acceptance was attempted. A future remote adapter needs:

- `PPT_FACTORY_TEAM_LIBRARY_BACKEND=supabase`
- `PPT_FACTORY_SUPABASE_URL` — Supabase project URL, available in Project
  Settings → API.
- `PPT_FACTORY_SUPABASE_SERVICE_ROLE_KEY` — server-only service-role key from
  Project Settings → API; never expose it to the browser or commit it.
- optional `PPT_FACTORY_SUPABASE_SCHEMA` (default `ppt_factory`).
- optional `PPT_FACTORY_SUPABASE_STYLE_BUCKET` (default
  `ppt-factory-style-library`).
- Supabase Auth identity mapping, Postgres tables/policies that enforce
  tenant/team membership, and the named private object-storage bucket.

For local/offline API acceptance only:

- `PPT_FACTORY_TEAM_LIBRARY_ALLOW_LOCAL_IDENTITY=true`

Never enable that flag on a remotely reachable deployment. A remote route must
derive the actor from an authenticated adapter/session rather than headers or a
request body.

The validator returns only URL/public names, missing-variable names and a
credential-present boolean. It never returns, logs or persists the key value.

## Known Issues / Risks

- The local HTTP identity headers are suitable only for trusted offline/local
  operation and are disabled by default. Production use must derive the actor
  from authenticated server context before selecting the Supabase repository.
- The local repository uses optimistic file revisions, not a distributed
  transaction. Its mutex is in-process only; separate Node processes can still
  race. Multi-process production writes require Postgres transactional compare-
  and-swap plus tenant RLS.
- Live RLS, Auth, object-storage and migration behavior remain untested and are
  not represented as complete.
- Handoff constraint: the worktree commit could not be created because Git
  index writes require sandbox escalation and the approval service rejected the
  final request after its usage limit was reached. The isolated worktree and
  all untracked source files remain intact for the parent orchestrator to stage
  and commit. No workaround was attempted.
- The full 90-test run, typecheck and production build passed before the final
  security hardening. The final source then passed its expanded focused 8-test
  suite and bounded acceptance. A new full regression/typecheck/build must be
  run by the parent after integration because escalated execution in this
  worktree remains blocked by the approval-service usage limit.

## Regression Risk

Low. The implementation adds isolated contracts/routes and wraps existing
Style Pack / Golden Slide snapshots. Full tests and production build pass; no
PPT output code changed.

## Next Steps

Implement an authenticated Supabase/Postgres repository in a separate
worktree only after the user supplies the listed project configuration. Keep
brand governance, collaborative comments and approval workflow separate and in
their documented order.
