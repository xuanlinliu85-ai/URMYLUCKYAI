import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { projectPath } from "@/storage/local-store";

export const runtime = "nodejs";

const contentTypes: Record<string, string> = {
  ".png": "image/png",
  ".webp": "image/webp",
  ".json": "application/json",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation"
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId") || "";
    const stage = url.searchParams.get("stage") || "";
    const name = url.searchParams.get("name") || "";
    if (!/^(input|analysis|style|storyline|slide-plans|render|qa|output)$/.test(stage) || name.includes("..")) throw new Error("Invalid path");
    const target = projectPath(projectId, stage, ...name.split("/").filter(Boolean));
    const bytes = await readFile(target);
    return new NextResponse(bytes, { headers: { "Content-Type": contentTypes[path.extname(target).toLowerCase()] || "application/octet-stream", "Content-Disposition": path.extname(target).toLowerCase() === ".pptx" ? `attachment; filename="${path.basename(target)}"` : "inline" } });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
