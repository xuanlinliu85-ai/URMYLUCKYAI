import path from "node:path";
import { NextResponse } from "next/server";
import { createLongImageExport } from "@/adapters/native-pptx/long-image.mjs";
import { projectPath } from "@/storage/local-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      projectId: string;
      renderSet?: "final" | "reference";
      slides: number[];
      background?: string;
    };
    const renderSet = body.renderSet ?? "final";
    if (!body.projectId || !["final", "reference"].includes(renderSet)) throw new Error("projectId and a valid renderSet are required");
    const outputDir = projectPath(body.projectId, "output", "long-image");
    const result = await createLongImageExport({
      sourceDir: projectPath(body.projectId, "render", renderSet),
      outputDir,
      slides: body.slides,
      basename: `${renderSet}-${body.slides.join("-")}`,
      background: body.background
    });
    const relative = (target: string) => path.relative(projectPath(body.projectId, "output"), target).replace(/\\/g, "/");
    return NextResponse.json({
      ...result,
      urls: {
        vertical9x16: `/api/files?projectId=${encodeURIComponent(body.projectId)}&stage=output&name=${encodeURIComponent(relative(result.variants.vertical9x16.path))}`,
        highResolution2160w: `/api/files?projectId=${encodeURIComponent(body.projectId)}&stage=output&name=${encodeURIComponent(relative(result.variants.highResolution2160w.path))}`,
        manifest: `/api/files?projectId=${encodeURIComponent(body.projectId)}&stage=output&name=${encodeURIComponent(relative(result.manifestPath))}`
      }
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Long-image export failed" }, { status: 400 });
  }
}
