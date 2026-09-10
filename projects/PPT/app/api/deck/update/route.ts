import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { applyExistingDeckUpdate, inspectEditableDeck, normalizeDeckUpdatePlan, type DeckUpdatePlan } from "@/adapters/native-pptx/update-existing-deck.mjs";
import { validateArtifactName, validateVersionId, type DeckUpdateSource } from "@/lib/deck-update";
import { projectPath, writeJson } from "@/storage/local-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { projectId: string; source: DeckUpdateSource; outputVersionId: string; plan: DeckUpdatePlan };
    validateVersionId(body.projectId, "projectId");
    validateVersionId(body.outputVersionId, "outputVersionId");
    if (!body.source || !["input", "output"].includes(body.source.stage)) throw new Error("Source stage must be input or output");
    const sourceProjectId = body.source.projectId ? validateVersionId(body.source.projectId, "source.projectId") : body.projectId;
    const sourceName = validateArtifactName(body.source.name);
    const sourcePath = projectPath(sourceProjectId, body.source.stage, sourceName);
    const outputDirectory = projectPath(body.projectId, "output", "versions");
    const outputPath = path.join(outputDirectory, `${body.outputVersionId}.pptx`);
    await mkdir(outputDirectory, { recursive: true });
    const plan = normalizeDeckUpdatePlan({ ...body.plan, updateId: body.outputVersionId, sourceVersionId: body.source.versionId });
    await writeJson(body.projectId, "slide-plans", `deck-update-${body.outputVersionId}`, plan);
    const catalog = await inspectEditableDeck(sourcePath);
    await writeJson(body.projectId, "analysis", `editable-deck-catalog-${body.outputVersionId}`, catalog);
    const coreManifest = await applyExistingDeckUpdate({ sourcePath, outputPath, plan });
    const manifest = {
      ...coreManifest,
      source: { ...coreManifest.source, projectId: sourceProjectId },
      output: { ...coreManifest.output, filename: `versions/${body.outputVersionId}.pptx`, projectId: body.projectId }
    };
    const manifestPath = projectPath(body.projectId, "output", `deck-update-manifest-${body.outputVersionId}.json`);
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    return NextResponse.json({
      versionId: body.outputVersionId,
      pptx: outputPath,
      pptxUrl: `/api/files?projectId=${encodeURIComponent(body.projectId)}&stage=output&name=${encodeURIComponent(`versions/${body.outputVersionId}.pptx`)}`,
      manifest,
      manifestUrl: `/api/files?projectId=${encodeURIComponent(body.projectId)}&stage=output&name=${encodeURIComponent(`deck-update-manifest-${body.outputVersionId}.json`)}`
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Existing deck update failed";
    const expected = /required|must|missing|ambiguous|mismatch|forbidden|already exists|unknown|invalid/i.test(message);
    return NextResponse.json({ error: message }, { status: expected ? 400 : 500 });
  }
}
