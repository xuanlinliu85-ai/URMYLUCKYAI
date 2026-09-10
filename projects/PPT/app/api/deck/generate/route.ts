import { mkdir } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { parseArtifactJson, runArtifactScript } from "@/adapters/native-pptx/run-artifact";
import { resolveSlidePlanBindings } from "@/lib/data-binding";
import { publishGeneratedDeckVersion } from "@/lib/deck-version-binding";
import type { BindingInput, BindingManifest, SlidePlan, Storyline, StyleControls, StyleDna } from "@/lib/types";
import { projectPath, writeJson } from "@/storage/local-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { projectId: string; direction: "A" | "B" | "C"; storyline: Storyline; slidePlans: SlidePlan[]; finalStyle: StyleDna; controls: StyleControls; bindingInput?: BindingInput; imageQaFixture?: boolean; qaFixture?: { chartLabelCollision?: boolean } };
    const outputDir = projectPath(body.projectId, "render", "final");
    const outputPptx = projectPath(body.projectId, "output", "final.pptx");
    await mkdir(outputDir, { recursive: true });
    const hasBindingTargets = body.slidePlans.some((plan) => (plan.bindingTargets?.length ?? 0) > 0);
    let slidePlans = body.slidePlans;
    let bindingManifest: BindingManifest | undefined;
    if (body.bindingInput || hasBindingTargets) {
      if (!body.bindingInput) return NextResponse.json({ error: "Slide Plan contains binding targets but bindingInput is missing" }, { status: 400 });
      let resolved: ReturnType<typeof resolveSlidePlanBindings>;
      try {
        resolved = resolveSlidePlanBindings(body.slidePlans, body.bindingInput);
      } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Binding input is invalid" }, { status: 400 });
      }
      bindingManifest = resolved.manifest;
      await writeJson(body.projectId, "slide-plans", "binding-manifest", bindingManifest);
      if (bindingManifest.status === "error") {
        return NextResponse.json({
          error: `Unresolved binding keys: ${bindingManifest.unresolvedKeys.join(", ")}`,
          bindingManifest
        }, { status: 400 });
      }
      slidePlans = resolved.slidePlans;
    }
    const deckRequest = { preview: false, direction: body.direction, storyline: body.storyline, slidePlans, style: body.finalStyle, controls: body.controls, outputDir, outputPptx, repairPass: 0, bindingManifest, imageQaFixture: body.imageQaFixture === true, qaFixture: body.qaFixture };
    const requestPath = await writeJson(body.projectId, "slide-plans", "deck-request", deckRequest);
    const result = parseArtifactJson<{ pptx: string; slides: number; direction: string }>(await runArtifactScript("generate-deck.mjs", [requestPath]));
    const published = await publishGeneratedDeckVersion({ projectsRoot: path.join(process.cwd(), "generated", "projects"), projectId: body.projectId,
      finalPptxPath: outputPptx, slides: result.slides, direction: result.direction });
    await writeJson(body.projectId, "output", "deck-manifest", { ...result, authoritativeVersion: published.manifest,
      authoritativeManifestHash: published.manifestHash });
    return NextResponse.json({
      ...result,
      deckVersionId: published.manifest.versionId,
      deckVersionSha256: published.manifest.output.sha256,
      pptxUrl: `/api/files?projectId=${encodeURIComponent(body.projectId)}&stage=output&name=final.pptx`,
      contactSheetUrl: `/api/files?projectId=${encodeURIComponent(body.projectId)}&stage=render&name=final/contact-sheet.webp`,
      renderDir: outputDir,
      bindingManifest,
      bindingManifestUrl: bindingManifest ? `/api/files?projectId=${encodeURIComponent(body.projectId)}&stage=slide-plans&name=binding-manifest.json` : undefined,
      chartPackManifestUrl: `/api/files?projectId=${encodeURIComponent(body.projectId)}&stage=render&name=final/chart-pack-manifest.json`
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Deck generation failed" }, { status: 500 });
  }
}
