import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { ensureProject, writeJson } from "@/storage/local-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const projectId = `project_${randomUUID()}`;
  await ensureProject(projectId);
  const project = { id: projectId, name: body.name || "未命名 PPT Factory 项目", status: "created", createdAt: new Date().toISOString() };
  await writeJson(projectId, "analysis", "project", project);
  return NextResponse.json(project, { status: 201 });
}
