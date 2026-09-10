import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { createLongImageExport } from "../adapters/native-pptx/long-image.mjs";

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const sourceDir = path.resolve(option("source-dir", "generated/projects/project_8effec2a-4629-4945-b65c-41c4b6a0947c/render/final"));
const outputDir = path.resolve(option("output-dir", "generated/probes/long-image-export"));
const slides = option("slides", "1,4,7").split(",").map(Number);
const available = (await fs.readdir(sourceDir)).filter((name) => /^slide-\d+\.png$/.test(name)).length;
if (available < 1 || available > 8) throw new Error(`Acceptance source must contain 1-8 slides; found ${available}`);
const result = await createLongImageExport({ sourceDir, outputDir, slides, basename: "acceptance" });
const vertical = await sharp(result.variants.vertical9x16.path).metadata();
const highResolution = await sharp(result.variants.highResolution2160w.path).metadata();
const checks = {
  sourceSlides: available,
  selectedSlides: slides.length,
  orderPreserved: JSON.stringify(result.slideOrder) === JSON.stringify(slides),
  verticalDimensions: vertical.width === 1080 && vertical.height === 1920,
  highResolutionWidth: highResolution.width === 2160,
  noCropping: Object.values(result.variants).every((variant) => variant.placements.every((placement) => placement.cropped === false)),
  aspectRatioPreserved: Object.values(result.variants).every((variant) => variant.placements.every((placement) => {
    const sourceRatio = placement.sourceWidth / placement.sourceHeight;
    const outputRatio = placement.width / placement.height;
    return Math.abs(sourceRatio - outputRatio) < 0.002;
  }))
};
const report = { status: Object.values(checks).every(Boolean) ? "PASS" : "FAIL", sourceDir, outputDir, checks, manifestPath: result.manifestPath, variants: result.variants };
await fs.writeFile(path.join(outputDir, "acceptance-report.json"), JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify(report));
if (report.status !== "PASS") process.exitCode = 1;
