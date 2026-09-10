import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  LocalTeamStyleLibraryRepository,
  TeamStyleLibraryService
} from "../lib/team-style-library.ts";
import {
  authenticateSupabaseTeamLibraryActor,
  createSupabaseTeamStyleLibraryRepository,
  SUPABASE_TEAM_LIBRARY_ENV,
  SupabasePrivateTeamStyleAssetStore
} from "../adapters/supabase/team-style-library.ts";

const ownerId = "11111111-1111-4111-8111-111111111111";
const viewerId = "22222222-2222-4222-8222-222222222222";
const scope = { tenantId: "tenant_a", teamId: "team_board" };
const authenticatedActor = { ...scope, userId: ownerId, accessToken: "verified-user-token" };
const environment = {
  [SUPABASE_TEAM_LIBRARY_ENV.url]: "https://example.supabase.co",
  [SUPABASE_TEAM_LIBRARY_ENV.secretKey]: "sb_secret_server-only"
};

async function libraryVersions(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ppt-factory-supabase-team-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repository = new LocalTeamStyleLibraryRepository(root);
  const service = new TeamStyleLibraryService(repository, () => "2026-08-24T08:00:00.000Z");
  await service.createTeam({ ...scope, userId: ownerId }, "Remote Team");
  const initial = await repository.read(scope);
  await service.setMember({ ...scope, userId: ownerId }, viewerId, "viewer");
  const next = await repository.read(scope);
  return { initial, next };
}

test("Supabase Auth boundary derives userId from the verified bearer token", async () => {
  const calls = [];
  const request = new Request("https://app.example/api/team/style-library", {
    headers: {
      authorization: "Bearer caller-access-token",
      "x-ppt-tenant-id": scope.tenantId,
      "x-ppt-team-id": scope.teamId,
      "x-ppt-user-id": "forged-body-or-header-identity"
    }
  });
  const actor = await authenticateSupabaseTeamLibraryActor(request, environment, async (url, init) => {
    calls.push({ url: String(url), init });
    return Response.json({ id: ownerId });
  });
  assert.deepEqual(actor, { ...scope, userId: ownerId, accessToken: "caller-access-token" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://example.supabase.co/auth/v1/user");
  assert.equal(new Headers(calls[0].init.headers).get("authorization"), "Bearer caller-access-token");
  assert.equal(JSON.stringify(calls).includes("forged-body-or-header-identity"), false);
});

test("PostgREST repository uses scoped RPCs and expected-revision CAS", async (t) => {
  const { initial, next } = await libraryVersions(t);
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith("team_style_library_read")) return Response.json(initial);
    return Response.json({ ok: true });
  };
  const repository = createSupabaseTeamStyleLibraryRepository(authenticatedActor, environment, fetchImpl);
  assert.equal(repository.backend, "supabase-postgres");
  assert.equal((await repository.read(scope)).revision, 1);
  await repository.create(initial);
  await repository.write(next, 1);
  assert.deepEqual(calls.map((call) => call.url.split("/").at(-1)), [
    "team_style_library_read", "team_style_library_create", "team_style_library_compare_and_swap"
  ]);
  for (const call of calls) {
    const headers = new Headers(call.init.headers);
    assert.equal(headers.get("apikey"), environment[SUPABASE_TEAM_LIBRARY_ENV.secretKey]);
    assert.equal(headers.get("authorization"), `Bearer ${authenticatedActor.accessToken}`);
    assert.equal(headers.get("content-profile"), "ppt_factory");
  }
  const readBody = JSON.parse(calls[0].init.body);
  assert.deepEqual(readBody, { p_tenant_id: scope.tenantId, p_team_id: scope.teamId });
  const casBody = JSON.parse(calls[2].init.body);
  assert.equal(casBody.p_expected_revision, 1);
  assert.equal(casBody.p_library.revision, 2);
  assert.equal("p_actor_id" in casBody, false);
});

test("PostgREST repository maps transactional CAS failures without reflecting remote details", async (t) => {
  const { next } = await libraryVersions(t);
  const repository = createSupabaseTeamStyleLibraryRepository(authenticatedActor, environment, async () => Response.json({
    message: "PPT_FACTORY_CONFLICT: stale revision with internal database detail"
  }, { status: 409 }));
  await assert.rejects(() => repository.write(next, 1), (error) => {
    assert.equal(error.code, "CONFLICT");
    assert.equal(error.message, "Team Style Library revision conflict");
    assert.doesNotMatch(error.message, /internal database detail/);
    return true;
  });
});

test("private asset retrieval requires scoped metadata before signing", async () => {
  const calls = [];
  const metadata = {
    asset_id: "preview_001",
    tenant_id: scope.tenantId,
    team_id: scope.teamId,
    object_path: `${scope.tenantId}/${scope.teamId}/pack_board/preview.png`,
    content_type: "image/png",
    byte_size: 321,
    sha256: "a".repeat(64),
    artifact_type: "style_pack",
    artifact_id: "pack_board",
    artifact_version: "1.0.0",
    created_by: ownerId,
    created_at: "2026-08-24T08:00:00.000Z"
  };
  const store = new SupabasePrivateTeamStyleAssetStore(authenticatedActor, environment, async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("/rest/v1/team_style_assets?")) return Response.json([metadata]);
    return Response.json({ signedURL: "/storage/v1/object/sign/ppt-factory-style-library/signed-token" });
  });
  const result = await store.getSignedAsset(scope, "preview_001", 600);
  assert.equal(result.metadata.sha256, metadata.sha256);
  assert.equal(result.expiresIn, 600);
  assert.match(result.signedUrl, /^https:\/\/example\.supabase\.co\/storage\/v1\/object\/sign\//);
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /tenant_id=eq\.tenant_a/);
  assert.match(calls[1].url, /ppt-factory-style-library\/tenant_a\/team_board\/pack_board\/preview\.png$/);
  assert.deepEqual(JSON.parse(calls[1].init.body), { expiresIn: 600 });
});

test("migration defines scoped tables, immutable guards, RLS and actor-derived transactional RPCs", () => {
  const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/202608240001_team_style_library.sql"), "utf8");
  for (const fragment of [
    "create table if not exists ppt_factory.tenants",
    "create table if not exists ppt_factory.teams",
    "create table if not exists ppt_factory.team_members",
    "create table if not exists ppt_factory.team_artifact_versions",
    "create table if not exists ppt_factory.team_library_revisions",
    "create table if not exists ppt_factory.team_style_assets",
    "enable row level security",
    "guard_artifact_version_update",
    "team_style_library_compare_and_swap",
    "for update",
    "auth.uid()",
    "actor_role = 'viewer'",
    "artifact -> 'provenance' ->> 'publishedBy' <> actor::text",
    "artifact ->> 'archivedBy' <> actor::text",
    "storage.buckets",
    "public = false"
  ]) assert.match(sql, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  assert.doesNotMatch(sql, /p_actor_id/i);
  assert.doesNotMatch(sql, /\\u[0-9a-f]{4}/i);
});

test("migration groups owner-only member and team-name changes as one authorization predicate", () => {
  const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/202608240001_team_style_library.sql"), "utf8");
  assert.match(sql, /if\s*\(\s*\(p_library\s*->\s*'members'\)\s+is distinct from\s+\(prior_library\s*->\s*'members'\)\s*or\s*\(p_library\s*->>\s*'name'\)\s+is distinct from\s+\(prior_library\s*->>\s*'name'\)\s*\)\s*and actor_role\s*<>\s*'owner'\s+then/is);
});

test("migration serializes tenant bootstrap and rechecks tenant authorization under the lock", () => {
  const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/202608240001_team_style_library.sql"), "utf8");
  const lock = sql.indexOf("pg_advisory_xact_lock(pg_catalog.hashtextextended(tenant_key, 0))");
  const reread = sql.indexOf("select t.created_by into tenant_creator", lock);
  const authorize = sql.indexOf("tenant_allowed := tenant_creator is null or tenant_creator = actor", reread);
  const insert = sql.indexOf("insert into ppt_factory.tenants", authorize);
  assert.ok(lock >= 0);
  assert.ok(reread > lock);
  assert.ok(authorize > reread);
  assert.ok(insert > authorize);
});

test("migration permits archive state only as an owner transition of an existing published row", () => {
  const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/202608240001_team_style_library.sql"), "utf8");
  assert.match(sql, /existing\.state\s*=\s*'published'\s+and artifact\s*->>\s*'state'\s*=\s*'archived'\s+and actor_role\s*<>\s*'owner'/is);
  assert.match(sql, /existing\.state\s*=\s*'published'\s+and artifact\s*->>\s*'state'\s*=\s*'archived'\s+and artifact\s*->>\s*'archivedBy'\s*<>\s*actor::text/is);
  assert.match(sql, /existing\.state\s*=\s*'published'\s+and artifact\s*->>\s*'state'\s*=\s*'archived'\s+and artifact\s*->>\s*'archivedAt'\s+is distinct from p_library\s*->>\s*'updatedAt'/is);
  assert.match(sql, /artifact\s*->>\s*'state'\s*<>\s*'published'\s+or artifact\s*\?\s*'archivedBy'\s+or artifact\s*\?\s*'archivedAt'/is);
});

test("migration revokes authenticated table and function access before granting the bounded API", () => {
  const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/202608240001_team_style_library.sql"), "utf8");
  assert.match(sql, /revoke all on all tables in schema ppt_factory from public, anon, authenticated/i);
  assert.match(sql, /revoke all on all functions in schema ppt_factory from public, anon, authenticated/i);
  assert.match(sql, /grant select on ppt_factory\.team_style_assets to authenticated/i);
  assert.match(sql, /grant execute on function ppt_factory\.team_style_library_compare_and_swap\(jsonb, bigint\) to authenticated/i);
});
