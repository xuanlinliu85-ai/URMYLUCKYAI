import { mkdir } from "node:fs/promises";
import { NextResponse } from "next/server";
import { analyzePptx } from "@/adapters/reference-analyzer";
import { parseArtifactJson, runArtifactScript } from "@/adapters/native-pptx/run-artifact";
import { createAdaptiveProfessionalStyleDna, createBankInternalStyleDna, deriveStyleDna } from "@/lib/style/style-dna";
import { buildGoldenSlideLibrary } from "@/lib/golden-slides";
import { projectPath, saveUpload, writeJson } from "@/storage/local-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const projectId = String(form.get("projectId") || "");
    const learnStyle = String(form.get("learnStyle") || "false") === "true";
    const systemStylePreset = String(form.get("systemStylePreset") || "adaptive");
    const file = form.get("file");
    if (!projectId || !(file instanceof File) || !file.name.toLowerCase().endsWith(".pptx")) {
      return NextResponse.json({ error: "projectId and a .pptx file are required" }, { status: 400 });
    }
    const inputPath = await saveUpload(projectId, file.name, new Uint8Array(await file.arrayBuffer()));
    const renderDir = projectPath(projectId, "render", "reference");
    await mkdir(renderDir, { recursive: true });
    const renderResult = parseArtifactJson<{
      slides: number;
      contactSheet: string;
      compatibilityRepair?: { applied: boolean; replacements: number; repairedEntries: Array<{ name: string; replacements: number }>; initialImportError: string | null };
    }>(await runArtifactScript("render-reference.mjs", [inputPath, renderDir]));
    const analysis = await analyzePptx(inputPath, { renderDir });
    const referenceStyleDna = deriveStyleDna(analysis);
    const systemStyleDna = systemStylePreset === "bank-internal" ? createBankInternalStyleDna() : createAdaptiveProfessionalStyleDna();
    const styleDna = learnStyle ? referenceStyleDna : systemStyleDna;
    const goldenSlides = buildGoldenSlideLibrary(analysis, referenceStyleDna, learnStyle ? "learn-style" : "compatibility-only");
    await writeJson(projectId, "analysis", "reference-analysis", analysis);
    if (analysis.styleMeasurements) await writeJson(projectId, "analysis", "reference-style-measurements", analysis.styleMeasurements);
    await writeJson(projectId, "analysis", "reference-usage", {
      mode: learnStyle ? "learn-style" : "compatibility-only",
      systemStylePreset,
      sourceFile: analysis.filename,
      activeStyleSource: learnStyle ? referenceStyleDna.styleId : styleDna.styleId
    });
    await writeJson(projectId, "analysis", "golden-slides", goldenSlides);
    await writeJson(projectId, "style", "reference-style-dna", referenceStyleDna);
    await writeJson(projectId, "style", "system-style-dna", systemStyleDna);
    await writeJson(projectId, "style", "style-dna", styleDna);
    await writeJson(projectId, "render", "reference-manifest", renderResult);
    return NextResponse.json({
      projectId,
      analysis,
      styleDna,
      learnStyle,
      referenceStyleDna,
      goldenSlides,
      systemStyleDna,
      renderCompatibility: renderResult.compatibilityRepair ?? null,
      contactSheetUrl: `/api/files?projectId=${encodeURIComponent(projectId)}&stage=render&name=reference/contact-sheet.webp`,
      slideUrls: Array.from({ length: analysis.slideCount }, (_, i) => `/api/files?projectId=${encodeURIComponent(projectId)}&stage=render&name=reference/slide-${String(i + 1).padStart(3, "0")}.png`)
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Reference analysis failed" }, { status: 500 });
  }
}
