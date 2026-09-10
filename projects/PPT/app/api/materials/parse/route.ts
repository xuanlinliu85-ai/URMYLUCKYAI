import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { buildSlidePlans } from "@/lib/slide-plans";
import { analyzeContent } from "@/lib/content-analysis";
import { normalizeBindingInput } from "@/lib/data-binding";
import { generateStoryline } from "@/lib/storyline";
import type { BindingInput } from "@/lib/types";
import { saveUpload, writeJson } from "@/storage/local-store";
import { readJson } from "@/storage/local-store";
import type { GoldenSlideLibrary } from "@/lib/types";

export const runtime = "nodejs";

async function extractPdf(bytes: Uint8Array) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await pdfjs.getDocument({ data: bytes, useSystemFonts: true }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => "str" in item ? item.str : "").join(" "));
  }
  return pages.join("\n\n");
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const projectId = String(form.get("projectId") || "");
    const audience = String(form.get("audience") || "业务决策者");
    const purpose = String(form.get("purpose") || "形成清晰、可执行的判断");
    const pageTarget = Number(form.get("pageTarget") || 8);
    const rawText = String(form.get("text") || "");
    const file = form.get("file");
    const bindingFile = form.get("bindingFile");
    let text = rawText;
    let source: { type: "text" | "pdf"; name: string } = { type: "text", name: "inline-material" };
    if (file instanceof File && file.size) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const filePath = await saveUpload(projectId, file.name, bytes);
      const isPdf = file.name.toLowerCase().endsWith(".pdf");
      text = isPdf ? await extractPdf(bytes) : await readFile(filePath, "utf8");
      source = { type: isPdf ? "pdf" : "text", name: file.name };
    }
    if (!projectId || !text.trim()) return NextResponse.json({ error: "projectId and text or PDF are required" }, { status: 400 });
    const contentAnalysis = analyzeContent(text, source);
    let bindingInput: BindingInput | undefined;
    if (bindingFile instanceof File && bindingFile.size) {
      const lowerName = bindingFile.name.toLowerCase();
      const format = lowerName.endsWith(".json") ? "json" : lowerName.endsWith(".csv") ? "csv" : null;
      if (!format) return NextResponse.json({ error: "bindingFile must be JSON or CSV" }, { status: 400 });
      const bytes = new Uint8Array(await bindingFile.arrayBuffer());
      await saveUpload(projectId, bindingFile.name, bytes);
      bindingInput = { format, name: bindingFile.name, content: new TextDecoder().decode(bytes) };
      let normalized: ReturnType<typeof normalizeBindingInput>;
      try {
        normalized = normalizeBindingInput(bindingInput);
      } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Binding input is invalid" }, { status: 400 });
      }
      contentAnalysis.bindingSources = [normalized.source];
      await writeJson(projectId, "input", "binding-input", bindingInput);
    }
    const storyline = generateStoryline(text, audience, purpose, pageTarget);
    const goldenLibrary = await readJson<GoldenSlideLibrary>(projectId, "analysis", "golden-slides").catch(() => undefined);
    const slidePlans = buildSlidePlans(storyline, contentAnalysis, goldenLibrary);
    await writeJson(projectId, "analysis", "content-analysis", contentAnalysis);
    await writeJson(projectId, "storyline", "storyline", storyline);
    await writeJson(projectId, "slide-plans", "slide-plans", slidePlans);
    return NextResponse.json({ contentAnalysis, storyline, slidePlans, bindingInput });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Material parsing failed" }, { status: 500 });
  }
}
