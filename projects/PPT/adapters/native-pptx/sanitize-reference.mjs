import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const NEGATIVE_CHART_AXIS_ID = /(<c:(?:axId|crossAx)\b[^>]*\bval=")-(\d+)(")/g;

async function loadJsZip() {
  const candidates = [
    process.env.PPT_FACTORY_JSZIP,
    process.env.RUNTIME_NODE_MODULES && path.join(process.env.RUNTIME_NODE_MODULES, "jszip", "lib", "index.js")
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const module = await import(pathToFileURL(candidate).href);
      return module.default ?? module;
    } catch {}
  }
  const module = await import("jszip");
  return module.default ?? module;
}

/**
 * Creates a render-only copy of a PPTX with WPS-compatible negative chart axis
 * identifiers normalized to unsigned values accepted by Artifact Tool.
 * The user's source file is never modified.
 */
export async function sanitizePptxForArtifactTool(inputPath, outputPath) {
  const JSZip = await loadJsZip();
  const zip = await JSZip.loadAsync(await fs.readFile(inputPath));
  const repairedEntries = [];
  let replacements = 0;

  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir || !/^ppt\/charts\/chart\d+\.xml$/i.test(name)) continue;
    const xml = await entry.async("string");
    let entryReplacements = 0;
    const repaired = xml.replace(NEGATIVE_CHART_AXIS_ID, (_match, prefix, digits, suffix) => {
      entryReplacements += 1;
      return `${prefix}${digits}${suffix}`;
    });
    if (entryReplacements > 0) {
      zip.file(name, repaired);
      repairedEntries.push({ name, replacements: entryReplacements });
      replacements += entryReplacements;
    }
  }

  if (replacements === 0) {
    return { changed: false, outputPath: inputPath, replacements: 0, repairedEntries: [] };
  }

  await fs.writeFile(outputPath, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } }));
  return { changed: true, outputPath, replacements, repairedEntries };
}

if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, "/")}`).href) {
  const [inputPath, outputPath] = process.argv.slice(2);
  if (!inputPath || !outputPath) throw new Error("Usage: sanitize-reference.mjs <input.pptx> <output.pptx>");
  console.log(JSON.stringify(await sanitizePptxForArtifactTool(inputPath, outputPath)));
}
