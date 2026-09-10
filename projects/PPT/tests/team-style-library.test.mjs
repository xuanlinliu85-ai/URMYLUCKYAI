import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  canonicalize, isTrustedLocalTeamLibraryIdentityEnabled, LOCAL_TEAM_LIBRARY_IDENTITY_FLAG,
  LocalTeamStyleLibraryRepository, TEAM_GOLDEN_SNAPSHOT_SCHEMA, teamArtifactDigest, TeamStyleLibraryService,
  validateTeamStyleLibrary
} from "../lib/team-style-library.ts";
import { SUPABASE_TEAM_LIBRARY_ENV, validateSupabaseTeamLibraryConfig } from "../adapters/supabase/team-style-library.ts";

const actor = (userId, tenantId = "tenant_a", teamId = "team_board") => ({ tenantId, teamId, userId });
const dimensions = ["typography", "color", "layout", "chart", "density", "composition", "storytelling", "visualTone"];
function pack(overrides = {}) {
  const weights = Object.fromEntries(dimensions.map((dimension) => [dimension, { reference: .5, system: .3, prompt: .2 }]));
  const locks = Object.fromEntries(dimensions.map((dimension) => [dimension, false]));
  const resolvedOwnership = Object.fromEntries(dimensions.map((dimension) => [dimension, { owner: "reference", weights: weights[dimension], locked: false }]));
  const style = {
    styleId: "style_board", name: "Board Style", sourceType: "hybrid", version: "1.0.0", styleVector: {},
    typography: {}, colors: {}, grid: {}, composition: {}, charts: {}, visuals: {}, storytelling: {}, density: {},
    preferredLayouts: ["EXEC_SUMMARY"], antiPatterns: []
  };
  const styleMix = {
    previewSet: "team-source", sources: { referenceStyleId: "reference_board", systemStyleId: "system_professional" },
    controls: { referenceStrength: 60, minimalism: 70, modernity: 65, airiness: 68, visualWeight: 55, technologyTone: 15, visualImpact: 45, locks: { typography: false, colors: false, layout: false }, advancedMixer: { weights, locks } },
    weights, locks, resolvedOwnership,
    finalStyleId: style.styleId, finalStyle: style, generatedAt: "2026-08-24T00:00:00.000Z"
  };
  const payload = {
    schema: "ppt-factory/style-pack/v1", id: "pack_board", version: "1.0.0", name: "董事会经营月报",
    styleId: style.styleId, tags: ["board"], roles: ["summary"], layoutFamilies: ["EXEC_SUMMARY"], densities: ["balanced"],
    hasCharts: true, chartTypes: ["bar"], audienceTags: ["board"], active: true,
    previews: { cover: "cover.png", executiveSummary: "summary.png", dataSlide: "data.png" },
    preferredLayouts: ["EXEC_SUMMARY"], chartRules: {}, typography: {}, imageDirection: {}, antiPatterns: [], examplePrompts: [],
    provenance: { previewSet: styleMix.previewSet, sources: styleMix.sources, weights, locks, resolvedOwnership }, styleMix, style,
    ...overrides
  };
  return { ...payload, contentHash: createHash("sha256").update(JSON.stringify(canonicalize(payload))).digest("hex") };
}
const golden = (overrides = {}) => ({
  schema: TEAM_GOLDEN_SNAPSHOT_SCHEMA,
  referenceStyleId: "reference_style",
  sourceFile: "bounded-reference.pptx",
  candidate: {
    id: "golden_exec_001", sourceSlide: 2, role: "summary", layoutFamily: "EXEC_SUMMARY", density: "balanced",
    hasChart: false, score: 91, candidateThreshold: 68, eligible: true,
    dimensionScores: { layoutQuality: 92, clarity: 90, reusability: 91, styleRepresentativeness: 89, hierarchy: 94, balance: 90 },
    evidence: ["role:summary", "layout:EXEC_SUMMARY"], ...overrides
  }
});

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ppt-team-library-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let tick = 0;
  const now = () => `2026-08-24T0${tick++}:00:00.000Z`;
  const repository = new LocalTeamStyleLibraryRepository(root);
  return { root, repository, service: new TeamStyleLibraryService(repository, now) };
}

test("local repository persists canonical team members and immutable artifact versions", async (t) => {
  const { root, service } = fixture(t);
  await service.createTeam(actor("owner_1"), "  董事会设计组  ");
  await service.setMember(actor("owner_1"), "editor_1", "editor");
  await service.setMember(actor("owner_1"), "viewer_1", "viewer");
  const style = await service.publishStylePack(actor("editor_1"), pack(), { sourceProjectId: "project_1" });
  const repeated = await service.publishStylePack(actor("editor_1"), pack(), { sourceProjectId: "project_1" });
  const slide = await service.publishGoldenSlide(actor("editor_1"), golden(), "1.0.0", { sourceProjectId: "project_1" });
  assert.equal(style.contentHash, repeated.contentHash);
  assert.equal(style.provenance.publishedAt, repeated.provenance.publishedAt);
  assert.equal(slide.content.candidate.id, "golden_exec_001");

  const archived = await service.archiveArtifact(actor("owner_1"), "golden_slide", "golden_exec_001", "1.0.0");
  assert.equal(archived.state, "archived");
  assert.equal(archived.contentHash, slide.contentHash);
  assert.deepEqual((await service.listArtifacts(actor("viewer_1"))).map((item) => item.artifactType), ["style_pack"]);
  assert.equal((await service.listArtifacts(actor("viewer_1"), { state: "all" })).length, 2);

  const persisted = JSON.parse(fs.readFileSync(path.join(root, "tenant_a", "team_board", "TEAM_STYLE_LIBRARY.json"), "utf8"));
  assert.equal(persisted.schema, "ppt-factory/team-style-library/v1");
  assert.equal(persisted.name, "董事会设计组");
  assert.deepEqual(persisted.members.map((member) => member.userId), ["editor_1", "owner_1", "viewer_1"]);
  assert.deepEqual(persisted.artifacts.map((item) => item.artifactType), ["golden_slide", "style_pack"]);
});

test("service enforces stored roles and tenant/team isolation", async (t) => {
  const { service } = fixture(t);
  await service.createTeam(actor("owner_1"), "Team A");
  await service.setMember(actor("owner_1"), "editor_1", "editor");
  await service.setMember(actor("owner_1"), "viewer_1", "viewer");
  await service.publishStylePack(actor("editor_1"), pack());

  await assert.rejects(() => service.publishStylePack(actor("viewer_1"), pack({ version: "1.0.1" })), (error) => error.code === "FORBIDDEN");
  await assert.rejects(() => service.setMember(actor("editor_1"), "new_viewer", "viewer"), (error) => error.code === "FORBIDDEN");
  await assert.rejects(() => service.archiveArtifact(actor("editor_1"), "style_pack", "pack_board", "1.0.0"), (error) => error.code === "FORBIDDEN");
  await assert.rejects(() => service.getLibrary(actor("outsider")), (error) => error.code === "FORBIDDEN");
  await assert.rejects(() => service.getLibrary(actor("owner_1", "tenant_b")), (error) => error.code === "NOT_FOUND");
  await assert.rejects(() => service.getLibrary(actor("owner_1", "tenant_a", "team_other")), (error) => error.code === "NOT_FOUND");
  await assert.rejects(() => service.getLibrary(actor("owner_1", "../tenant_escape")), (error) => error.code === "INVALID");
  await assert.rejects(() => service.getArtifact(actor("owner_1"), "style_pack", "../pack_escape"), (error) => error.code === "INVALID");
  await assert.rejects(() => service.publishStylePack(actor("owner_1"), null), (error) => error.code === "INVALID");
  await assert.rejects(() => service.publishGoldenSlide(actor("owner_1"), null), (error) => error.code === "INVALID");
});

test("same artifact version cannot be replaced and a team retains an owner", async (t) => {
  const { repository, service } = fixture(t);
  await service.createTeam(actor("owner_1"), "Team A");
  await service.publishStylePack(actor("owner_1"), pack());
  await assert.rejects(() => service.publishStylePack(actor("owner_1"), pack({ name: "Changed immutable content" })), (error) => error.code === "CONFLICT");
  await assert.rejects(() => service.setMember(actor("owner_1"), "owner_1", "viewer"), (error) => error.code === "CONFLICT");
  await assert.rejects(() => service.publishGoldenSlide(actor("owner_1"), golden({ eligible: false })), (error) => error.code === "INVALID");
  const malformedPack = pack({ styleMix: { ...pack().styleMix, controls: {} } });
  await assert.rejects(() => service.publishStylePack(actor("owner_1"), malformedPack), (error) => error.code === "INVALID");
  const malformedGolden = golden();
  malformedGolden.candidate.unexpected = true;
  await assert.rejects(() => service.publishGoldenSlide(actor("owner_1"), malformedGolden), (error) => error.code === "INVALID");

  const stored = await repository.read(actor("owner_1"));
  const replaced = structuredClone(stored);
  replaced.revision += 1;
  replaced.artifacts[0].name = "Repository bypass attempt";
  replaced.artifacts[0].contentHash = teamArtifactDigest(replaced.artifacts[0]);
  await assert.rejects(() => repository.write(replaced, stored.revision), (error) => error.code === "CONFLICT");

  const rewrittenProvenance = structuredClone(stored);
  rewrittenProvenance.revision += 1;
  rewrittenProvenance.artifacts[0].provenance.publishedBy = "forged_actor";
  await assert.rejects(() => repository.write(rewrittenProvenance, stored.revision), (error) => error.code === "CONFLICT");

  const mismatchedWrapper = structuredClone(stored);
  mismatchedWrapper.revision += 1;
  mismatchedWrapper.artifacts[0].artifactId = "pack_other";
  mismatchedWrapper.artifacts[0].provenance.sourceArtifactId = "pack_other";
  mismatchedWrapper.artifacts[0].contentHash = teamArtifactDigest(mismatchedWrapper.artifacts[0]);
  await assert.rejects(() => repository.write(mismatchedWrapper, stored.revision), (error) => error.code === "INVALID");

  const falseArchiveMetadata = structuredClone(stored);
  falseArchiveMetadata.revision += 1;
  falseArchiveMetadata.artifacts[0].archivedBy = "owner_1";
  falseArchiveMetadata.artifacts[0].archivedAt = "2026-08-24T09:00:00.000Z";
  await assert.rejects(() => repository.write(falseArchiveMetadata, stored.revision), (error) => error.code === "INVALID");

  await service.archiveArtifact(actor("owner_1"), "style_pack", "pack_board", "1.0.0");
  const archived = await repository.read(actor("owner_1"));
  const republished = structuredClone(archived);
  republished.revision += 1;
  republished.artifacts[0].state = "published";
  delete republished.artifacts[0].archivedBy;
  delete republished.artifacts[0].archivedAt;
  await assert.rejects(() => repository.write(republished, archived.revision), (error) => error.code === "CONFLICT");
});

test("publication versions form a monotonic auditable snapshot chain", async (t) => {
  const { service } = fixture(t);
  await service.createTeam(actor("owner_1"), "Team A");
  const first = await service.publishStylePack(actor("owner_1"), pack());
  const second = await service.publishStylePack(actor("owner_1"), pack({ version: "1.1.0" }));
  assert.equal(first.provenance.parentVersion, null);
  assert.equal(first.provenance.parentContentHash, null);
  assert.equal(second.provenance.parentVersion, "1.0.0");
  assert.equal(second.provenance.parentContentHash, first.contentHash);
  await assert.rejects(() => service.publishStylePack(actor("owner_1"), pack({ version: "1.0.5" })), (error) => error.code === "CONFLICT");
  const repeated = await service.publishStylePack(actor("owner_1"), pack({ version: "1.1.0" }));
  assert.equal(repeated.contentHash, second.contentHash);
});

test("local repository serializes same-scope compare-and-swap writes", async (t) => {
  const { root, repository, service } = fixture(t);
  await service.createTeam(actor("owner_1"), "Team A");
  const base = await repository.read(actor("owner_1"));
  const next = (userId) => ({
    ...structuredClone(base), revision: base.revision + 1, updatedAt: "2026-08-24T02:00:00.000Z",
    members: [...base.members, { userId, role: "viewer", addedBy: "owner_1", addedAt: "2026-08-24T02:00:00.000Z", updatedBy: "owner_1", updatedAt: "2026-08-24T02:00:00.000Z" }]
  });
  const writes = await Promise.allSettled([
    repository.write(next("viewer_a"), base.revision),
    repository.write(next("viewer_b"), base.revision)
  ]);
  assert.equal(writes.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(writes.filter((result) => result.status === "rejected" && result.reason.code === "CONFLICT").length, 1);
  const stored = await repository.read(actor("owner_1"));
  assert.equal(stored.revision, 2);
  assert.equal(stored.members.filter((member) => member.userId.startsWith("viewer_")).length, 1);
  const files = fs.readdirSync(path.join(root, "tenant_a", "team_board"));
  assert.equal(files.some((file) => file.endsWith(".tmp")), false);
});

test("strict envelopes reject additional fields before hashing or persistence", async (t) => {
  const { service } = fixture(t);
  await service.createTeam(actor("owner_1"), "Team A");
  await service.publishStylePack(actor("owner_1"), pack());
  const library = await service.getLibrary(actor("owner_1"));
  const mutations = [
    (value) => { value.unexpectedLibraryField = true; },
    (value) => { value.members[0].unexpectedMemberField = true; },
    (value) => { value.artifacts[0].unexpectedArtifactField = true; },
    (value) => { value.artifacts[0].provenance.unexpectedProvenanceField = true; }
  ];
  for (const mutate of mutations) {
    const extra = structuredClone(library);
    mutate(extra);
    assert.throws(() => validateTeamStyleLibrary(extra), (error) => error.code === "INVALID" && /unsupported fields/.test(error.message));
  }

  await assert.rejects(() => service.publishStylePack(actor("owner_1"), pack({ unexpectedStylePackField: true })), (error) => error.code === "INVALID");
  const base = pack();
  await assert.rejects(() => service.publishStylePack(actor("owner_1"), pack({
    styleMix: { ...base.styleMix, unexpectedStyleMixField: true }
  })), (error) => error.code === "INVALID");
  await assert.rejects(() => service.publishStylePack(actor("owner_1"), pack({
    provenance: { ...base.provenance, unexpectedStyleProvenanceField: true }
  })), (error) => error.code === "INVALID");
  const extraGoldenSnapshot = { ...golden(), unexpectedGoldenSnapshotField: true };
  await assert.rejects(() => service.publishGoldenSlide(actor("owner_1"), extraGoldenSnapshot), (error) => error.code === "INVALID");
});

test("Supabase config diagnostics are exact and never expose credentials", () => {
  assert.equal(isTrustedLocalTeamLibraryIdentityEnabled({}), false);
  assert.equal(isTrustedLocalTeamLibraryIdentityEnabled({ [LOCAL_TEAM_LIBRARY_IDENTITY_FLAG]: "true" }), true);
  assert.equal(isTrustedLocalTeamLibraryIdentityEnabled({ [LOCAL_TEAM_LIBRARY_IDENTITY_FLAG]: "TRUE" }), false);
  const missing = validateSupabaseTeamLibraryConfig({});
  assert.deepEqual(missing.missing, [SUPABASE_TEAM_LIBRARY_ENV.url, SUPABASE_TEAM_LIBRARY_ENV.secretKey]);
  assert.equal(missing.valid, false);
  const secret = "never-print-this-service-role-key";
  const configured = validateSupabaseTeamLibraryConfig({
    [SUPABASE_TEAM_LIBRARY_ENV.url]: "https://example.supabase.co",
    [SUPABASE_TEAM_LIBRARY_ENV.secretKey]: secret,
    [SUPABASE_TEAM_LIBRARY_ENV.schema]: "team_library"
  });
  assert.equal(configured.valid, true);
  assert.equal(configured.credentialConfigured, true);
  assert.equal(configured.credentialSource, "secret-key");
  assert.equal(configured.schema, "team_library");
  assert.doesNotMatch(JSON.stringify(configured), new RegExp(secret));
  const urlSecret = "query-secret-that-must-not-leak";
  const unsafeUrl = validateSupabaseTeamLibraryConfig({
    [SUPABASE_TEAM_LIBRARY_ENV.url]: `https://example.supabase.co/?apikey=${urlSecret}`,
    [SUPABASE_TEAM_LIBRARY_ENV.secretKey]: "configured-but-not-returned"
  });
  assert.equal(unsafeUrl.valid, false);
  assert.equal(unsafeUrl.url, "https://example.supabase.co");
  assert.doesNotMatch(JSON.stringify(unsafeUrl), new RegExp(urlSecret));
  const invalidIdentifier = "bad;do-not-reflect-this";
  const unsafeNames = validateSupabaseTeamLibraryConfig({
    [SUPABASE_TEAM_LIBRARY_ENV.url]: "https://example.supabase.co",
    [SUPABASE_TEAM_LIBRARY_ENV.secretKey]: "configured-but-not-returned",
    [SUPABASE_TEAM_LIBRARY_ENV.schema]: invalidIdentifier,
    [SUPABASE_TEAM_LIBRARY_ENV.objectBucket]: invalidIdentifier
  });
  assert.equal(unsafeNames.valid, false);
  assert.equal(unsafeNames.schema, "ppt_factory");
  assert.equal(unsafeNames.objectBucket, "ppt-factory-style-library");
  assert.doesNotMatch(JSON.stringify(unsafeNames), new RegExp(invalidIdentifier));
  const legacy = validateSupabaseTeamLibraryConfig({
    [SUPABASE_TEAM_LIBRARY_ENV.url]: "https://example.supabase.co",
    [SUPABASE_TEAM_LIBRARY_ENV.legacyServiceRoleKey]: "legacy-never-returned"
  });
  assert.equal(legacy.valid, true);
  assert.equal(legacy.credentialSource, "legacy-service-role");
  assert.equal(legacy.credentialEnvironmentVariable, SUPABASE_TEAM_LIBRARY_ENV.legacyServiceRoleKey);
  assert.doesNotMatch(JSON.stringify(legacy), /legacy-never-returned/);
  const preferredModern = validateSupabaseTeamLibraryConfig({
    [SUPABASE_TEAM_LIBRARY_ENV.url]: "https://example.supabase.co",
    [SUPABASE_TEAM_LIBRARY_ENV.secretKey]: "modern-never-returned",
    [SUPABASE_TEAM_LIBRARY_ENV.legacyServiceRoleKey]: "legacy-never-returned"
  });
  assert.equal(preferredModern.credentialSource, "secret-key");
  assert.equal(preferredModern.credentialEnvironmentVariable, SUPABASE_TEAM_LIBRARY_ENV.secretKey);
  assert.doesNotMatch(JSON.stringify(preferredModern), /(?:modern|legacy)-never-returned/);
});

test("canonical schemas and API expose the bounded team library contract", () => {
  const root = process.cwd();
  const librarySchema = JSON.parse(fs.readFileSync(path.join(root, "schemas/team-style-library.schema.json"), "utf8"));
  const artifactSchema = JSON.parse(fs.readFileSync(path.join(root, "schemas/team-style-artifact-version.schema.json"), "utf8"));
  assert.deepEqual(librarySchema.properties.members.items.properties.role.enum, ["owner", "editor", "viewer"]);
  assert.deepEqual(artifactSchema.properties.state.enum, ["published", "archived"]);
  assert.ok(artifactSchema.properties.provenance.required.includes("parentVersion"));
  assert.ok(artifactSchema.properties.provenance.required.includes("parentContentHash"));
  assert.ok(artifactSchema.allOf[0].else.not.anyOf.some((item) => item.required.includes("archivedBy")));
  assert.equal(artifactSchema.properties.content.oneOf[0].$ref, "style-pack.schema.json#/$defs/stylePackVersion");
  const route = fs.readFileSync(path.join(root, "app/api/team/style-library/route.ts"), "utf8");
  assert.match(route, /x-ppt-tenant-id/);
  assert.match(route, /LOCAL_TEAM_LIBRARY_IDENTITY_FLAG/);
  assert.doesNotMatch(route, /body\?\.userId/);
  assert.match(route, /publish-style-pack/);
  assert.match(route, /publish-golden-slide/);
  assert.match(route, /authenticateSupabaseTeamLibraryActor/);
  assert.match(route, /createSupabaseTeamStyleLibraryRepository/);
});
