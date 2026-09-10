import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateSupabaseTeamLibraryConfig } from "../adapters/supabase/team-style-library.ts";
import { BrandPolicyError, brandArtifactHash, type BrandPolicyDraft } from "./brand-policy.ts";
import { BrandGovernanceService, type BrandGovernanceInput } from "./brand-governance.ts";
import { publishDeckEvidenceManifest, resolveAuthoritativeDeckVersion, resolveDeckEvidenceManifest } from "./deck-version-binding.ts";
import {
  isTrustedLocalTeamLibraryIdentityEnabled,
  LOCAL_TEAM_LIBRARY_IDENTITY_FLAG,
  LocalTeamStyleLibraryRepository,
  TeamLibraryError,
  TeamStyleLibraryService,
  type TeamLibraryActor
} from "./team-style-library.ts";

function json(value: unknown, status = 200) {
  return Response.json(value, { status });
}

function services() {
  const team = new TeamStyleLibraryService(new LocalTeamStyleLibraryRepository(
    process.env.PPT_FACTORY_TEAM_LIBRARY_ROOT || path.join(process.cwd(), "generated", "team-style-library")
  ));
  return { team, governance: new BrandGovernanceService(team, undefined,
    (actor, projectId, deckVersionId) => loadGovernanceInput(projectId, { deckVersionId }, actor)) };
}

function projectsRoot() {
  return process.env.PPT_FACTORY_PROJECTS_ROOT || path.join(process.cwd(), "generated", "projects");
}

function projectFile(projectId: string, ...parts: string[]) {
  if (!/^[a-zA-Z0-9_-]{1,120}$/.test(projectId)) throw new BrandPolicyError("projectId is invalid");
  return path.join(/* turbopackIgnore: true */ projectsRoot(), projectId, ...parts);
}

async function persistGovernanceArtifact(projectId: string, name: string, value: unknown) {
  const directory = projectFile(projectId, "qa");
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, `${name}.json`);
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return file;
}

function actorFrom(request: Request): TeamLibraryActor {
  return {
    tenantId: request.headers.get("x-ppt-tenant-id") ?? "",
    teamId: request.headers.get("x-ppt-team-id") ?? "",
    userId: request.headers.get("x-ppt-user-id") ?? ""
  };
}

function responseError(error: unknown) {
  if (error instanceof TeamLibraryError) {
    const status = error.code === "NOT_FOUND" ? 404 : error.code === "FORBIDDEN" ? 403 : error.code === "CONFLICT" ? 409 : 400;
    return json({ error: error.message, code: error.code }, status);
  }
  if (error instanceof BrandPolicyError) return json({ error: error.message, code: error.code }, 400);
  if (error instanceof SyntaxError) return json({ error: "Request body must be valid JSON", code: "INVALID" }, 400);
  return json({ error: error instanceof Error ? error.message : "Brand Governance operation failed" }, 500);
}

function unavailableResponse() {
  if ((process.env.PPT_FACTORY_TEAM_LIBRARY_BACKEND ?? "local") !== "local") {
    return json({
      error: "Live Supabase/Auth Brand Governance is pending; the configured Team Style Library adapter remains a contract.",
      code: "REMOTE_ADAPTER_UNAVAILABLE",
      config: validateSupabaseTeamLibraryConfig()
    }, 503);
  }
  if (!isTrustedLocalTeamLibraryIdentityEnabled()) {
    return json({
      error: `Local Brand Governance identity is disabled. Set ${LOCAL_TEAM_LIBRARY_IDENTITY_FLAG}=true only for trusted local development.`,
      code: "LOCAL_IDENTITY_DISABLED"
    }, 503);
  }
  return undefined;
}

async function readOptional(file: string) {
  try {
    return await readFile(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function readJsonOptional(file: string) {
  const bytes = await readOptional(file);
  return bytes ? JSON.parse(bytes.toString("utf8")) as unknown : undefined;
}

async function readInspect(projectId: string) {
  const bytes = await readOptional(projectFile(projectId, "render", "final", "inspect.ndjson"));
  if (!bytes) return undefined;
  return bytes.toString("utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as unknown);
}

async function readLayouts(projectId: string) {
  const directory = projectFile(projectId, "render", "final");
  let files: string[];
  try {
    files = (await readdir(directory)).filter((name) => /^slide-\d+\.layout\.json$/.test(name)).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  return Promise.all(files.map((name) => readJsonOptional(path.join(directory, name))));
}

async function loadPersistedEvidence(projectId: string) {
  const [styleDna, styleMix, slidePlans, inspect, layouts, fontEvidence, imageEvidence, chartPackManifest, qaReport] = await Promise.all([
    readJsonOptional(projectFile(projectId, "style", "final-style.json")),
    readJsonOptional(projectFile(projectId, "style", "style-mix.json")),
    readJsonOptional(projectFile(projectId, "slide-plans", "slide-plans.json")),
    readInspect(projectId),
    readLayouts(projectId),
    readJsonOptional(projectFile(projectId, "render", "final", "font-evidence.json")),
    readJsonOptional(projectFile(projectId, "render", "final", "image-metadata.json")),
    readJsonOptional(projectFile(projectId, "render", "final", "chart-pack-manifest.json")),
    readJsonOptional(projectFile(projectId, "qa", "qa-report.json"))
  ]);
  return { styleDna, styleMix, slidePlans, inspect, layouts, fontEvidence, imageEvidence, chartPackManifest, qaReport };
}

async function resolveDeck(projectId: string, body: Record<string, unknown>) {
  const deckVersionId = String(body.deckVersionId ?? "");
  try {
    return await resolveAuthoritativeDeckVersion(projectsRoot(), projectId, deckVersionId);
  } catch (error) {
    throw new BrandPolicyError(error instanceof Error ? error.message : "Authoritative deck version is invalid");
  }
}

async function loadGovernanceInput(projectId: string, body: Record<string, unknown>, actor: TeamLibraryActor): Promise<BrandGovernanceInput> {
  const resolvedDeck = await resolveDeck(projectId, body);
  let evidenceManifest: Awaited<ReturnType<typeof resolveDeckEvidenceManifest>>;
  try {
    evidenceManifest = await resolveDeckEvidenceManifest(projectsRoot(), resolvedDeck.binding, actor);
  } catch (error) {
    throw new BrandPolicyError(error instanceof Error ? error.message : "Authoritative deck evidence manifest is invalid");
  }
  const content = await loadPersistedEvidence(projectId);
  const expected = (name: keyof typeof content) => evidenceManifest.evidenceHashes[name];
  return {
    deckVersionId: resolvedDeck.binding.versionId,
    deckBinding: { ...resolvedDeck.binding, evidenceManifestName: evidenceManifest.manifestName,
      evidenceManifestHash: evidenceManifest.manifestHash },
    deckBytes: resolvedDeck.bytes,
    evidence: {
      styleDna: { expectedHash: expected("styleDna"), content: content.styleDna as never },
      styleMix: { expectedHash: expected("styleMix"), content: content.styleMix as never },
      slidePlans: { expectedHash: expected("slidePlans"), content: content.slidePlans as never },
      inspect: { expectedHash: expected("inspect"), content: content.inspect },
      layouts: { expectedHash: expected("layouts"), content: content.layouts },
      fontEvidence: { expectedHash: expected("fontEvidence"), content: content.fontEvidence },
      imageEvidence: { expectedHash: expected("imageEvidence"), content: content.imageEvidence },
      chartPackManifest: { expectedHash: expected("chartPackManifest"), content: content.chartPackManifest },
      qaReport: { expectedHash: expected("qaReport"), content: content.qaReport as never }
    }
  };
}

export async function handleBrandGovernanceGet(request: Request) {
  try {
    const unavailable = unavailableResponse();
    if (unavailable) return unavailable;
    const url = new URL(request.url);
    const library = new TeamStyleLibraryService(new LocalTeamStyleLibraryRepository(
      process.env.PPT_FACTORY_TEAM_LIBRARY_ROOT || path.join(process.cwd(), "generated", "team-style-library")
    ));
    const actor = actorFrom(request);
    const policyId = url.searchParams.get("policyId");
    if (policyId) return json({ artifact: await library.getArtifact(actor, "brand_policy", policyId, url.searchParams.get("version") ?? undefined) });
    return json({ artifacts: await library.listArtifacts(actor, { artifactType: "brand_policy", state: (url.searchParams.get("state") as "published" | "archived" | "all" | null) ?? "published" }) });
  } catch (error) {
    return responseError(error);
  }
}

export async function handleBrandGovernancePost(request: Request) {
  try {
    const unavailable = unavailableResponse();
    if (unavailable) return unavailable;
    const parsed = await request.json() as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new BrandPolicyError("Request body must be a JSON object");
    const body = parsed as Record<string, unknown> & { action?: string };
    const actor = actorFrom(request);
    const { team, governance } = services();
    if (body.action === "publish-policy") {
      return json({ artifact: await governance.publishPolicy(actor, body.policy as BrandPolicyDraft) }, 201);
    }
    if (body.action === "publish-evidence") {
      await team.requireRole(actor, ["owner", "editor"]);
      const projectId = String(body.projectId ?? "");
      const resolvedDeck = await resolveDeck(projectId, body);
      const evidence = await loadPersistedEvidence(projectId);
      const evidenceHashes = Object.fromEntries(
        Object.entries(evidence).map(([name, content]) => [name, brandArtifactHash(content)])
      ) as Parameters<typeof publishDeckEvidenceManifest>[0]["evidenceHashes"];
      const published = await publishDeckEvidenceManifest({ projectsRoot: projectsRoot(), deck: resolvedDeck.binding, evidenceHashes,
        tenantId: actor.tenantId, teamId: actor.teamId, publishedBy: actor.userId, publishedAt: new Date().toISOString() });
      return json(published, 201);
    }
    if (body.action === "enforce") {
      const projectId = String(body.projectId ?? "");
      const result = await governance.enforce(actor, String(body.policyId ?? ""), body.policyVersion ? String(body.policyVersion) : undefined,
        projectId, String(body.deckVersionId ?? ""));
      const reportPath = await persistGovernanceArtifact(projectId, "BRAND_GOVERNANCE_REPORT", result.report);
      const decisionPath = await persistGovernanceArtifact(projectId, "BRAND_GOVERNANCE_DECISION", result.decision);
      return json({ ...result, artifacts: { reportPath, decisionPath } });
    }
    return json({ error: "Unsupported action", code: "INVALID" }, 400);
  } catch (error) {
    return responseError(error);
  }
}
