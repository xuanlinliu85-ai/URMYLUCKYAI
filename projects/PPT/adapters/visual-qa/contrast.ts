import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { ContrastFinding, ContrastReport } from "@/lib/types";

type LayoutElement = {
  name?: string;
  text?: string;
  bbox?: number[];
  fillColor?: string;
  resolvedFontSize?: number;
  resolvedTextStyle?: { color?: string; bold?: boolean };
  paragraphs?: Array<{ runs?: Array<{ color?: string; fontSize?: number; bold?: boolean }> }>;
};

type LayoutDocument = {
  slide?: { backgroundColor?: string };
  elements?: LayoutElement[];
};

function normalizeHex(value: unknown) {
  const raw = String(value ?? "").replace("#", "");
  return /^[0-9a-f]{6}$/i.test(raw) ? `#${raw.toUpperCase()}` : null;
}

function rgb(hex: string) {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((index) => Number.parseInt(value.slice(index, index + 2), 16));
}

function hex(values: number[]) {
  return `#${values.map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

function luminance(color: string) {
  const channels = rgb(color).map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function contrastRatio(foreground: string, background: string) {
  const left = luminance(foreground);
  const right = luminance(background);
  return (Math.max(left, right) + 0.05) / (Math.min(left, right) + 0.05);
}

function mix(from: string, to: string, amount: number) {
  const a = rgb(from), b = rgb(to);
  return hex(a.map((value, index) => value * (1 - amount) + b[index] * amount));
}

export function recommendForeground(foreground: string, background: string, target: number) {
  if (contrastRatio(foreground, background) >= target) return foreground;
  const endpoint = contrastRatio("#000000", background) >= contrastRatio("#FFFFFF", background) ? "#000000" : "#FFFFFF";
  for (let step = 1; step <= 20; step += 1) {
    const candidate = mix(foreground, endpoint, step / 20);
    if (contrastRatio(candidate, background) >= target) return candidate;
  }
  return endpoint;
}

function textStyle(element: LayoutElement) {
  const runs = (element.paragraphs ?? []).flatMap((paragraph) => paragraph.runs ?? []);
  const foreground = normalizeHex(runs.find((run) => normalizeHex(run.color))?.color ?? element.resolvedTextStyle?.color);
  const sizes = runs.map((run) => run.fontSize).filter((value): value is number => typeof value === "number");
  const fontSize = sizes.length ? Math.max(...sizes) : element.resolvedFontSize ?? 16;
  const bold = runs.some((run) => run.bold) || Boolean(element.resolvedTextStyle?.bold);
  return { foreground, fontSize, bold };
}

function sampleBackground(data: Buffer, width: number, height: number, channels: number, bbox: number[], fallback: string) {
  const [left, top, boxWidth, boxHeight] = bbox;
  const points = [
    [left + boxWidth * 0.2, top + boxHeight * 0.2], [left + boxWidth * 0.8, top + boxHeight * 0.2],
    [left + boxWidth * 0.2, top + boxHeight * 0.8], [left + boxWidth * 0.8, top + boxHeight * 0.8],
    [left + boxWidth * 0.5, top + boxHeight * 0.2], [left + boxWidth * 0.2, top + boxHeight * 0.5],
    [left + boxWidth * 0.8, top + boxHeight * 0.5], [left + boxWidth * 0.5, top + boxHeight * 0.8]
  ].map(([x, y]) => [Math.max(0, Math.min(width - 1, Math.round(x))), Math.max(0, Math.min(height - 1, Math.round(y)))]);
  const samples: number[][] = [];
  for (const [x, y] of points) {
    const offset = (y * width + x) * channels;
    samples.push([data[offset], data[offset + 1], data[offset + 2]]);
  }
  if (!samples.length) return fallback;
  const fallbackRgb = rgb(fallback);
  samples.sort((a, b) => a.reduce((sum, value, index) => sum + Math.abs(value - fallbackRgb[index]), 0) - b.reduce((sum, value, index) => sum + Math.abs(value - fallbackRgb[index]), 0));
  const selected = samples.slice(0, Math.min(3, samples.length));
  return hex([0, 1, 2].map((channel) => selected.reduce((sum, sample) => sum + sample[channel], 0) / selected.length));
}

function localBackground(elements: LayoutElement[], elementIndex: number, bbox: number[], slideBackground: string) {
  const centerX = bbox[0] + bbox[2] / 2, centerY = bbox[1] + bbox[3] / 2;
  for (let index = elementIndex - 1; index >= 0; index -= 1) {
    const candidate = elements[index];
    const fill = normalizeHex(candidate.fillColor);
    if (!fill || !Array.isArray(candidate.bbox) || candidate.bbox.length !== 4) continue;
    const [left, top, width, height] = candidate.bbox;
    if (centerX >= left && centerX <= left + width && centerY >= top && centerY <= top + height) return fill;
  }
  return slideBackground;
}

export async function measureRenderedContrast(renderDir: string, layoutFiles: string[]): Promise<ContrastReport> {
  const findings: ContrastFinding[] = [];
  for (let slideIndex = 0; slideIndex < layoutFiles.length; slideIndex += 1) {
    const layoutPath = path.join(renderDir, layoutFiles[slideIndex]);
    const layout = JSON.parse(await readFile(layoutPath, "utf8")) as LayoutDocument;
    const pngPath = layoutPath.replace(/\.layout\.json$/i, ".png");
    const rendered = await sharp(pngPath).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const slideBackground = normalizeHex(layout.slide?.backgroundColor) ?? "#FFFFFF";
    const elements = layout.elements ?? [];
    for (let elementIndex = 0; elementIndex < elements.length; elementIndex += 1) {
      const element = elements[elementIndex];
      if (!element.text || !Array.isArray(element.bbox) || element.bbox.length !== 4) continue;
      const { foreground, fontSize, bold } = textStyle(element);
      if (!foreground) continue;
      const expectedBackground = localBackground(elements, elementIndex, element.bbox, slideBackground);
      const background = sampleBackground(rendered.data, rendered.info.width, rendered.info.height, rendered.info.channels, element.bbox, expectedBackground);
      const target = fontSize >= 24 || (bold && fontSize >= 18) ? 3 : 4.5;
      const ratio = Number(contrastRatio(foreground, background).toFixed(2));
      const passed = ratio >= target;
      findings.push({
        slide: slideIndex + 1,
        objectName: String(element.name ?? "text-object"),
        foregroundColor: foreground,
        backgroundColor: background,
        ratio,
        target,
        passed,
        recommendedForeground: passed ? undefined : recommendForeground(foreground, background, target),
        evidence: "rendered-pixel-sample"
      });
    }
  }
  const score = findings.length
    ? Number((findings.reduce((sum, finding) => sum + Math.min(1, finding.ratio / finding.target), 0) / findings.length * 100).toFixed(1))
    : 0;
  const failingObjects = findings.filter((finding) => !finding.passed).length;
  return { score, target: 100, passed: findings.length > 0 && failingObjects === 0, checkedObjects: findings.length, failingObjects, findings };
}
