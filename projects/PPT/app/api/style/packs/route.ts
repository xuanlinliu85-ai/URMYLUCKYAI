import { NextResponse } from "next/server";
import {
  applyStylePack, createStylePack, getStylePack, listStylePacks, normalizeStylePackLibrary,
  StylePackError, updateStylePack, type SaveStylePackInput, type StylePackLibrary
} from "@/lib/style-packs";
import { readJson, writeJson } from "@/storage/local-store";

export const runtime = "nodejs";

async function readLibrary(projectId: string) {
  try {
    return normalizeStylePackLibrary(await readJson<StylePackLibrary>(projectId, "style", "style-packs"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return normalizeStylePackLibrary();
    throw error;
  }
}

function errorResponse(error: unknown) {
  if (error instanceof StylePackError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.code === "NOT_FOUND" ? 404 : error.code === "CONFLICT" ? 409 : 400 });
  }
  return NextResponse.json({ error: error instanceof Error ? error.message : "Style Pack operation failed" }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId") ?? "";
    if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    const library = await readLibrary(projectId);
    const id = url.searchParams.get("id");
    return NextResponse.json(id
      ? { projectId, pack: getStylePack(library, id, url.searchParams.get("version") ?? undefined) }
      : { projectId, packs: listStylePacks(library) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      projectId?: string;
      action?: "create" | "update" | "apply";
      pack?: SaveStylePackInput;
      id?: string;
      version?: string;
      baseVersion?: string;
      changes?: Partial<SaveStylePackInput>;
    };
    const projectId = String(body.projectId ?? "");
    if (!projectId || !body.action) return NextResponse.json({ error: "projectId and action are required" }, { status: 400 });
    const library = await readLibrary(projectId);
    if (body.action === "create") {
      if (!body.pack) return NextResponse.json({ error: "pack is required" }, { status: 400 });
      const result = createStylePack(library, body.pack);
      await writeJson(projectId, "style", "style-packs", result.library);
      return NextResponse.json({ projectId, created: result.created, pack: result.pack }, { status: result.created ? 201 : 200 });
    }
    if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    if (body.action === "update") {
      const changes = body.changes ?? {};
      const result = updateStylePack(library, {
        id: body.id, baseVersion: body.baseVersion, version: body.version,
        name: changes.name, styleMix: changes.styleMix, metadata: changes.metadata,
        previews: changes.previews, previewDirection: changes.previewDirection, active: changes.active
      });
      await writeJson(projectId, "style", "style-packs", result.library);
      return NextResponse.json({ projectId, created: result.created, pack: result.pack }, { status: 201 });
    }
    const application = applyStylePack(library, body.id, body.version);
    await writeJson(projectId, "style", "final-style", application.finalStyle);
    await writeJson(projectId, "style", "style-mix", application.styleMix);
    await writeJson(projectId, "style", "style-pack-application", application);
    return NextResponse.json({ projectId, ...application });
  } catch (error) {
    return errorResponse(error);
  }
}
