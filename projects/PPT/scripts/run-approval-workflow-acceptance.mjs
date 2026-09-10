import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { handleCollaborativeReviewPost } from "../lib/collaborative-review-api.ts";
import { handleApprovalWorkflowGet, handleApprovalWorkflowPost } from "../lib/approval-workflow-api.ts";
import { brandArtifactHash } from "../lib/brand-policy.ts";

const probeRoot = path.join(process.cwd(), "generated", "probes"); const brandProbe = path.join(probeRoot, "brand-governance");
const output = path.join(probeRoot, "approval-workflow"); const primaryRepo = path.resolve(process.cwd(), "..", "..");
const sourceProject = path.join(primaryRepo, "generated", "projects", "project_8effec2a-4629-4945-b65c-41c4b6a0947c");
const sourcePptx = path.join(sourceProject, "output", "final.pptx"); const stagedProjects = path.join(brandProbe, "projects");
const projectId = "brand_governance_real_deck"; const stagedProject = path.join(stagedProjects, projectId);
const sha256 = async (file) => createHash("sha256").update(await fs.readFile(file)).digest("hex"); const sourceHashBefore = await sha256(sourcePptx);
const sourceAcceptance = JSON.parse(await fs.readFile(path.join(sourceProject, "output", "acceptance-manifest.json"), "utf8"));
const brandAcceptance = JSON.parse(await fs.readFile(path.join(brandProbe, "ACCEPTANCE_MANIFEST.json"), "utf8"));
if (sourceAcceptance.status !== "PASS" || brandAcceptance.status !== "PASS" || sourceAcceptance.checks.reopenedSlides > 8) throw new Error("Bounded real-deck and Brand Governance prerequisites must pass");
await fs.rm(output, { recursive: true, force: true }); await fs.mkdir(path.join(stagedProject, "render", "final"), { recursive: true }); await fs.mkdir(path.join(stagedProject, "qa"), { recursive: true });
await fs.copyFile(path.join(sourceProject, "render", "final", "inspect.ndjson"), path.join(stagedProject, "render", "final", "inspect.ndjson"));
const compliantDecisionPath = path.join(brandProbe, "compliant", "BRAND_GOVERNANCE_DECISION.json"); const stagedDecisionPath = path.join(stagedProject, "qa", "BRAND_GOVERNANCE_DECISION.json");
const compliantDecision = JSON.parse(await fs.readFile(compliantDecisionPath, "utf8")); await fs.copyFile(compliantDecisionPath, stagedDecisionPath);
const manifestFile = (await fs.readdir(path.join(stagedProject, "output"))).find((name) => name.startsWith("deck-generation-manifest-") && name.endsWith(".json"));
if (!manifestFile) throw new Error("Authoritative deck manifest is missing"); const manifest = JSON.parse(await fs.readFile(path.join(stagedProject, "output", manifestFile), "utf8"));

Object.assign(process.env, { PPT_FACTORY_TEAM_LIBRARY_BACKEND: "local", PPT_FACTORY_TEAM_LIBRARY_ALLOW_LOCAL_IDENTITY: "true",
  PPT_FACTORY_TEAM_LIBRARY_ROOT: path.join(brandProbe, "team-library"), PPT_FACTORY_PROJECTS_ROOT: stagedProjects,
  PPT_FACTORY_COLLABORATIVE_REVIEW_ROOT: path.join(output, "reviews"), PPT_FACTORY_APPROVAL_ROOT: path.join(output, "approvals") });
const headers = (userId, extra = {}) => ({ "content-type": "application/json", "x-ppt-tenant-id": "tenant_acceptance", "x-ppt-team-id": "team_brand", "x-ppt-user-id": userId, ...extra });
async function post(handler, userId, body, extra) { const response = await handler(new Request("http://local/api", { method: "POST", headers: headers(userId, extra), body: JSON.stringify(body) })); return { status: response.status, body: await response.json() }; }
const reviewPost = (userId, body, extra) => post(handleCollaborativeReviewPost, userId, body, extra); const approvalPost = (userId, body, extra) => post(handleApprovalWorkflowPost, userId, body, extra);

const opened = await reviewPost("owner_brand", { action: "open", projectId, deckVersionId: manifest.versionId }); if (opened.status !== 201) throw new Error(JSON.stringify(opened.body));
const sessionId = opened.body.session.sessionId; const openSubmit = await approvalPost("owner_brand", { action: "submit", reviewSessionId: sessionId });
const inspect = (await fs.readFile(path.join(sourceProject, "render", "final", "inspect.ndjson"), "utf8")).split(/\r?\n/).filter(Boolean).map(JSON.parse); const native = inspect.find((item) => item.kind !== "slide");
const commented = await reviewPost("viewer_brand", { action: "comment", sessionId, idempotencyKey: "approval-comment", expectedRevision: 0, target: { slide: native.slide, objectId: native.id }, text: "请在审批前核对。" });
const closedWithComment = await reviewPost("owner_brand", { action: "close", sessionId, idempotencyKey: "close-unresolved", expectedRevision: 1 });
const unresolvedSubmit = await approvalPost("owner_brand", { action: "submit", reviewSessionId: sessionId });
await reviewPost("owner_brand", { action: "reopen", sessionId, idempotencyKey: "reopen-resolve", expectedRevision: 2 });
await reviewPost("owner_brand", { action: "resolve", sessionId, idempotencyKey: "resolve-comment", expectedRevision: 3, commentId: commented.body.snapshot.comments[0].commentId });
const readyReview = await reviewPost("owner_brand", { action: "close", sessionId, idempotencyKey: "close-ready", expectedRevision: 4 });
const firstRequest = await approvalPost("owner_brand", { action: "submit", reviewSessionId: sessionId }); if (firstRequest.status !== 201) throw new Error(JSON.stringify(firstRequest.body));
await reviewPost("owner_brand", { action: "reopen", sessionId, idempotencyKey: "reopen-after-submit", expectedRevision: 5 });
const staleDecision = await approvalPost("owner_brand", { action: "decide", requestId: firstRequest.body.request.requestId, idempotencyKey: "stale-approve", expectedRevision: 0, decision: "approve" });
await reviewPost("owner_brand", { action: "close", sessionId, idempotencyKey: "close-again", expectedRevision: 6 });
const finalRequest = await approvalPost("owner_brand", { action: "submit", reviewSessionId: sessionId }); if (finalRequest.status !== 201) throw new Error(JSON.stringify(finalRequest.body));
const viewerDenied = await approvalPost("viewer_brand", { action: "decide", requestId: finalRequest.body.request.requestId, idempotencyKey: "forged-viewer", expectedRevision: 0, decision: "approve" }, { "x-ppt-role": "owner" });
const approved = await approvalPost("owner_brand", { action: "decide", requestId: finalRequest.body.request.requestId, idempotencyKey: "approve-final", expectedRevision: 0, decision: "approve", reason: "证据与评审均已闭环。", actorId: "forged", occurredAt: "1999-01-01T00:00:00.000Z" });
const replayed = await approvalPost("owner_brand", { action: "decide", requestId: finalRequest.body.request.requestId, idempotencyKey: "approve-final", expectedRevision: 0, decision: "approve", reason: "证据与评审均已闭环。" });
const terminalConflict = await approvalPost("owner_brand", { action: "decide", requestId: finalRequest.body.request.requestId, idempotencyKey: "reject-after", expectedRevision: 1, decision: "reject", reason: "late" });
const getResponse = await handleApprovalWorkflowGet(new Request(`http://local/api?requestId=${finalRequest.body.request.requestId}`, { headers: headers("viewer_brand") })); const finalApproval = await getResponse.json();
const blockedBase = { ...compliantDecision, decision: "BLOCKED", reasonCodes: ["BLOCKING:acceptance"] }; delete blockedBase.decisionHash;
await fs.writeFile(stagedDecisionPath, JSON.stringify({ ...blockedBase, decisionHash: brandArtifactHash(blockedBase) }), "utf8");
const blockedReview = await reviewPost("owner_brand", { action: "open", projectId, deckVersionId: manifest.versionId });
await reviewPost("owner_brand", { action: "close", sessionId: blockedReview.body.session.sessionId, idempotencyKey: "close-blocked", expectedRevision: 0 });
const blockedSubmit = await approvalPost("owner_brand", { action: "submit", reviewSessionId: blockedReview.body.session.sessionId }); await fs.copyFile(compliantDecisionPath, stagedDecisionPath);
const layoutFiles = (await fs.readdir(path.join(sourceProject, "render", "final"))).filter((name) => /^slide-\d+\.layout\.json$/.test(name)); const sourceHashAfter = await sha256(sourcePptx);
const artifactDirectory = path.join(output, "approvals", "tenant_acceptance", "team_brand", finalRequest.body.request.requestId);
const artifacts = ["APPROVAL_REQUEST.json", "APPROVAL_EVENTS.ndjson", "APPROVAL_SNAPSHOT.json", "APPROVAL_DECISION.json"];
const artifactFiles = (await Promise.all(artifacts.map((name) => fs.stat(path.join(artifactDirectory, name)).then((value) => value.isFile()).catch(() => false)))).every(Boolean);
const checks = {
  boundedExistingDeck: sourceAcceptance.checks.reopenedSlides >= 1 && sourceAcceptance.checks.reopenedSlides <= 8 && sourceAcceptance.checks.editableRatio >= 0.8,
  sourceHashUnchanged: sourceHashBefore === sourceHashAfter, persistedInspectAndLayouts: inspect.length > 0 && layoutFiles.length === sourceAcceptance.checks.reopenedSlides,
  openReviewRejected: openSubmit.status === 409, unresolvedCommentsRejected: closedWithComment.body.snapshot.status === "closed" && unresolvedSubmit.status === 409,
  staleRequestRejected: readyReview.body.snapshot.status === "closed" && staleDecision.status === 409, callerRoleIgnored: viewerDenied.status === 403,
  blockedGovernanceRejected: blockedReview.status === 201 && blockedSubmit.status === 409,
  authoritativeBinding: finalRequest.body.request.binding.deckManifestHash === opened.body.session.binding.deckManifestHash
    && finalRequest.body.request.binding.reviewSessionHash === opened.body.session.sessionHash
    && finalRequest.body.request.binding.reviewSnapshotHash === finalApproval.request.binding.reviewSnapshotHash,
  serverDecisionProvenance: approved.body.decision.decidedBy === "owner_brand" && approved.body.decision.decidedAt !== "1999-01-01T00:00:00.000Z",
  terminalIdempotency: approved.body.events.length === 1 && replayed.body.events.length === 1 && terminalConflict.status === 409,
  terminalDecisionReadable: getResponse.status === 200 && finalApproval.snapshot.status === "approved" && finalApproval.decision.decision === "APPROVED", artifactFiles
};
const acceptance = { schema: "ppt-factory/approval-workflow-acceptance/v1", status: Object.values(checks).every(Boolean) ? "PASS" : "FAIL",
  source: { projectId: sourceAcceptance.projectId, pptx: sourcePptx, sha256Before: sourceHashBefore, sha256After: sourceHashAfter, slides: sourceAcceptance.checks.reopenedSlides, editableRatio: sourceAcceptance.checks.editableRatio },
  approval: { requestId: finalApproval.request.requestId, reviewSessionId: sessionId, reviewRevision: finalApproval.request.binding.reviewRevision,
    deckVersionId: finalApproval.request.binding.deckVersionId, status: finalApproval.snapshot.status, decisionHash: finalApproval.decision.decisionHash }, checks, artifacts };
await fs.writeFile(path.join(output, "ACCEPTANCE_MANIFEST.json"), `${JSON.stringify(acceptance, null, 2)}\n`, "utf8"); console.log(JSON.stringify(acceptance, null, 2)); if (acceptance.status !== "PASS") process.exitCode = 1;
