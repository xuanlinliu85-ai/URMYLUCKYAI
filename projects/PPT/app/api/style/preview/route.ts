import { mkdir } from "node:fs/promises";
import { NextResponse } from "next/server";
import { runArtifactScript } from "@/adapters/native-pptx/run-artifact";
import { createAdaptiveProfessionalStyleDna, resolveStyleMix } from "@/lib/style/style-dna";
import type { SlidePlan, Storyline, StyleControls, StyleDna, StyleMixArtifact } from "@/lib/types";
import { projectPath, writeJson } from "@/storage/local-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { projectId: string; storyline: Storyline; slidePlans: SlidePlan[]; styleDna: StyleDna; systemStyleDna?: StyleDna; promptText?: string; controls: StyleControls; previewSet?: string };
    const previewSet = /^[a-z0-9-]+$/.test(body.previewSet ?? "") ? body.previewSet! : "current";
    const mix = resolveStyleMix(body.styleDna, body.controls, {
      systemStyle: body.systemStyleDna ?? createAdaptiveProfessionalStyleDna(),
      promptText: body.promptText
    });
    const finalStyle = mix.finalStyle;
    const bankPreset = mix.systemStyle.styleId === "system_bank_internal_v1";
    const directions = [];
    for (const direction of ["A", "B", "C"]) {
      const outputDir = projectPath(body.projectId, "render", "previews", previewSet, direction);
      const outputPptx = projectPath(body.projectId, "output", `preview-${previewSet}-${direction}.pptx`);
      await mkdir(outputDir, { recursive: true });
      const requestPath = await writeJson(body.projectId, "slide-plans", `preview-request-${previewSet}-${direction}`, { preview: true, direction, storyline: body.storyline, slidePlans: body.slidePlans, style: finalStyle, controls: body.controls, outputDir, outputPptx });
      await runArtifactScript("generate-deck.mjs", [requestPath]);
      directions.push({
        id: direction,
        name: bankPreset
          ? direction === "A" ? "银行内部通报" : direction === "B" ? "机构终端" : "研究编辑部"
          : direction === "A" ? "编辑部暖色" : direction === "B" ? "机构终端" : "现代数据叙事",
        pptxUrl: `/api/files?projectId=${encodeURIComponent(body.projectId)}&stage=output&name=preview-${previewSet}-${direction}.pptx`,
        contactSheetUrl: `/api/files?projectId=${encodeURIComponent(body.projectId)}&stage=render&name=previews/${previewSet}/${direction}/contact-sheet.webp`,
        slideUrls: [1, 2, 3].map((i) => `/api/files?projectId=${encodeURIComponent(body.projectId)}&stage=render&name=previews/${previewSet}/${direction}/slide-${String(i).padStart(3, "0")}.png`)
      });
    }
    const styleMix: StyleMixArtifact = {
      previewSet,
      sources: {
        referenceStyleId: body.styleDna.styleId,
        systemStyleId: mix.systemStyle.styleId,
        ...(mix.promptStyle.promptInterpretation?.neutral ? {} : { promptStyleId: mix.promptStyle.styleId, promptText: body.promptText })
      },
      controls: body.controls,
      weights: mix.weights,
      locks: mix.locks,
      resolvedOwnership: mix.resolvedOwnership,
      finalStyleId: finalStyle.styleId,
      finalStyle,
      promptInterpretation: mix.promptStyle.promptInterpretation,
      generatedAt: new Date().toISOString()
    };
    await writeJson(body.projectId, "style", "final-style", finalStyle);
    await writeJson(body.projectId, "style", `style-mix-${previewSet}`, styleMix);
    await writeJson(body.projectId, "style", "style-mix", styleMix);
    await writeJson(body.projectId, "render", `preview-manifest-${previewSet}`, directions);
    await writeJson(body.projectId, "render", "preview-manifest", directions);
    return NextResponse.json({ previewSet, finalStyle, styleMix, directions });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Preview generation failed" }, { status: 500 });
  }
}
