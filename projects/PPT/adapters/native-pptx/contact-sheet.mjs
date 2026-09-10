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

export async function createContactSheet(outputDir, slideCount) {
  const sharp = await loadSharp();
  const columns = slideCount <= 3 ? 3 : slideCount <= 20 ? 4 : 5;
  const tileWidth = slideCount <= 3 ? 360 : slideCount <= 20 ? 300 : 280;
  const tileHeight = Math.round(tileWidth * 9 / 16);
  const labelHeight = 26;
  const cellHeight = tileHeight + labelHeight;
  const gap = slideCount <= 20 ? 20 : 14;
  const margin = 20;
  const rows = Math.ceil(slideCount / columns);
  const width = margin * 2 + columns * tileWidth + gap * (columns - 1);
  const height = margin * 2 + rows * cellHeight + gap * Math.max(0, rows - 1);
  const composites = [];
  for (let index = 0; index < slideCount; index += 1) {
    const source = path.join(outputDir, `slide-${String(index + 1).padStart(3, "0")}.png`);
    const slideNumber = String(index + 1).padStart(3, "0");
    const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tileWidth}" height="${labelHeight}"><rect x="0" y="2" width="44" height="22" rx="2" fill="#0E2B4F"/><text x="22" y="18" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" font-weight="700" fill="#FFFFFF">${slideNumber}</text></svg>`);
    const slide = await sharp(await fs.readFile(source)).resize(tileWidth, tileHeight, { fit: "contain", background: "#ffffff" }).png().toBuffer();
    const input = await sharp({ create: { width: tileWidth, height: cellHeight, channels: 4, background: "#d9dde0" } })
      .composite([{ input: label, left: 0, top: 0 }, { input: slide, left: 0, top: labelHeight }])
      .png()
      .toBuffer();
    composites.push({ input, left: margin + (index % columns) * (tileWidth + gap), top: margin + Math.floor(index / columns) * (cellHeight + gap) });
  }
  const target = path.join(outputDir, "contact-sheet.webp");
  await sharp({ create: { width, height, channels: 4, background: "#d9dde0" } }).composite(composites).webp({ quality: 88 }).toFile(target);
  return target;
}
