import path from "node:path";
import { validateSupabaseTeamLibraryConfig } from "../adapters/supabase/team-style-library.ts";
import { ApprovalWorkflowError, ApprovalWorkflowService, LocalApprovalWorkflowRepository, type ApprovalBinding } from "./approval-workflow.ts";
import { LocalCollaborativeReviewRepository } from "./collaborative-review.ts";
import { resolveAuthoritativeReviewContext } from "./collaborative-review-api.ts";
import { canonicalize, isTrustedLocalTeamLibraryIdentityEnabled, LOCAL_TEAM_LIBRARY_IDENTITY_FLAG, LocalTeamStyleLibraryRepository, TeamStyleLibraryService, type TeamLibraryActor } from "./team-style-library.ts";

function json(value: unknown, status = 200) { return Response.json(value, { status }); }
function actorFrom(request: Request): TeamLibraryActor { return { tenantId: request.headers.get("x-ppt-tenant-id") ?? "", teamId: request.headers.get("x-ppt-team-id") ?? "", userId: request.headers.get("x-ppt-user-id") ?? "" }; }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }

async function withApprovalBinding<T>(actor: TeamLibraryActor, reviewSessionId: string, operation: (binding: ApprovalBinding) => Promise<T>): Promise<T> {
  const reviewRoot = process.env.PPT_FACTORY_COLLABORATIVE_REVIEW_ROOT || path.join(process.cwd(), "generated", "collaborative-review");
  return new LocalCollaborativeReviewRepository(reviewRoot).withExclusive(actor, reviewSessionId, async (review) => {
    if (review.snapshot.status !== "closed") throw new ApprovalWorkflowError("Collaborative Review must be closed before approval", "CONFLICT");
    const unresolved = review.snapshot.comments.filter((comment) => !comment.supersededBy && !comment.resolved);
    if (unresolved.length > 0) throw new ApprovalWorkflowError("Collaborative Review has active unresolved comments", "CONFLICT");
    let authoritative: Awaited<ReturnType<typeof resolveAuthoritativeReviewContext>>;
    try { authoritative = await resolveAuthoritativeReviewContext(actor, review.session.binding.projectId, review.session.binding.deckVersionId); }
    catch (error) { throw new ApprovalWorkflowError(error instanceof Error ? error.message : "Authoritative review context is invalid", "INTEGRITY"); }
    if (JSON.stringify(canonicalize(authoritative.binding)) !== JSON.stringify(canonicalize(review.session.binding))) throw new ApprovalWorkflowError("Collaborative Review binding no longer matches authoritative evidence", "INTEGRITY");
    if (authoritative.binding.brandDecision === "BLOCKED") throw new ApprovalWorkflowError("Blocked Brand Governance decision cannot enter approval", "CONFLICT");
    return operation({ tenantId: actor.tenantId, teamId: actor.teamId, projectId: authoritative.binding.projectId, deckVersionId: authoritative.binding.deckVersionId,
      deckSha256: authoritative.binding.deckSha256, deckManifestHash: authoritative.binding.deckManifestHash,
      evidenceManifestHash: authoritative.binding.evidenceManifestHash, brandDecisionHash: authoritative.binding.brandDecisionHash,
      reviewSessionId: review.session.sessionId, reviewSessionHash: review.session.sessionHash,
      reviewSnapshotHash: review.snapshot.snapshotHash, reviewRevision: review.snapshot.revision });
  });
}

function service() {
  const teamRoot = process.env.PPT_FACTORY_TEAM_LIBRARY_ROOT || path.join(process.cwd(), "generated", "team-style-library");
  const approvalRoot = process.env.PPT_FACTORY_APPROVAL_ROOT || path.join(process.cwd(), "generated", "approval-workflow");
  const teams = new TeamStyleLibraryService(new LocalTeamStyleLibraryRepository(teamRoot));
  return new ApprovalWorkflowService(new LocalApprovalWorkflowRepository(approvalRoot), teams, withApprovalBinding);
}
function unavailable() {
  if ((process.env.PPT_FACTORY_TEAM_LIBRARY_BACKEND ?? "local") !== "local") return json({ error: "Live authenticated Approval Workflow adapter is pending.", code: "REMOTE_ADAPTER_UNAVAILABLE", config: validateSupabaseTeamLibraryConfig() }, 503);
  if (!isTrustedLocalTeamLibraryIdentityEnabled()) return json({ error: `Local Approval Workflow identity is disabled. Set ${LOCAL_TEAM_LIBRARY_IDENTITY_FLAG}=true only for trusted local development.`, code: "LOCAL_IDENTITY_DISABLED" }, 503);
  return undefined;
}
function responseError(error: unknown) {
  if (error instanceof ApprovalWorkflowError) { const status = error.code === "NOT_FOUND" ? 404 : error.code === "FORBIDDEN" ? 403 : error.code === "CONFLICT" ? 409 : 400; return json({ error: error.message, code: error.code }, status); }
  if (error instanceof SyntaxError) return json({ error: "Request body must be valid JSON", code: "INVALID" }, 400);
  return json({ error: error instanceof Error ? error.message : "Approval Workflow operation failed" }, 500);
}

export async function handleApprovalWorkflowGet(request: Request) {
  try { const blocked = unavailable(); if (blocked) return blocked; const requestId = new URL(request.url).searchParams.get("requestId") ?? ""; return json(await service().get(actorFrom(request), requestId)); }
  catch (error) { return responseError(error); }
}
export async function handleApprovalWorkflowPost(request: Request) {
  try {
    const blocked = unavailable(); if (blocked) return blocked; const parsed = await request.json() as unknown;
    if (!isRecord(parsed)) throw new ApprovalWorkflowError("Request body must be a JSON object", "INVALID");
    const actor = actorFrom(request); const approvals = service(); const action = String(parsed.action ?? "");
    if (action === "submit") return json(await approvals.submit(actor, String(parsed.reviewSessionId ?? "")), 201);
    if (action === "decide") return json(await approvals.decide(actor, String(parsed.requestId ?? ""), {
      idempotencyKey: String(parsed.idempotencyKey ?? ""), expectedRevision: Number(parsed.expectedRevision),
      decision: String(parsed.decision ?? "") as "approve" | "reject", ...(parsed.reason !== undefined ? { reason: parsed.reason as string } : {})
    }));
    return json({ error: "Unsupported action", code: "INVALID" }, 400);
  } catch (error) { return responseError(error); }
}
