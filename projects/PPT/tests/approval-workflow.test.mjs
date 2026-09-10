import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ApprovalWorkflowError, ApprovalWorkflowService, LocalApprovalWorkflowRepository } from "../lib/approval-workflow.ts";
import { handleApprovalWorkflowPost } from "../lib/approval-workflow-api.ts";
import { brandArtifactHash } from "../lib/brand-policy.ts";
import { CollaborativeReviewService, LocalCollaborativeReviewRepository } from "../lib/collaborative-review.ts";
import { LocalTeamStyleLibraryRepository, TeamStyleLibraryService } from "../lib/team-style-library.ts";

const owner = { tenantId: "tenant_a", teamId: "team_a", userId: "owner_a" }; const editor = { ...owner, userId: "editor_a" };
const viewer = { ...owner, userId: "viewer_a" }; const outsider = { tenantId: "tenant_b", teamId: "team_b", userId: "owner_b" };
const binding = { tenantId: owner.tenantId, teamId: owner.teamId, projectId: "project_a", deckVersionId: "generated_1",
  deckSha256: "a".repeat(64), deckManifestHash: "b".repeat(64), evidenceManifestHash: "c".repeat(64), brandDecisionHash: "d".repeat(64),
  reviewSessionId: "review_a", reviewSessionHash: "e".repeat(64), reviewSnapshotHash: "f".repeat(64), reviewRevision: 3 };

test("API keeps local identity disabled by default and remote adapter explicit", async () => {
  const priorBackend = process.env.PPT_FACTORY_TEAM_LIBRARY_BACKEND; const priorIdentity = process.env.PPT_FACTORY_TEAM_LIBRARY_ALLOW_LOCAL_IDENTITY;
  try {
    process.env.PPT_FACTORY_TEAM_LIBRARY_BACKEND = "local"; delete process.env.PPT_FACTORY_TEAM_LIBRARY_ALLOW_LOCAL_IDENTITY;
    const local = await handleApprovalWorkflowPost(new Request("http://local/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "submit" }) }));
    assert.equal(local.status, 503); assert.equal((await local.json()).code, "LOCAL_IDENTITY_DISABLED");
    process.env.PPT_FACTORY_TEAM_LIBRARY_BACKEND = "supabase"; const remote = await handleApprovalWorkflowPost(new Request("http://local/api", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }));
    assert.equal(remote.status, 503); assert.equal((await remote.json()).code, "REMOTE_ADAPTER_UNAVAILABLE");
  } finally {
    priorBackend === undefined ? delete process.env.PPT_FACTORY_TEAM_LIBRARY_BACKEND : process.env.PPT_FACTORY_TEAM_LIBRARY_BACKEND = priorBackend;
    priorIdentity === undefined ? delete process.env.PPT_FACTORY_TEAM_LIBRARY_ALLOW_LOCAL_IDENTITY : process.env.PPT_FACTORY_TEAM_LIBRARY_ALLOW_LOCAL_IDENTITY = priorIdentity;
  }
});

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "ppt-approval-")); const teams = new TeamStyleLibraryService(new LocalTeamStyleLibraryRepository(path.join(root, "teams")), () => "2026-08-28T01:00:00.000Z");
  await teams.createTeam(owner, "Approval Team"); await teams.setMember(owner, editor.userId, "editor"); await teams.setMember(owner, viewer.userId, "viewer"); await teams.createTeam(outsider, "Other Team");
  let counter = 0; let resolvedBinding = structuredClone(binding); const service = new ApprovalWorkflowService(new LocalApprovalWorkflowRepository(path.join(root, "approvals")), teams,
    async (_actor, _reviewSessionId, operation) => operation(structuredClone(resolvedBinding)),
    () => `2026-08-28T01:00:0${counter}.000Z`, () => `00000000-0000-0000-0000-${String(++counter).padStart(12, "0")}`);
  return { root, teams, service, setBinding: (value) => { resolvedBinding = structuredClone(value); } };
}

test("owner/editor submit exact bindings and stored members read within scope", async () => {
  const { service } = await fixture(); const submitted = await service.submit(editor, "review_a");
  assert.equal(submitted.request.binding.reviewSnapshotHash, "f".repeat(64)); assert.equal(submitted.snapshot.status, "pending");
  assert.equal((await service.submit(owner, "review_a")).request.requestId, submitted.request.requestId);
  assert.equal((await service.get(viewer, submitted.request.requestId)).request.requestedBy, editor.userId);
  await assert.rejects(() => service.submit(viewer, "review_a"), (error) => error instanceof ApprovalWorkflowError && error.code === "FORBIDDEN");
  await assert.rejects(() => service.get(outsider, submitted.request.requestId), (error) => error instanceof ApprovalWorkflowError && error.code === "NOT_FOUND");
});

test("concurrent submissions resolve to one canonical request", async () => {
  const { service } = await fixture(); const [left, right] = await Promise.all([service.submit(owner, "review_a"), service.submit(editor, "review_a")]);
  assert.equal(left.request.requestId, right.request.requestId); assert.equal(left.request.requestHash, right.request.requestHash);
});

test("decision revalidates the authoritative review binding", async () => {
  const { service, setBinding } = await fixture(); const submitted = await service.submit(editor, "review_a");
  setBinding({ ...binding, reviewSnapshotHash: "9".repeat(64), reviewRevision: 4 });
  await assert.rejects(() => service.decide(owner, submitted.request.requestId, { idempotencyKey: "approve-stale", expectedRevision: 0, decision: "approve" }), /no longer matches/);
});

test("review exclusive lease prevents reopen between validation and terminal append", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ppt-approval-lease-")); const teams = new TeamStyleLibraryService(new LocalTeamStyleLibraryRepository(path.join(root, "teams")), () => "2026-08-28T01:00:00.000Z");
  await teams.createTeam(owner, "Lease Team"); const reviewRepository = new LocalCollaborativeReviewRepository(path.join(root, "reviews")); const targets = { "1": [] };
  const reviewBinding = { tenantId: owner.tenantId, teamId: owner.teamId, projectId: "project_a", deckVersionId: "generated_1", deckSha256: "a".repeat(64),
    deckManifestHash: "b".repeat(64), evidenceManifestHash: "c".repeat(64), brandDecisionHash: "d".repeat(64), brandDecision: "ALLOW", slides: 1,
    nativeTargets: targets, nativeTargetsHash: brandArtifactHash(targets) };
  let sequence = 0; const reviewService = new CollaborativeReviewService(reviewRepository, teams, async () => ({ binding: reviewBinding }),
    () => `2026-08-28T01:00:0${sequence}.000Z`, () => `10000000-0000-0000-0000-${String(++sequence).padStart(12, "0")}`);
  const review = await reviewService.open(owner, "project_a", "generated_1"); await reviewService.setStatus(owner, review.session.sessionId, { idempotencyKey: "close", expectedRevision: 0, status: "closed" });
  let hold = false; let enteredResolve; const entered = new Promise((resolve) => { enteredResolve = resolve; }); let releaseLease; const release = new Promise((resolve) => { releaseLease = resolve; });
  const approvalService = new ApprovalWorkflowService(new LocalApprovalWorkflowRepository(path.join(root, "approvals")), teams,
    (actor, sessionId, operation) => reviewRepository.withExclusive(actor, sessionId, async (current) => {
      assert.equal(current.snapshot.status, "closed"); const resolved = { tenantId: actor.tenantId, teamId: actor.teamId, projectId: current.session.binding.projectId,
        deckVersionId: current.session.binding.deckVersionId, deckSha256: current.session.binding.deckSha256, deckManifestHash: current.session.binding.deckManifestHash,
        evidenceManifestHash: current.session.binding.evidenceManifestHash, brandDecisionHash: current.session.binding.brandDecisionHash,
        reviewSessionId: current.session.sessionId, reviewSessionHash: current.session.sessionHash, reviewSnapshotHash: current.snapshot.snapshotHash, reviewRevision: current.snapshot.revision };
      if (hold) { enteredResolve(); await release; } return operation(resolved);
    }), () => "2026-08-28T01:00:09.000Z", () => `20000000-0000-0000-0000-${String(++sequence).padStart(12, "0")}`);
  const request = await approvalService.submit(owner, review.session.sessionId); hold = true;
  const decisionPromise = approvalService.decide(owner, request.request.requestId, { idempotencyKey: "approve", expectedRevision: 0, decision: "approve" }); await entered;
  let reopened = false; const reopenPromise = reviewService.setStatus(owner, review.session.sessionId, { idempotencyKey: "reopen", expectedRevision: 1, status: "open" }).then((value) => { reopened = true; return value; });
  await new Promise((resolve) => setTimeout(resolve, 30)); assert.equal(reopened, false); releaseLease();
  const [decision, reopenedReview] = await Promise.all([decisionPromise, reopenPromise]); assert.equal(decision.snapshot.status, "approved"); assert.equal(reopenedReview.snapshot.status, "open");
});

test("owner creates one immutable approval decision and retries canonically", async () => {
  const { service } = await fixture(); const submitted = await service.submit(editor, "review_a"); const id = submitted.request.requestId;
  await assert.rejects(() => service.decide(editor, id, { idempotencyKey: "approve-1", expectedRevision: 0, decision: "approve" }), /not authorized/);
  const approved = await service.decide(owner, id, { idempotencyKey: "approve-1", expectedRevision: 0, decision: "approve", reason: " 已核验 " });
  assert.equal(approved.snapshot.status, "approved"); assert.equal(approved.decision.decision, "APPROVED"); assert.equal(approved.events.length, 1);
  const replay = await service.decide(owner, id, { idempotencyKey: "approve-1", expectedRevision: 0, decision: "approve", reason: "已核验" }); assert.equal(replay.events.length, 1);
  await assert.rejects(() => service.decide(owner, id, { idempotencyKey: "approve-1", expectedRevision: 1, decision: "reject", reason: "changed" }), /payload conflict/);
  await assert.rejects(() => service.decide(owner, id, { idempotencyKey: "approve-2", expectedRevision: 1, decision: "reject", reason: "changed" }), /terminal/);
});

test("rejection requires a reason and concurrent terminal decisions use revision CAS", async () => {
  const { service } = await fixture(); const submitted = await service.submit(owner, "review_a"); const id = submitted.request.requestId;
  await assert.rejects(() => service.decide(owner, id, { idempotencyKey: "reject-empty", expectedRevision: 0, decision: "reject" }), /reason is invalid/);
  const outcomes = await Promise.allSettled([
    service.decide(owner, id, { idempotencyKey: "approve-a", expectedRevision: 0, decision: "approve" }),
    service.decide(owner, id, { idempotencyKey: "reject-b", expectedRevision: 0, decision: "reject", reason: "证据不足" })
  ]);
  assert.equal(outcomes.filter((item) => item.status === "fulfilled").length, 1); assert.equal(outcomes.filter((item) => item.status === "rejected").length, 1);
  assert.equal((await service.get(owner, id)).events.length, 1);
});

test("snapshot tampering fails closed", async () => {
  const { root, service } = await fixture(); const submitted = await service.submit(owner, "review_a"); const id = submitted.request.requestId;
  await service.decide(owner, id, { idempotencyKey: "approve-1", expectedRevision: 0, decision: "approve" });
  const directory = path.join(root, "approvals", owner.tenantId, owner.teamId, id); const snapshotFile = path.join(directory, "APPROVAL_SNAPSHOT.json");
  const snapshot = JSON.parse(await readFile(snapshotFile, "utf8")); snapshot.status = "rejected"; await writeFile(snapshotFile, JSON.stringify(snapshot), "utf8");
  await assert.rejects(() => service.get(owner, id), /snapshot does not match/);
});

test("request, validly rehashed event and decision tampering fail closed", async () => {
  {
    const { root, service } = await fixture(); const submitted = await service.submit(owner, "review_a"); const file = path.join(root, "approvals", owner.tenantId, owner.teamId, submitted.request.requestId, "APPROVAL_REQUEST.json");
    const request = JSON.parse(await readFile(file, "utf8")); request.requestedBy = "forged"; await writeFile(file, JSON.stringify(request), "utf8"); await assert.rejects(() => service.get(owner, submitted.request.requestId), /hash mismatch/);
  }
  {
    const { root, service } = await fixture(); const submitted = await service.submit(owner, "review_a"); await service.decide(owner, submitted.request.requestId, { idempotencyKey: "approve", expectedRevision: 0, decision: "approve" });
    const file = path.join(root, "approvals", owner.tenantId, owner.teamId, submitted.request.requestId, "APPROVAL_EVENTS.ndjson"); const event = JSON.parse((await readFile(file, "utf8")).trim()); event.actorRole = "editor"; delete event.eventHash; event.eventHash = brandArtifactHash(event); await writeFile(file, `${JSON.stringify(event)}\n`, "utf8");
    await assert.rejects(() => service.get(owner, submitted.request.requestId), /event structure is invalid/);
  }
  {
    const { root, service } = await fixture(); const submitted = await service.submit(owner, "review_a"); await service.decide(owner, submitted.request.requestId, { idempotencyKey: "approve", expectedRevision: 0, decision: "approve" });
    const file = path.join(root, "approvals", owner.tenantId, owner.teamId, submitted.request.requestId, "APPROVAL_DECISION.json"); const decision = JSON.parse(await readFile(file, "utf8")); decision.decidedBy = "forged"; await writeFile(file, JSON.stringify(decision), "utf8");
    await assert.rejects(() => service.get(owner, submitted.request.requestId), /decision does not match/);
  }
});

test("durable commit intent recovers an interrupted terminal write", async () => {
  const { root, service } = await fixture(); const submitted = await service.submit(owner, "review_a"); const approved = await service.decide(owner, submitted.request.requestId, { idempotencyKey: "approve", expectedRevision: 0, decision: "approve" });
  const directory = path.join(root, "approvals", owner.tenantId, owner.teamId, submitted.request.requestId); const event = approved.events[0];
  const intentBase = { schema: "ppt-factory/approval-commit-intent/v1", requestId: submitted.request.requestId, expectedRevision: 0, event };
  await writeFile(path.join(directory, "APPROVAL_COMMIT_INTENT.json"), JSON.stringify({ ...intentBase, intentHash: brandArtifactHash(intentBase) }), "utf8");
  await writeFile(path.join(directory, "APPROVAL_EVENTS.ndjson"), "", "utf8"); await rm(path.join(directory, "APPROVAL_DECISION.json"));
  await writeFile(path.join(directory, "APPROVAL_SNAPSHOT.json"), JSON.stringify(submitted.snapshot), "utf8");
  const recovered = await service.get(owner, submitted.request.requestId); assert.equal(recovered.snapshot.status, "approved"); assert.equal(recovered.decision.decision, "APPROVED");
});

test("commit intent repairs truncated ledger and decision while corrupt intent fails closed", async () => {
  for (const crashPoint of ["ledger", "decision"]) {
    const { root, service } = await fixture(); const submitted = await service.submit(owner, "review_a"); const approved = await service.decide(owner, submitted.request.requestId, { idempotencyKey: `approve-${crashPoint}`, expectedRevision: 0, decision: "approve" });
    const directory = path.join(root, "approvals", owner.tenantId, owner.teamId, submitted.request.requestId); const event = approved.events[0];
    const intentBase = { schema: "ppt-factory/approval-commit-intent/v1", requestId: submitted.request.requestId, expectedRevision: 0, event };
    await writeFile(path.join(directory, "APPROVAL_COMMIT_INTENT.json"), JSON.stringify({ ...intentBase, intentHash: brandArtifactHash(intentBase) }), "utf8");
    const ledgerText = `${JSON.stringify(event)}\n`; const decisionText = `${JSON.stringify(approved.decision, null, 2)}\n`;
    if (crashPoint === "ledger") { await writeFile(path.join(directory, "APPROVAL_EVENTS.ndjson"), ledgerText.slice(0, Math.floor(ledgerText.length / 2)), "utf8"); await rm(path.join(directory, "APPROVAL_DECISION.json")); }
    else { await writeFile(path.join(directory, "APPROVAL_DECISION.json"), decisionText.slice(0, Math.floor(decisionText.length / 2)), "utf8"); }
    await writeFile(path.join(directory, "APPROVAL_SNAPSHOT.json"), JSON.stringify(submitted.snapshot), "utf8"); const recovered = await service.get(owner, submitted.request.requestId); assert.equal(recovered.snapshot.status, "approved");
  }
  const { root, service } = await fixture(); const submitted = await service.submit(owner, "review_a"); const directory = path.join(root, "approvals", owner.tenantId, owner.teamId, submitted.request.requestId);
  await writeFile(path.join(directory, "APPROVAL_COMMIT_INTENT.json"), "{\"schema\":", "utf8");
  await assert.rejects(() => service.get(owner, submitted.request.requestId), (error) => error?.code === "INTEGRITY" && /commit intent.*corrupt/i.test(error.message));
});
