import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createContactSheet } from "./contact-sheet.mjs";
import { sanitizePptxForArtifactTool } from "./sanitize-reference.mjs";

async function loadArtifactTool() {
  const candidates = [
    process.env.PPT_FACTORY_ARTIFACT_TOOL,
    process.env.RUNTIME_NODE_MODULES && path.join(process.env.RUNTIME_NODE_MODULES, "@oai", "artifact-tool", "dist", "artifact_tool.mjs")
  ].filter(Boolean);
  for (const candidate of candidates) {
    try { return await import(pathToFileURL(candidate).href); } catch {}
  }
  return import("@oai/artifact-tool");
}

async function writeBlob(target, blob) {
  await fs.writeFile(target, new Uint8Array(await blob.arrayBuffer()));
}

const [input, outputDir] = process.argv.slice(2);
if (!input || !outputDir) throw new Error("Usage: render-reference.mjs <input.pptx> <output-dir>");
await fs.rm(outputDir, { recursive: true, force: true });
await fs.mkdir(outputDir, { recursive: true });
const { FileBlob, PresentationFile } = await loadArtifactTool();
let renderInput = input;
let compatibilityRepair = { changed: false, outputPath: input, replacements: 0, repairedEntries: [] };
let initialImportError = null;
let presentation;
try {
  presentation = await PresentationFile.importPptx(await FileBlob.load(renderInput));
} catch (error) {
  initialImportError = error instanceof Error ? error.message : String(error);
  const sanitizedPath = path.join(outputDir, ".artifact-tool-compatible.pptx");
  compatibilityRepair = await sanitizePptxForArtifactTool(input, sanitizedPath);
  if (!compatibilityRepair.changed) throw error;
  renderInput = compatibilityRepair.outputPath;
  presentation = await PresentationFile.importPptx(await FileBlob.load(renderInput));
}
for (const [index, slide] of presentation.slides.items.entries()) {
  const stem = `slide-${String(index + 1).padStart(3, "0")}`;
  await writeBlob(path.join(outputDir, `${stem}.png`), await presentation.export({ slide, format: "png", scale: 1 }));
  const layout = await slide.export({ format: "layout" });
  await fs.writeFile(path.join(outputDir, `${stem}.layout.json`), await layout.text(), "utf8");
}
await createContactSheet(outputDir, presentation.slides.items.length);
const inspect = await presentation.inspect({ kind: "slide,textbox,shape,image,table,chart,layout", maxChars: 1000000 });
await fs.writeFile(path.join(outputDir, "inspect.ndjson"), inspect.ndjson, "utf8");
const result = {
  slides: presentation.slides.items.length,
  contactSheet: path.join(outputDir, "contact-sheet.webp"),
  compatibilityRepair: {
    applied: compatibilityRepair.changed,
    replacements: compatibilityRepair.replacements,
    repairedEntries: compatibilityRepair.repairedEntries,
    initialImportError
  }
};
await fs.writeFile(path.join(outputDir, "render-report.json"), JSON.stringify(result, null, 2), "utf8");
console.log(JSON.stringify(result));
