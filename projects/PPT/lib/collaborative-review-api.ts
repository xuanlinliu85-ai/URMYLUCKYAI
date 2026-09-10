import { readFile } from "node:fs/promises";
import path from "node:path";
import { validateSupabaseTeamLibraryConfig } from "../adapters/supabase/team-style-library.ts";
import { BRAND_GOVERNANCE_DECISION_SCHEMA, type BrandGovernanceDecision } from "./brand-governance.ts";
import { brandArtifactHash } from "./brand-policy.ts";
import { CollaborativeReviewError, CollaborativeReviewService, LocalCollaborativeReviewRepository, type ReviewBinding, type ReviewTarget } from "./collaborative-review.ts";
import { resolveAuthoritativeDeckVersion, resolveDeckEvidenceManifest } from "./deck-version-binding.ts";
import { isTrustedLocalTeamLibraryIdentityEnabled, LOCAL_TEAM_LIBRARY_IDENTITY_FLAG, LocalTeamStyleLibraryRepository, TeamStyleLibraryService, type TeamLibraryActor } from "./team-style-library.ts";

const ID = /^[a-zA-Z0-9_-]{1,120}$/;
const POLICY_ID = /^[a-zA-Z0-9_\-\u3400-\u9fff]{1,120}$/;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const HASH = /^[a-f0-9]{64}$/;
function json(value: unknown, status = 200) { return Response.json(value, { status }); }
function projectsRoot() { return process.env.PPT_FACTORY_PROJECTS_ROOT || path.join(process.cwd(), "generated", "projects"); }
function projectFile(projectId: string, ...parts: string[]) {
  if (!ID.test(projectId)) throw new CollaborativeReviewError("projectId is invalid", "INVALID");
  return path.join(/* turbopackIgnore: true */ projectsRoot(), projectId, ...parts);
}
function actorFrom(request: Request): TeamLibraryActor { return { tenantId: request.headers.get("x-ppt-tenant-id") ?? "", teamId: request.headers.get("x-ppt-team-id") ?? "", userId: request.headers.get("x-ppt-user-id") ?? "" }; }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function onlyKeys(value: Record<string, unknown>, allowed: string[]) { return Object.keys(value).every((key) => allowed.includes(key)); }
function exactRecord(value: unknown, allowed: string[], required: string[], label: string): asserts value is Record<string, unknown> {
  if (!isRecord(value) || !onlyKeys(value, allowed) || required.some((key) => !(key in value))) throw new CollaborativeReviewError(`${label} is invalid`, "INTEGRITY");
}

function validateDecision(value: unknown, actor: TeamLibraryActor, deck: Awaited<ReturnType<typeof resolveAuthoritativeDeckVersion>>["binding"],
  evidence: Awaited<ReturnType<typeof resolveDeckEvidenceManifest>>) {
  if (!isRecord(value) || !onlyKeys(value, ["schema", "tenantId", "teamId", "decision", "reasonCodes", "binding", "decidedAt", "decisionHash"])
    || value.schema !== BRAND_GOVERNANCE_DECISION_SCHEMA || value.tenantId !== actor.tenantId || value.teamId !== actor.teamId
    || !["ALLOW", "ALLOW_WITH_WARNINGS", "BLOCKED"].includes(String(value.decision)) || !Array.isArray(value.reasonCodes)
    || value.reasonCodes.some((code) => typeof code !== "string") || new Set(value.reasonCodes).size !== value.reasonCodes.length
    || typeof value.decidedAt !== "string" || !Number.isFinite(Date.parse(value.decidedAt)) || !isRecord(value.binding)
    || typeof value.decisionHash !== "string" || !HASH.test(value.decisionHash)) throw new CollaborativeReviewError("Brand Governance decision is invalid", "INTEGRITY");
  const base = { ...value }; delete base.decisionHash;
  if (brandArtifactHash(base) !== value.decisionHash) throw new CollaborativeReviewError("Brand Governance decision hash mismatch", "INTEGRITY");
  exactRecord(value.binding, ["policy", "deck", "style", "evidence", "artifactSetHash", "reportHash"], ["policy", "deck", "style", "evidence", "artifactSetHash", "reportHash"], "Brand Governance binding");
  exactRecord(value.binding.policy, ["policyId", "version", "teamArtifactHash", "contentHash"], ["policyId", "version", "teamArtifactHash", "contentHash"], "Brand Governance policy binding");
  if (!POLICY_ID.test(String(value.binding.policy.policyId)) || typeof value.binding.policy.version !== "string" || !VERSION.test(value.binding.policy.version)
    || !HASH.test(String(value.binding.policy.teamArtifactHash)) || !HASH.test(String(value.binding.policy.contentHash))) throw new CollaborativeReviewError("Brand Governance policy binding is invalid", "INTEGRITY");
  exactRecord(value.binding.deck, ["versionId", "expectedSha256", "actualSha256", "projectId", "manifestType", "manifestName", "manifestHash", "pptxName", "slides", "evidenceManifestName", "evidenceManifestHash"],
    ["versionId", "expectedSha256", "actualSha256", "projectId", "manifestType", "manifestName", "manifestHash", "pptxName", "slides", "evidenceManifestName", "evidenceManifestHash"], "Brand Governance deck binding");
  const deckBinding = value.binding.deck;
  if (deckBinding.projectId !== deck.projectId || deckBinding.versionId !== deck.versionId
    || deckBinding.expectedSha256 !== deck.sha256 || deckBinding.actualSha256 !== deck.sha256 || deckBinding.manifestHash !== deck.manifestHash
    || deckBinding.manifestType !== deck.manifestType || deckBinding.manifestName !== deck.manifestName || deckBinding.pptxName !== deck.pptxName
    || deckBinding.evidenceManifestName !== evidence.manifestName || deckBinding.evidenceManifestHash !== evidence.manifestHash || deckBinding.slides !== deck.slides) {
    throw new CollaborativeReviewError("Brand Governance decision deck binding mismatch", "INTEGRITY");
  }
  exactRecord(value.binding.style, ["styleDnaExpectedHash", "styleDnaActualHash", "styleMixExpectedHash", "styleMixActualHash"], [], "Brand Governance style binding");
  if (Object.values(value.binding.style).some((hash) => !HASH.test(String(hash)))) throw new CollaborativeReviewError("Brand Governance style binding is invalid", "INTEGRITY");
  if (!Array.isArray(value.binding.evidence) || value.binding.evidence.length !== 9) throw new CollaborativeReviewError("Brand Governance evidence binding is invalid", "INTEGRITY");
  const evidenceNames = new Set(["styleDna", "styleMix", "slidePlans", "inspect", "layouts", "fontEvidence", "imageEvidence", "chartPackManifest", "qaReport"]);
  const seen = new Set<string>();
  for (const item of value.binding.evidence) {
    exactRecord(item, ["name", "expectedHash", "actualHash"], ["name"], "Brand Governance evidence item"); const name = String(item.name);
    if (!evidenceNames.has(name) || seen.has(name) || (item.expectedHash !== undefined && !HASH.test(String(item.expectedHash)))
      || (item.actualHash !== undefined && !HASH.test(String(item.actualHash)))) throw new CollaborativeReviewError("Brand Governance evidence item is invalid", "INTEGRITY");
    if (item.expectedHash !== evidence.evidenceHashes[name as keyof typeof evidence.evidenceHashes]
      || item.actualHash !== evidence.evidenceHashes[name as keyof typeof evidence.evidenceHashes]) {
      throw new CollaborativeReviewError("Brand Governance evidence item does not match the authoritative manifest", "INTEGRITY");
    }
    seen.add(name);
  }
  if (!HASH.test(String(value.binding.artifactSetHash)) || !HASH.test(String(value.binding.reportHash))
    || brandArtifactHash(value.binding.evidence.map((item) => ({ name: item.name, actualHash: item.actualHash ?? null }))) !== value.binding.artifactSetHash) {
    throw new CollaborativeReviewError("Brand Governance artifact binding is invalid", "INTEGRITY");
  }
  return value as unknown as BrandGovernanceDecision;
}

export async function resolveAuthoritativeReviewContext(actor: TeamLibraryActor, projectId: string, deckVersionId: string): Promise<{ binding: ReviewBinding }> {
  let deck: Awaited<ReturnType<typeof resolveAuthoritativeDeckVersion>>;
  let evidence: Awaited<ReturnType<typeof resolveDeckEvidenceManifest>>;
  try {
    deck = await resolveAuthoritativeDeckVersion(projectsRoot(), projectId, deckVersionId);
    evidence = await resolveDeckEvidenceManifest(projectsRoot(), deck.binding, actor);
  } catch (error) { throw new CollaborativeReviewError(error instanceof Error ? error.message : "Authoritative deck evidence is invalid", "INTEGRITY"); }
  let inspect: unknown[]; let decisionValue: unknown;
  try {
    const lines = (await readFile(projectFile(projectId, "render", "final", "inspect.ndjson"), "utf8")).split(/\r?\n/).filter(Boolean);
    inspect = lines.map((line) => JSON.parse(line) as unknown);
    decisionValue = JSON.parse(await readFile(projectFile(projectId, "qa", "BRAND_GOVERNANCE_DECISION.json"), "utf8")) as unknown;
  } catch (error) { throw new CollaborativeReviewError(error instanceof Error ? error.message : "Review evidence is missing", "INTEGRITY"); }
  if (brandArtifactHash(inspect) !== evidence.evidenceHashes.inspect) throw new CollaborativeReviewError("Inspect evidence hash mismatch", "INTEGRITY");
  const decision = validateDecision(decisionValue, actor, deck.binding, evidence);
  const nativeTargets: Record<string, string[]> = {};
  for (const item of inspect) {
    if (!isRecord(item) || !Number.isInteger(item.slide) || typeof item.id !== "string") throw new CollaborativeReviewError("Inspect native identity is invalid", "INTEGRITY");
    const slide = Number(item.slide);
    if (slide < 1 || slide > deck.binding.slides) throw new CollaborativeReviewError("Inspect slide identity is invalid", "INTEGRITY");
    nativeTargets[String(slide)] ??= [];
    if (item.kind !== "slide") {
      if (nativeTargets[String(slide)].includes(item.id)) throw new CollaborativeReviewError("Inspect native identity is duplicated", "INTEGRITY");
      nativeTargets[String(slide)].push(item.id);
    }
  }
  for (let slide = 1; slide <= deck.binding.slides; slide += 1) nativeTargets[String(slide)] = [...new Set(nativeTargets[String(slide)] ?? [])].sort();
  return { binding: { tenantId: actor.tenantId, teamId: actor.teamId, projectId, deckVersionId,
    deckSha256: deck.binding.sha256, deckManifestHash: deck.binding.manifestHash, evidenceManifestHash: evidence.manifestHash,
    brandDecisionHash: decision.decisionHash, brandDecision: decision.decision, slides: deck.binding.slides,
    nativeTargets, nativeTargetsHash: brandArtifactHash(nativeTargets) } };
}

function service() {
  const teamRoot = process.env.PPT_FACTORY_TEAM_LIBRARY_ROOT || path.join(process.cwd(), "generated", "team-style-library");
  const reviewRoot = process.env.PPT_FACTORY_COLLABORATIVE_REVIEW_ROOT || path.join(process.cwd(), "generated", "collaborative-review");
  const teams = new TeamStyleLibraryService(new LocalTeamStyleLibraryRepository(teamRoot));
  return new CollaborativeReviewService(new LocalCollaborativeReviewRepository(reviewRoot), teams, resolveAuthoritativeReviewContext);
}
function unavailable() {
  if ((process.env.PPT_FACTORY_TEAM_LIBRARY_BACKEND ?? "local") !== "local") return json({ error: "Live authenticated Collaborative Review adapter is pending.", code: "REMOTE_ADAPTER_UNAVAILABLE", config: validateSupabaseTeamLibraryConfig() }, 503);
  if (!isTrustedLocalTeamLibraryIdentityEnabled()) return json({ error: `Local Collaborative Review identity is disabled. Set ${LOCAL_TEAM_LIBRARY_IDENTITY_FLAG}=true only for trusted local development.`, code: "LOCAL_IDENTITY_DISABLED" }, 503);
  return undefined;
}
function responseError(error: unknown) {
  if (error instanceof CollaborativeReviewError) { const status = error.code === "NOT_FOUND" ? 404 : error.code === "FORBIDDEN" ? 403 : error.code === "CONFLICT" ? 409 : 400; return json({ error: error.message, code: error.code }, status); }
  if (error instanceof SyntaxError) return json({ error: "Request body must be valid JSON", code: "INVALID" }, 400);
  return json({ error: error instanceof Error ? error.message : "Collaborative Review operation failed" }, 500);
}

export async function handleCollaborativeReviewGet(request: Request) {
  try { const blocked = unavailable(); if (blocked) return blocked; const id = new URL(request.url).searchParams.get("sessionId") ?? ""; return json(await service().get(actorFrom(request), id)); } catch (error) { return responseError(error); }
}
export async function handleCollaborativeReviewPost(request: Request) {
  try {
    const blocked = unavailable(); if (blocked) return blocked;
    const parsed = await request.json() as unknown; if (!isRecord(parsed)) throw new CollaborativeReviewError("Request body must be a JSON object", "INVALID");
    const actor = actorFrom(request); const reviews = service(); const action = String(parsed.action ?? ""); const sessionId = String(parsed.sessionId ?? "");
    const common = { idempotencyKey: String(parsed.idempotencyKey ?? ""), expectedRevision: Number(parsed.expectedRevision) };
    if (action === "open") return json(await reviews.open(actor, String(parsed.projectId ?? ""), String(parsed.deckVersionId ?? "")), 201);
    if (action === "comment") return json(await reviews.addComment(actor, sessionId, { ...common, target: parsed.target as ReviewTarget, text: String(parsed.text ?? "") }), 201);
    if (action === "supersede") return json(await reviews.supersedeComment(actor, sessionId, { ...common, commentId: String(parsed.commentId ?? ""), text: String(parsed.text ?? "") }));
    if (action === "resolve") return json(await reviews.resolveComment(actor, sessionId, { ...common, commentId: String(parsed.commentId ?? "") }));
    if (action === "close" || action === "reopen") return json(await reviews.setStatus(actor, sessionId, { ...common, status: action === "close" ? "closed" : "open" }));
    return json({ error: "Unsupported action", code: "INVALID" }, 400);
  } catch (error) { return responseError(error); }
}
