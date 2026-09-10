import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

async function loadSharp() {
  const candidates = [
    process.env.PPT_FACTORY_SHARP,
    process.env.RUNTIME_NODE_MODULES && path.join(process.env.RUNTIME_NODE_MODULES, "sharp", "dist", "index.mjs")
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const module = await import(pathToFileURL(candidate).href);
      return module.default ?? module;
    } catch {}
  }
  const module = await import("sharp");
  return module.default ?? module;
}

function positiveInteger(value, label) {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${label} must be a positive integer`);
  return value;
}

function hexColor(value) {
  if (!/^#[0-9A-Fa-f]{6}$/.test(value)) throw new Error("background must be a six-digit hex color");
  return value.toUpperCase();
}

async function slideSources(sourceDir, slides, sharp) {
  if (!Array.isArray(slides) || !slides.length || slides.length > 8) throw new Error("slides must contain 1-8 slide numbers");
  const normalized = slides.map((slide, index) => positiveInteger(slide, `slides[${index}]`));
  if (new Set(normalized).size !== normalized.length) throw new Error("slides must not contain duplicates");
  return Promise.all(normalized.map(async (slide) => {
    const filename = `slide-${String(slide).padStart(3, "0")}.png`;
    const source = path.join(sourceDir, filename);
    const metadata = await sharp(source).metadata();
    if (!metadata.width || !metadata.height) throw new Error(`Invalid rendered slide: ${filename}`);
    return { slide, filename, source, width: metadata.width, height: metadata.height, aspectRatio: metadata.width / metadata.height };
  }));
}

async function renderVariant({ sharp, sources, target, canvasWidth, canvasHeight, margin, gap, background }) {
  const availableWidth = canvasWidth - margin * 2;
  const naturalHeights = sources.map((source) => availableWidth / source.aspectRatio);
  const availableHeight = canvasHeight ? canvasHeight - margin * 2 - gap * Math.max(0, sources.length - 1) : Number.POSITIVE_INFINITY;
  const scale = Math.min(1, availableHeight / naturalHeights.reduce((sum, height) => sum + height, 0));
  const pageWidth = Math.max(1, Math.round(availableWidth * scale));
  const pageHeights = sources.map((source) => Math.max(1, Math.round(pageWidth / source.aspectRatio)));
  const contentHeight = pageHeights.reduce((sum, height) => sum + height, 0) + gap * Math.max(0, sources.length - 1);
  const outputHeight = canvasHeight ?? contentHeight + margin * 2;
  let top = Math.max(margin, Math.round((outputHeight - contentHeight) / 2));
  const composites = [];
  const placements = [];
  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index];
    const height = pageHeights[index];
    const left = Math.round((canvasWidth - pageWidth) / 2);
    const input = await sharp(source.source).resize(pageWidth, height, { fit: "contain", background }).png().toBuffer();
    composites.push({ input, left, top });
    placements.push({ slide: source.slide, sourceWidth: source.width, sourceHeight: source.height, left, top, width: pageWidth, height, cropped: false });
    top += height + gap;
  }
  await sharp({ create: { width: canvasWidth, height: outputHeight, channels: 4, background } }).composite(composites).png().toFile(target);
  return { path: target, width: canvasWidth, height: outputHeight, margin, gap, background, placements };
}

export async function createLongImageExport({ sourceDir, outputDir, slides, basename = "long-image", background = "#FFFFFF" }) {
  const sharp = await loadSharp();
  const safeBackground = hexColor(background);
  const safeBasename = String(basename).replace(/[^a-zA-Z0-9_-]/g, "-") || "long-image";
  await fs.mkdir(outputDir, { recursive: true });
  const sources = await slideSources(sourceDir, slides, sharp);
  const verticalPath = path.join(outputDir, `${safeBasename}-9x16.png`);
  const highResolutionPath = path.join(outputDir, `${safeBasename}-2160w.png`);
  const vertical = await renderVariant({ sharp, sources, target: verticalPath, canvasWidth: 1080, canvasHeight: 1920, margin: 24, gap: 24, background: safeBackground });
  const highResolution = await renderVariant({ sharp, sources, target: highResolutionPath, canvasWidth: 2160, canvasHeight: null, margin: 72, gap: 48, background: safeBackground });
  const manifest = {
    schema: "ppt-factory/long-image-manifest/v1",
    sourceDir,
    slideOrder: sources.map((source) => source.slide),
    sourceFiles: sources.map(({ slide, filename, width, height, aspectRatio }) => ({ slide, filename, width, height, aspectRatio: Number(aspectRatio.toFixed(6)) })),
    variants: { vertical9x16: vertical, highResolution2160w: highResolution },
    createdAt: new Date().toISOString()
  };
  const manifestPath = path.join(outputDir, "LONG_IMAGE_MANIFEST.json");
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  return { ...manifest, manifestPath };
}
