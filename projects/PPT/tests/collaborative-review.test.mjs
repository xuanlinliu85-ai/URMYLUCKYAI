import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { brandArtifactHash } from "../lib/brand-policy.ts";
import { handleCollaborativeReviewPost } from "../lib/collaborative-review-api.ts";
import { CollaborativeReviewError, CollaborativeReviewService, LocalCollaborativeReviewRepository } from "../lib/collaborative-review.ts";
import { publishDeckEvidenceManifest, publishGeneratedDeckVersion } from "../lib/deck-version-binding.ts";
import { LocalTeamStyleLibraryRepository, TeamStyleLibraryService } from "../lib/team-style-library.ts";

const owner = { tenantId: "tenant_a", teamId: "team_a", userId: "owner_a" };
const editor = { ...owner, userId: "editor_a" };
const viewer = { ...owner, userId: "viewer_a" };
const outsider = { tenantId: "tenant_b", teamId: "team_b", userId: "owner_b" };
const targets = { "1": ["sh/chart", "sh/title"], "2": ["sh/summary"] };
const binding = { tenantId: owner.tenantId, teamId: owner.teamId, projectId: "project_a", deckVersionId: "generated_1",
  deckSha256: "a".repeat(64), deckManifestHash: "b".repeat(64), evidenceManifestHash: "c".repeat(64),
  brandDecisionHash: "d".repeat(64), brandDecision: "ALLOW", slides: 2, nativeTargets: targets, nativeTargetsHash: brandArtifactHash(targets) };

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "ppt-review-"));
  const teams = new TeamStyleLibraryService(new LocalTeamStyleLibraryRepository(path.join(root, "teams")), () => "2026-08-27T01:00:00.000Z");
  await teams.createTeam(owner, "Review Team"); await teams.setMember(owner, editor.userId, "editor"); await teams.setMember(owner, viewer.userId, "viewer");
  await teams.createTeam(outsider, "Other Team");
  let counter = 0; const service = new CollaborativeReviewService(new LocalCollaborativeReviewRepository(path.join(root, "reviews")), teams,
    async () => ({ binding }), () => `2026-08-27T01:00:0${counter}.000Z`, () => `00000000-0000-0000-0000-${String(++counter).padStart(12, "0")}`);
  return { root, service, teams };
}

test("owner opens an authoritative immutable review and all stored members can read", async () => {
  const { service } = await fixture(); const opened = await service.open(owner, "project_a", "generated_1");
  assert.equal(opened.session.binding.deckManifestHash, "b".repeat(64)); assert.equal(opened.snapshot.revision, 0);
  assert.equal((await service.get(viewer, opened.session.sessionId)).session.sessionId, opened.session.sessionId);
  await assert.rejects(() => service.open(viewer, "project_a", "generated_1"), (error) => error instanceof CollaborativeReviewError && error.code === "FORBIDDEN");
  await assert.rejects(() => service.get(outsider, opened.session.sessionId), (error) => error instanceof CollaborativeReviewError && error.code === "NOT_FOUND");
});

test("comments use native targets, append hashes, supersede history and enforce roles", async () => {
  const { service, teams } = await fixture(); const opened = await service.open(owner, "project_a", "generated_1"); const id = opened.session.sessionId;
  const first = await service.addComment(viewer, id, { idempotencyKey: "comment-1", expectedRevision: 0, target: { slide: 1, objectId: "sh/title" }, text: "  请更新   结论 " });
  assert.equal(first.snapshot.comments[0].text, "请更新 结论"); assert.equal(first.events[0].actorRole, "viewer");
  const replay = await service.addComment(viewer, id, { idempotencyKey: "comment-1", expectedRevision: 0, target: { slide: 1, objectId: "sh/title" }, text: "请更新 结论" });
  assert.equal(replay.events.length, 1);
  await teams.setMember(owner, viewer.userId, "editor");
  assert.equal((await service.addComment(viewer, id, { idempotencyKey: "comment-1", expectedRevision: 0, target: { slide: 1, objectId: "sh/title" }, text: "请更新 结论" })).events.length, 1);
  await assert.rejects(() => service.addComment(viewer, id, { idempotencyKey: "comment-1", expectedRevision: 1, target: { slide: 1, objectId: "sh/title" }, text: "不同内容" }), /Idempotency key payload conflict/);
  await assert.rejects(() => service.addComment(viewer, id, { idempotencyKey: "bad-target", expectedRevision: 1, target: { slide: 1, objectId: "sh/unknown" }, text: "x" }), /authoritative native evidence/);
  await assert.rejects(() => service.addComment(viewer, id, { idempotencyKey: "extra-target", expectedRevision: 1, target: { slide: 1, actorId: "forged" }, text: "x" }), /target is invalid/);
  const edited = await service.supersedeComment(viewer, id, { idempotencyKey: "edit-1", expectedRevision: 1, commentId: first.snapshot.comments[0].commentId, text: "请更新核心结论" });
  assert.equal(edited.snapshot.comments[0].supersededBy, edited.snapshot.comments[1].commentId); assert.equal(edited.events[1].previousEventHash, edited.events[0].eventHash);
  await assert.rejects(() => service.supersedeComment({ ...owner, userId: "viewer_other" }, id, { idempotencyKey: "edit-2", expectedRevision: 2, commentId: edited.snapshot.comments[1].commentId, text: "x" }), CollaborativeReviewError);
});

test("close, reopen and optimistic revision conflicts are enforced", async () => {
  const { service } = await fixture(); const opened = await service.open(editor, "project_a", "generated_1"); const id = opened.session.sessionId;
  const closed = await service.setStatus(editor, id, { idempotencyKey: "close-1", expectedRevision: 0, status: "closed" }); assert.equal(closed.snapshot.status, "closed");
  assert.equal((await service.setStatus(editor, id, { idempotencyKey: "close-1", expectedRevision: 0, status: "closed" })).events.length, 1);
  await assert.rejects(() => service.addComment(owner, id, { idempotencyKey: "late", expectedRevision: 1, target: { slide: 2 }, text: "late" }), /closed/);
  await assert.rejects(() => service.setStatus(owner, id, { idempotencyKey: "reopen-stale", expectedRevision: 0, status: "open" }), /revision conflict/);
  const reopened = await service.setStatus(owner, id, { idempotencyKey: "reopen-1", expectedRevision: 1, status: "open" }); assert.equal(reopened.snapshot.status, "open");
  await assert.rejects(() => service.setStatus(owner, id, { idempotencyKey: "invalid-status", expectedRevision: 2, status: "paused" }), /status is invalid/);
});

test("persisted event tampering fails closed", async () => {
  const { root, service } = await fixture(); const opened = await service.open(owner, "project_a", "generated_1"); const id = opened.session.sessionId;
  await service.addComment(owner, id, { idempotencyKey: "comment-1", expectedRevision: 0, target: { slide: 1 }, text: "original" });
  const file = path.join(root, "reviews", owner.tenantId, owner.teamId, id, "COLLABORATIVE_REVIEW_EVENTS.ndjson");
  const event = JSON.parse((await readFile(file, "utf8")).trim()); event.text = "forged"; await writeFile(file, `${JSON.stringify(event)}\n`, "utf8");
  await assert.rejects(() => service.get(owner, id), (error) => error instanceof CollaborativeReviewError && error.code === "INTEGRITY");
});

test("validly rehashed unknown events and snapshot tampering fail closed", async () => {
  const { root, service } = await fixture(); const opened = await service.open(owner, "project_a", "generated_1"); const id = opened.session.sessionId;
  await service.addComment(owner, id, { idempotencyKey: "comment-1", expectedRevision: 0, target: { slide: 1 }, text: "original" });
  const directory = path.join(root, "reviews", owner.tenantId, owner.teamId, id); const eventFile = path.join(directory, "COLLABORATIVE_REVIEW_EVENTS.ndjson");
  const original = JSON.parse((await readFile(eventFile, "utf8")).trim()); const forged = { ...original, type: "unknown_event" };
  delete forged.target; delete forged.commentId; delete forged.text; delete forged.eventHash; forged.eventHash = brandArtifactHash(forged);
  await writeFile(eventFile, `${JSON.stringify(forged)}\n`, "utf8"); await assert.rejects(() => service.get(owner, id), /hash chain is invalid/);
  await writeFile(eventFile, `${JSON.stringify(original)}\n`, "utf8"); const snapshotFile = path.join(directory, "COLLABORATIVE_REVIEW_SNAPSHOT.json");
  const snapshot = JSON.parse(await readFile(snapshotFile, "utf8")); snapshot.status = "closed"; await writeFile(snapshotFile, JSON.stringify(snapshot), "utf8");
  await assert.rejects(() => service.get(owner, id), /snapshot does not match/);
});

test("concurrent compare-and-swap appends preserve exactly one event", async () => {
  const { service } = await fixture(); const opened = await service.open(owner, "project_a", "generated_1"); const id = opened.session.sessionId;
  const results = await Promise.allSettled([
    service.addComment(editor, id, { idempotencyKey: "concurrent-a", expectedRevision: 0, target: { slide: 1 }, text: "A" }),
    service.addComment(viewer, id, { idempotencyKey: "concurrent-b", expectedRevision: 0, target: { slide: 2 }, text: "B" })
  ]);
  assert.equal(results.filter((item) => item.status === "fulfilled").length, 1); assert.equal(results.filter((item) => item.status === "rejected").length, 1);
  assert.equal((await service.get(owner, id)).events.length, 1);
});

test("API requires immutable evidence and governance decision while ignoring caller role claims", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ppt-review-api-")); const projectsRoot = path.join(root, "projects"); const projectId = "project_api";
  const project = path.join(projectsRoot, projectId); await mkdir(path.join(project, "output"), { recursive: true });
  const finalPptx = path.join(project, "output", "final.pptx"); await writeFile(finalPptx, "bounded-editable-fixture", "utf8");
  const published = await publishGeneratedDeckVersion({ projectsRoot, projectId, finalPptxPath: finalPptx, slides: 1, direction: "B" });
  const inspect = [{ kind: "slide", id: "sl/1", slide: 1 }, { kind: "textbox", id: "sh/title", slide: 1, name: "title" }];
  await mkdir(path.join(project, "render", "final"), { recursive: true });
  const inspectPath = path.join(project, "render", "final", "inspect.ndjson"); await writeFile(inspectPath, inspect.map(JSON.stringify).join("\n") + "\n", "utf8");
  const evidenceHashes = Object.fromEntries(["styleDna", "styleMix", "slidePlans", "inspect", "layouts", "fontEvidence", "imageEvidence", "chartPackManifest", "qaReport"]
    .map((name) => [name, name === "inspect" ? brandArtifactHash(inspect) : brandArtifactHash({ name })]));
  const evidence = await publishDeckEvidenceManifest({ projectsRoot, deck: { projectId, versionId: published.manifest.versionId,
    sha256: published.manifest.output.sha256, slides: 1, manifestType: "generation", manifestName: published.manifestName,
    manifestHash: published.manifestHash, pptxName: published.manifest.output.filename }, evidenceHashes,
    tenantId: owner.tenantId, teamId: owner.teamId, publishedBy: owner.userId, publishedAt: "2026-08-27T01:00:00.000Z" });
  const evidenceBindings = Object.entries(evidenceHashes).map(([name, hash]) => ({ name, expectedHash: hash, actualHash: hash }));
  const decisionBase = { schema: "ppt-factory/brand-governance-decision/v1", tenantId: owner.tenantId, teamId: owner.teamId,
    decision: "ALLOW", reasonCodes: [], binding: { policy: { policyId: "policy_api", version: "1.0.0", teamArtifactHash: "1".repeat(64), contentHash: "2".repeat(64) }, deck: { projectId, versionId: published.manifest.versionId,
      expectedSha256: published.manifest.output.sha256, actualSha256: published.manifest.output.sha256,
      manifestType: "generation", manifestName: published.manifestName, manifestHash: published.manifestHash, pptxName: published.manifest.output.filename, slides: 1,
      evidenceManifestName: evidence.manifestName, evidenceManifestHash: evidence.manifestHash }, style: {}, evidence: evidenceBindings,
      artifactSetHash: brandArtifactHash(evidenceBindings.map((item) => ({ name: item.name, actualHash: item.actualHash }))), reportHash: "3".repeat(64) }, decidedAt: "2026-08-27T01:00:00.000Z" };
  await mkdir(path.join(project, "qa"), { recursive: true }); const decisionPath = path.join(project, "qa", "BRAND_GOVERNANCE_DECISION.json");
  await writeFile(decisionPath, JSON.stringify({ ...decisionBase, decisionHash: brandArtifactHash(decisionBase) }), "utf8");
  const teamRoot = path.join(root, "teams"); const teams = new TeamStyleLibraryService(new LocalTeamStyleLibraryRepository(teamRoot), () => "2026-08-27T01:00:00.000Z");
  await teams.createTeam(owner, "API Team"); await teams.setMember(owner, viewer.userId, "viewer");
  const previous = Object.fromEntries(["PPT_FACTORY_TEAM_LIBRARY_BACKEND", "PPT_FACTORY_TEAM_LIBRARY_ALLOW_LOCAL_IDENTITY", "PPT_FACTORY_TEAM_LIBRARY_ROOT", "PPT_FACTORY_PROJECTS_ROOT", "PPT_FACTORY_COLLABORATIVE_REVIEW_ROOT"].map((key) => [key, process.env[key]]));
  Object.assign(process.env, { PPT_FACTORY_TEAM_LIBRARY_BACKEND: "local", PPT_FACTORY_TEAM_LIBRARY_ALLOW_LOCAL_IDENTITY: "true",
    PPT_FACTORY_TEAM_LIBRARY_ROOT: teamRoot, PPT_FACTORY_PROJECTS_ROOT: projectsRoot, PPT_FACTORY_COLLABORATIVE_REVIEW_ROOT: path.join(root, "reviews") });
  const request = async (userId) => handleCollaborativeReviewPost(new Request("http://local/review", { method: "POST",
    headers: { "content-type": "application/json", "x-ppt-tenant-id": owner.tenantId, "x-ppt-team-id": owner.teamId, "x-ppt-user-id": userId, "x-ppt-role": "owner" },
    body: JSON.stringify({ action: "open", projectId, deckVersionId: published.manifest.versionId, actorId: owner.userId }) }));
  try {
    assert.equal((await request(viewer.userId)).status, 403);
    await writeFile(inspectPath, `${JSON.stringify(inspect[0])}\n`, "utf8"); assert.equal((await request(owner.userId)).status, 400);
    await writeFile(inspectPath, inspect.map(JSON.stringify).join("\n") + "\n", "utf8"); await rm(decisionPath); assert.equal((await request(owner.userId)).status, 400);
    const forgedDecisionBase = structuredClone(decisionBase); forgedDecisionBase.binding.evidence[0].expectedHash = "f".repeat(64);
    await writeFile(decisionPath, JSON.stringify({ ...forgedDecisionBase, decisionHash: brandArtifactHash(forgedDecisionBase) }), "utf8"); assert.equal((await request(owner.userId)).status, 400);
    await writeFile(decisionPath, JSON.stringify({ ...decisionBase, decisionHash: brandArtifactHash(decisionBase) }), "utf8"); assert.equal((await request(owner.userId)).status, 201);
  } finally {
    for (const [key, value] of Object.entries(previous)) value === undefined ? delete process.env[key] : process.env[key] = value;
  }
});
