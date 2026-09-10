import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { handleCollaborativeReviewGet, handleCollaborativeReviewPost } from "../lib/collaborative-review-api.ts";

const probeRoot = path.join(process.cwd(), "generated", "probes");
const brandProbe = path.join(probeRoot, "brand-governance");
const output = path.join(probeRoot, "collaborative-review");
const primaryRepo = path.resolve(process.cwd(), "..", "..");
const sourceProject = path.join(primaryRepo, "generated", "projects", "project_8effec2a-4629-4945-b65c-41c4b6a0947c");
const sourcePptx = path.join(sourceProject, "output", "final.pptx");
const stagedProjects = path.join(brandProbe, "projects");
const projectId = "brand_governance_real_deck";
const stagedProject = path.join(stagedProjects, projectId);
const sha256 = async (file) => createHash("sha256").update(await fs.readFile(file)).digest("hex");
const sourceHashBefore = await sha256(sourcePptx);
const sourceAcceptance = JSON.parse(await fs.readFile(path.join(sourceProject, "output", "acceptance-manifest.json"), "utf8"));
const brandAcceptance = JSON.parse(await fs.readFile(path.join(brandProbe, "ACCEPTANCE_MANIFEST.json"), "utf8"));
if (sourceAcceptance.status !== "PASS" || brandAcceptance.status !== "PASS" || sourceAcceptance.checks.reopenedSlides > 8) {
  throw new Error("Bounded real-deck and Brand Governance prerequisites must pass");
}

await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(path.join(stagedProject, "render", "final"), { recursive: true });
await fs.mkdir(path.join(stagedProject, "qa"), { recursive: true });
await fs.copyFile(path.join(sourceProject, "render", "final", "inspect.ndjson"), path.join(stagedProject, "render", "final", "inspect.ndjson"));
const decisionPath = path.join(brandProbe, "compliant", "BRAND_GOVERNANCE_DECISION.json");
const brandDecision = JSON.parse(await fs.readFile(decisionPath, "utf8"));
await fs.copyFile(decisionPath, path.join(stagedProject, "qa", "BRAND_GOVERNANCE_DECISION.json"));

const manifestFile = (await fs.readdir(path.join(stagedProject, "output"))).find((name) => name.startsWith("deck-generation-manifest-") && name.endsWith(".json"));
if (!manifestFile) throw new Error("Authoritative deck manifest is missing");
const manifest = JSON.parse(await fs.readFile(path.join(stagedProject, "output", manifestFile), "utf8"));
const deckVersionId = manifest.versionId;

process.env.PPT_FACTORY_TEAM_LIBRARY_BACKEND = "local";
process.env.PPT_FACTORY_TEAM_LIBRARY_ALLOW_LOCAL_IDENTITY = "true";
process.env.PPT_FACTORY_TEAM_LIBRARY_ROOT = path.join(brandProbe, "team-library");
process.env.PPT_FACTORY_PROJECTS_ROOT = stagedProjects;
process.env.PPT_FACTORY_COLLABORATIVE_REVIEW_ROOT = path.join(output, "reviews");
const headers = (userId, extra = {}) => ({ "content-type": "application/json", "x-ppt-tenant-id": "tenant_acceptance", "x-ppt-team-id": "team_brand", "x-ppt-user-id": userId, ...extra });
async function post(userId, body, extraHeaders) {
  const response = await handleCollaborativeReviewPost(new Request("http://local/api/team/collaborative-review", { method: "POST", headers: headers(userId, extraHeaders), body: JSON.stringify(body) }));
  return { status: response.status, body: await response.json() };
}

const viewerDenied = await post("viewer_brand", { action: "open", projectId, deckVersionId }, { "x-ppt-role": "owner" });
const opened = await post("owner_brand", { action: "open", projectId, deckVersionId });
if (opened.status !== 201) throw new Error(`Review open failed: ${JSON.stringify(opened.body)}`);
const sessionId = opened.body.session.sessionId;
const inspect = (await fs.readFile(path.join(sourceProject, "render", "final", "inspect.ndjson"), "utf8")).split(/\r?\n/).filter(Boolean).map(JSON.parse);
const native = inspect.find((item) => item.kind !== "slide");
const unknownTarget = await post("viewer_brand", { action: "comment", sessionId, idempotencyKey: "unknown-target", expectedRevision: 0,
  target: { slide: native.slide, objectId: "sh/unknown" }, text: "invalid" });
const commented = await post("viewer_brand", { action: "comment", sessionId, idempotencyKey: "comment-acceptance", expectedRevision: 0,
  target: { slide: native.slide, objectId: native.id }, text: "请核对该原生对象的业务结论。", actorId: "forged", occurredAt: "1999-01-01T00:00:00.000Z" });
const replayed = await post("viewer_brand", { action: "comment", sessionId, idempotencyKey: "comment-acceptance", expectedRevision: 0,
  target: { slide: native.slide, objectId: native.id }, text: "请核对该原生对象的业务结论。" });
const closed = await post("owner_brand", { action: "close", sessionId, idempotencyKey: "close-acceptance", expectedRevision: 1 });
const getResponse = await handleCollaborativeReviewGet(new Request(`http://local/api/team/collaborative-review?sessionId=${sessionId}`, { headers: headers("viewer_brand") }));
const finalReview = await getResponse.json();
const layoutFiles = (await fs.readdir(path.join(sourceProject, "render", "final"))).filter((name) => /^slide-\d+\.layout\.json$/.test(name));
const sourceHashAfter = await sha256(sourcePptx);
const checks = {
  boundedExistingDeck: sourceAcceptance.checks.reopenedSlides >= 1 && sourceAcceptance.checks.reopenedSlides <= 8 && sourceAcceptance.checks.editableRatio >= 0.8,
  sourceHashUnchanged: sourceHashBefore === sourceHashAfter,
  persistedInspectAndLayouts: inspect.length > 0 && layoutFiles.length === sourceAcceptance.checks.reopenedSlides,
  callerRoleIgnored: viewerDenied.status === 403,
  authoritativeBindings: opened.body.session.binding.deckManifestHash === brandDecision.binding.deck.manifestHash
    && opened.body.session.binding.deckSha256 === sourceHashBefore && opened.body.session.binding.evidenceManifestHash === brandAcceptance.evidence.manifestHash
    && opened.body.session.binding.brandDecisionHash === brandDecision.decisionHash,
  unknownNativeTargetRejected: unknownTarget.status === 400,
  storedIdentityAndTimeAuthoritative: commented.body.events[0].actorId === "viewer_brand" && commented.body.events[0].occurredAt !== "1999-01-01T00:00:00.000Z",
  idempotentAppend: commented.body.events.length === 1 && replayed.body.events.length === 1,
  closeAndRead: closed.body.snapshot.status === "closed" && getResponse.status === 200 && finalReview.snapshot.status === "closed",
  appendOnlyArtifacts: false
};
const artifactDirectory = path.join(output, "reviews", "tenant_acceptance", "team_brand", sessionId);
checks.appendOnlyArtifacts = (await Promise.all(["COLLABORATIVE_REVIEW_SESSION.json", "COLLABORATIVE_REVIEW_EVENTS.ndjson", "COLLABORATIVE_REVIEW_SNAPSHOT.json"].map(async (name) =>
  fs.stat(path.join(artifactDirectory, name)).then((stat) => stat.isFile()).catch(() => false)))).every(Boolean);
const acceptance = {
  schema: "ppt-factory/collaborative-review-acceptance/v1", status: Object.values(checks).every(Boolean) ? "PASS" : "FAIL",
  source: { projectId: sourceAcceptance.projectId, pptx: sourcePptx, sha256Before: sourceHashBefore, sha256After: sourceHashAfter,
    slides: sourceAcceptance.checks.reopenedSlides, editableRatio: sourceAcceptance.checks.editableRatio },
  session: { sessionId, deckVersionId, revision: finalReview.snapshot.revision, status: finalReview.snapshot.status,
    deckManifestHash: opened.body.session.binding.deckManifestHash, evidenceManifestHash: opened.body.session.binding.evidenceManifestHash,
    brandDecisionHash: opened.body.session.binding.brandDecisionHash },
  checks, artifacts: ["COLLABORATIVE_REVIEW_SESSION.json", "COLLABORATIVE_REVIEW_EVENTS.ndjson", "COLLABORATIVE_REVIEW_SNAPSHOT.json"]
};
await fs.writeFile(path.join(output, "ACCEPTANCE_MANIFEST.json"), `${JSON.stringify(acceptance, null, 2)}\n`, "utf8");
console.log(JSON.stringify(acceptance, null, 2));
if (acceptance.status !== "PASS") process.exitCode = 1;
