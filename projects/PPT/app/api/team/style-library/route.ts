import { NextResponse } from "next/server";
import {
  authenticateSupabaseTeamLibraryActor,
  createSupabaseTeamStyleLibraryRepository,
  SupabaseTeamLibraryRequestError,
  validateSupabaseTeamLibraryConfig
} from "@/adapters/supabase/team-style-library";
import {
  isTrustedLocalTeamLibraryIdentityEnabled, LOCAL_TEAM_LIBRARY_IDENTITY_FLAG,
  LocalTeamStyleLibraryRepository, TeamLibraryError, TeamStyleLibraryService,
  type TeamArtifactType, type TeamGoldenSlideSnapshot, type TeamLibraryActor, type TeamRole
} from "@/lib/team-style-library";
import type { StylePackVersion } from "@/lib/style-packs";

export const runtime = "nodejs";

function localActorFrom(request: Request): TeamLibraryActor {
  return {
    tenantId: request.headers.get("x-ppt-tenant-id") ?? "",
    teamId: request.headers.get("x-ppt-team-id") ?? "",
    userId: request.headers.get("x-ppt-user-id") ?? ""
  };
}

async function requestContext(request: Request) {
  const backend = (process.env.PPT_FACTORY_TEAM_LIBRARY_BACKEND ?? "local").trim().toLowerCase();
  if (backend === "local") {
    if (!localIdentityEnabled()) return { response: localIdentityUnavailable() } as const;
    const actor = localActorFrom(request);
    return {
      actor,
      service: new TeamStyleLibraryService(new LocalTeamStyleLibraryRepository())
    } as const;
  }
  if (backend !== "supabase") {
    throw new SupabaseTeamLibraryRequestError("Unsupported Team Style Library backend", "REMOTE_CONFIG_INVALID", 503);
  }
  const actor = await authenticateSupabaseTeamLibraryActor(request);
  return {
    actor,
    service: new TeamStyleLibraryService(createSupabaseTeamStyleLibraryRepository(actor))
  } as const;
}

function responseError(error: unknown) {
  if (error instanceof SupabaseTeamLibraryRequestError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  if (error instanceof TeamLibraryError) {
    const status = error.code === "NOT_FOUND" ? 404 : error.code === "FORBIDDEN" ? 403 : error.code === "CONFLICT" ? 409 : 400;
    return NextResponse.json({ error: error.message, code: error.code }, { status });
  }
  if (error instanceof SyntaxError) return NextResponse.json({ error: "Request body must be valid JSON", code: "INVALID" }, { status: 400 });
  return NextResponse.json({ error: error instanceof Error ? error.message : "Team Style Library operation failed" }, { status: 500 });
}

function localIdentityUnavailable() {
  return NextResponse.json({
    error: `Local Team Style Library identity is disabled. Set ${LOCAL_TEAM_LIBRARY_IDENTITY_FLAG}=true only for trusted local development, or configure a future authenticated repository adapter.`,
    code: "LOCAL_IDENTITY_DISABLED"
  }, { status: 503 });
}

function localIdentityEnabled() {
  return isTrustedLocalTeamLibraryIdentityEnabled();
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("action") === "supabase-config") {
      return NextResponse.json(validateSupabaseTeamLibraryConfig());
    }
    const context = await requestContext(request);
    if ("response" in context) return context.response;
    const { actor, service: library } = context;
    const artifactId = url.searchParams.get("artifactId");
    const artifactType = url.searchParams.get("artifactType") as TeamArtifactType | null;
    if (Boolean(artifactId) !== Boolean(artifactType)) {
      return NextResponse.json({ error: "artifactId and artifactType must be provided together", code: "INVALID" }, { status: 400 });
    }
    if (artifactId && artifactType) {
      return NextResponse.json({ artifact: await library.getArtifact(actor, artifactType, artifactId, url.searchParams.get("version") ?? undefined) });
    }
    if (url.searchParams.get("action") === "library") {
      return NextResponse.json({ library: await library.getLibrary(actor) });
    }
    return NextResponse.json({
      artifacts: await library.listArtifacts(actor, {
        ...(artifactType ? { artifactType } : {}),
        state: (url.searchParams.get("state") as "published" | "archived" | "all" | null) ?? "published"
      })
    });
  } catch (error) {
    return responseError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await requestContext(request);
    if ("response" in context) return context.response;
    const parsed = await request.json() as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new TeamLibraryError("Request body must be a JSON object", "INVALID");
    const body = parsed as Record<string, unknown> & { action?: string };
    const { actor, service: library } = context;
    switch (body.action) {
      case "create-team":
        return NextResponse.json({ library: await library.createTeam(actor, String(body.name ?? "")) }, { status: 201 });
      case "set-member":
        return NextResponse.json({ library: await library.setMember(actor, String(body.memberUserId ?? ""), String(body.role ?? "") as TeamRole) });
      case "publish-style-pack":
        return NextResponse.json({ artifact: await library.publishStylePack(actor, body.pack as StylePackVersion, {
          sourceProjectId: body.sourceProjectId ? String(body.sourceProjectId) : undefined,
          name: body.name ? String(body.name) : undefined
        }) }, { status: 201 });
      case "publish-golden-slide":
        return NextResponse.json({ artifact: await library.publishGoldenSlide(actor, body.snapshot as TeamGoldenSlideSnapshot,
          String(body.version ?? "1.0.0"), {
            sourceProjectId: body.sourceProjectId ? String(body.sourceProjectId) : undefined,
            name: body.name ? String(body.name) : undefined
          }) }, { status: 201 });
      case "archive":
        return NextResponse.json({ artifact: await library.archiveArtifact(actor,
          String(body.artifactType ?? "") as TeamArtifactType, String(body.artifactId ?? ""), String(body.version ?? "")) });
      default:
        return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
    }
  } catch (error) {
    return responseError(error);
  }
}
