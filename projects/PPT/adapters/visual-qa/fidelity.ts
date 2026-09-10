import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { FidelityDimension, FidelityReport, LockState } from "@/lib/types";

type DeckFeatures = {
  slideCount: number;
  color: number[];
  layout: number[];
  composition: number[];
  typography: number[];
  chart: number[];
  density: number[];
  storytelling: number[];
  visualTone: number[];
};

type Box = { left: number; top: number; width: number; height: number; text: boolean; fontSize?: number; bold?: boolean; chart: boolean };
type TextRun = { fontSize: number; bold: boolean };

const DIMENSION_WEIGHTS = {
  typography: 20,
  color: 15,
  layout: 20,
  chartStyle: 15,
  density: 10,
  composition: 10,
  storytelling: 5,
  visualTone: 5
} as const;

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, value));
}

function average(vectors: number[][], width: number) {
  if (!vectors.length) return Array(width).fill(0);
  return Array.from({ length: width }, (_, index) => vectors.reduce((sum, vector) => sum + (vector[index] ?? 0), 0) / vectors.length);
}

function cosine(a: number[], b: number[]) {
  const width = Math.max(a.length, b.length);
  let dot = 0, aa = 0, bb = 0;
  for (let index = 0; index < width; index += 1) {
    const x = a[index] ?? 0, y = b[index] ?? 0;
    dot += x * y; aa += x * x; bb += y * y;
  }
  if (!aa && !bb) return 1;
  if (!aa || !bb) return 0;
  return clamp(dot / Math.sqrt(aa * bb));
}

function semanticScore(a: number[], b: number[]) {
  // Semantic fidelity should remain tolerant of unrelated content while still
  // separating materially different design systems.
  const total = a.reduce((sum, value) => sum + Math.abs(value), 0) + b.reduce((sum, value) => sum + Math.abs(value), 0);
  const relativeDistance = total === 0 ? 0 : a.reduce((sum, value, index) => sum + Math.abs(value - (b[index] ?? 0)), 0) / total;
  const similarity = 0.45 * cosine(a, b) + 0.55 * (1 - clamp(relativeDistance));
  return Number((55 + similarity * 45).toFixed(1));
}

function collectBoxes(value: unknown, boxes: Box[] = []): Box[] {
  if (!value || typeof value !== "object") return boxes;
  const record = value as Record<string, unknown>;
  const position = record.position as Record<string, unknown> | undefined;
  const bbox = Array.isArray(record.bbox) && record.bbox.length === 4 ? record.bbox as number[] : null;
  const geometry = bbox ?? (position && ["left", "top", "width", "height"].every((key) => typeof position[key] === "number")
    ? [position.left, position.top, position.width, position.height] as number[] : null);
  const textRecord = record.text && typeof record.text === "object" ? record.text as Record<string, unknown> : undefined;
  const style = (record.resolvedTextStyle ?? textRecord?.style ?? record.style) as Record<string, unknown> | undefined;
  const name = String(record.name ?? record.kind ?? record.type ?? "").toLowerCase();
  if (geometry) boxes.push({
    left: Number(geometry[0]), top: Number(geometry[1]), width: Number(geometry[2]), height: Number(geometry[3]),
    text: typeof record.text === "string" || typeof textRecord?.text === "string" || name.includes("text"),
    fontSize: typeof record.resolvedFontSize === "number" ? record.resolvedFontSize : typeof record.fontSize === "number" ? record.fontSize : typeof style?.fontSize === "number" ? style.fontSize : undefined,
    bold: Boolean(style?.bold), chart: name.includes("chart")
  });
  Object.values(record).forEach((child) => collectBoxes(child, boxes));
  return boxes;
}

function collectTextRuns(value: unknown, runs: TextRun[] = []): TextRun[] {
  if (!value || typeof value !== "object") return runs;
  if (Array.isArray(value)) {
    value.forEach((item) => collectTextRuns(item, runs));
    return runs;
  }
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.runs)) {
    for (const item of record.runs) {
      if (!item || typeof item !== "object") continue;
      const run = item as Record<string, unknown>;
      if (typeof run.fontSize === "number") runs.push({ fontSize: run.fontSize, bold: Boolean(run.bold) });
    }
  }
  Object.entries(record).filter(([key]) => key !== "runs").forEach(([, child]) => collectTextRuns(child, runs));
  return runs;
}

async function imageFeatures(file: string) {
  const { data, info } = await sharp(file).resize(64, 36, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const color = Array(24).fill(0);
  const composition = Array(12).fill(0);
  const gray: number[] = [];
  let luminance = 0, saturation = 0, foreground = 0;
  const background = [data[0], data[1], data[2]];
  for (let pixel = 0; pixel < info.width * info.height; pixel += 1) {
    const offset = pixel * 3;
    const r = data[offset], g = data[offset + 1], b = data[offset + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const lum = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;
    const sat = max ? (max - min) / max : 0;
    luminance += lum; saturation += sat; gray.push(lum);
    color[Math.min(7, Math.floor(r / 32))] += 1;
    color[8 + Math.min(7, Math.floor(g / 32))] += 1;
    color[16 + Math.min(7, Math.floor(b / 32))] += 1;
    const distance = Math.abs(r - background[0]) + Math.abs(g - background[1]) + Math.abs(b - background[2]);
    if (distance > 54) {
      foreground += 1;
      const x = pixel % info.width, y = Math.floor(pixel / info.width);
      composition[Math.min(2, Math.floor(y / 12)) * 4 + Math.min(3, Math.floor(x / 16))] += 1;
    }
  }
  let contrast = 0, edges = 0;
  const mean = luminance / gray.length;
  for (let y = 0; y < info.height; y += 1) for (let x = 0; x < info.width; x += 1) {
    const index = y * info.width + x;
    contrast += (gray[index] - mean) ** 2;
    if (x > 0) edges += Math.abs(gray[index] - gray[index - 1]);
    if (y > 0) edges += Math.abs(gray[index] - gray[index - info.width]);
  }
  const total = info.width * info.height;
  return {
    color: color.map((value) => value / (total * 3)),
    composition: composition.map((value) => value / total),
    density: [foreground / total, edges / (total * 2)],
    visualTone: [mean, Math.sqrt(contrast / total), saturation / total, edges / (total * 2)]
  };
}

async function deckFeatures(renderDir: string): Promise<DeckFeatures> {
  const names = await readdir(renderDir);
  const images = names.filter((name) => /^slide-\d+\.png$/.test(name)).sort();
  const layouts = names.filter((name) => /^slide-\d+\.layout\.json$/.test(name)).sort();
  const imageVectors = await Promise.all(images.map((name) => imageFeatures(path.join(renderDir, name))));
  const layoutVectors: number[][] = [], typographyVectors: number[][] = [], chartVectors: number[][] = [], rhythm: number[] = [];
  for (const name of layouts) {
    const layout = JSON.parse(await readFile(path.join(renderDir, name), "utf8"));
    const boxes = collectBoxes(layout);
    const textRuns = collectTextRuns(layout);
    const grid = Array(12).fill(0);
    const fonts = Array(6).fill(0);
    let chartCount = 0;
    boxes.forEach((box) => {
      const centerX = clamp((box.left + box.width / 2) / 1280, 0, 0.999);
      const centerY = clamp((box.top + box.height / 2) / 720, 0, 0.999);
      grid[Math.floor(centerY * 3) * 4 + Math.floor(centerX * 4)] += 1;
      if (box.chart) chartCount += 1;
    });
    let boldWeight = 0;
    let typographyWeight = 0;
    textRuns.forEach((run) => {
      const bin = run.fontSize < 14 ? 0 : run.fontSize < 18 ? 1 : run.fontSize < 24 ? 2 : run.fontSize < 32 ? 3 : run.fontSize < 44 ? 4 : 5;
      const runWeight = clamp(run.fontSize / 16, 1, 4);
      fonts[bin] += runWeight;
      typographyWeight += runWeight;
      if (run.bold) boldWeight += runWeight;
    });
    const denominator = Math.max(1, boxes.length);
    layoutVectors.push(grid.map((value) => value / denominator));
    const meanFontSize = textRuns.reduce((sum, run) => sum + run.fontSize, 0) / Math.max(1, textRuns.length);
    typographyVectors.push([...fonts.map((value) => value / Math.max(1, typographyWeight)), boldWeight / Math.max(1, typographyWeight), meanFontSize / 72]);
    chartVectors.push([chartCount / denominator, chartCount > 0 ? 1 : 0]);
    rhythm.push(boxes.length / 40);
  }
  const rhythmMean = rhythm.reduce((sum, value) => sum + value, 0) / Math.max(1, rhythm.length);
  const rhythmVariance = rhythm.reduce((sum, value) => sum + (value - rhythmMean) ** 2, 0) / Math.max(1, rhythm.length);
  return {
    slideCount: images.length,
    color: average(imageVectors.map((item) => item.color), 24),
    composition: average(imageVectors.map((item) => item.composition), 12),
    density: average(imageVectors.map((item) => item.density), 2),
    visualTone: average(imageVectors.map((item) => item.visualTone), 4),
    layout: average(layoutVectors, 12),
    typography: average(typographyVectors, 8),
    chart: average(chartVectors, 2),
    storytelling: [clamp(images.length / 20), rhythmMean, Math.sqrt(rhythmVariance)]
  };
}

function targetForStrength(referenceStrength: number) {
  if (referenceStrength <= 30) return 0;
  if (referenceStrength <= 60) return 70;
  if (referenceStrength <= 80) return 82;
  return 90;
}

export async function measureReferenceFidelity(referenceDir: string, outputDir: string, referenceStrength: number, locks: LockState): Promise<FidelityReport> {
  const [reference, output] = await Promise.all([deckFeatures(referenceDir), deckFeatures(outputDir)]);
  const baseTarget = targetForStrength(referenceStrength);
  const definitions = [
    ["typography", reference.typography, output.typography, locks.typography, "font-size hierarchy and emphasis distribution"],
    ["color", reference.color, output.color, locks.colors, "rendered RGB distribution"],
    ["layout", reference.layout, output.layout, locks.layout, "object-center grid distribution"],
    ["chartStyle", reference.chart, output.chart, false, "native chart frequency and emphasis"],
    ["density", reference.density, output.density, false, "foreground coverage and edge density"],
    ["composition", reference.composition, output.composition, false, "page visual-weight distribution"],
    ["storytelling", reference.storytelling, output.storytelling, false, "slide-count and page-rhythm profile"],
    ["visualTone", reference.visualTone, output.visualTone, false, "brightness, contrast, saturation and edge tone"]
  ] as const;
  const dimensions = Object.fromEntries(definitions.map(([name, a, b, locked, evidence]) => {
    const score = semanticScore([...a], [...b]);
    const target = locked ? Math.max(97, baseTarget) : baseTarget;
    const referenceMean = name === "typography" ? a.at(-1) ?? 0 : 0;
    const outputMean = name === "typography" ? b.at(-1) ?? 0 : 0;
    const meanRatio = outputMean > 0 ? referenceMean / outputMean : 1;
    const effectiveScale = meanRatio < 1 ? 1 - (1 - meanRatio) * 4 : 1 + (meanRatio - 1) * 4;
    const repairHint = name === "typography" && outputMean > 0 ? { fontScale: Number(clamp(effectiveScale, 0.9, 1.15).toFixed(2)) } : undefined;
    return [name, { score, target, weight: DIMENSION_WEIGHTS[name], passed: target === 0 || score >= target, locked, evidence, repairHint } satisfies FidelityDimension];
  })) as FidelityReport["dimensions"];
  const overall = Math.round(Object.values(dimensions).reduce((sum, item) => sum + item.score * item.weight, 0) / 100);
  return {
    mode: "measured",
    overall,
    target: baseTarget,
    passed: baseTarget === 0 || overall >= baseTarget,
    referenceSlides: reference.slideCount,
    outputSlides: output.slideCount,
    dimensions
  };
}
