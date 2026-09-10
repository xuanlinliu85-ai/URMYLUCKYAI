import { NextResponse } from "next/server";
import { buildSlidePlans } from "@/lib/slide-plans";
import { analyzeContent } from "@/lib/content-analysis";
import { artifactToPresentationText, assertResearchArtifact } from "@/lib/research-artifact.mjs";
import { generateStoryline } from "@/lib/storyline";
import { readJson, writeJson } from "@/storage/local-store";
import type { GoldenSlideLibrary } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const projectId = String(body.projectId || "");
    if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    const artifact = assertResearchArtifact(body.artifact);
    const text = artifactToPresentationText(artifact);
    const contentAnalysis = analyzeContent(text, { type: "text", name: `${artifact.artifact_id}.json` });
    const storyline = generateStoryline(text, String(body.audience || "业务决策者"), String(body.purpose || "呈现既有研究结论"), Number(body.pageTarget || 8));
    const goldenLibrary = await readJson<GoldenSlideLibrary>(projectId, "analysis", "golden-slides").catch(() => undefined);
    const slidePlans = buildSlidePlans(storyline, contentAnalysis, goldenLibrary);
    await writeJson(projectId, "input", "research-artifact", artifact);
    await writeJson(projectId, "analysis", "content-analysis", contentAnalysis);
    await writeJson(projectId, "storyline", "storyline", storyline);
    await writeJson(projectId, "slide-plans", "slide-plans", slidePlans);
    return NextResponse.json({ artifactId: artifact.artifact_id, contentAnalysis, storyline, slidePlans });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Research Artifact import failed" }, { status: 400 });
  }
}
