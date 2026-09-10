import { readFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import type { ReferenceStyleMeasurements } from "@/lib/types";
import { inferReferenceSlideRole, type ReferenceSlideRoleInference, type RenderedPageEvidence } from "./role-inference";
import {
  inferReferenceLayoutFamily,
  summarizeReferenceLayoutFamilies,
  type NormalizedLayoutObject,
  type ReferenceLayoutFamilyInference,
  type ReferenceLayoutFamilySummary
} from "./layout-family";
import { measureReferenceStyle } from "./style-measurements.mjs";

export type ReferenceAnalysis = {
  filename: string;
  slideCount: number;
  slideSize: { widthEmu: number; heightEmu: number; aspectRatio: number };
  fonts: Array<{ family: string; count: number }>;
  colors: Array<{ value: string; count: number; kind: "rgb" | "scheme" }>;
  positions: Array<{ slide: number; x: number; y: number; width: number; height: number }>;
  layouts: Array<{ slide: number; target: string | null }>;
  masters: string[];
  charts: number;
  images: number;
  textCharacters: number;
  slideRoles: ReferenceSlideRoleInference[];
  layoutFamilies?: ReferenceLayoutFamilyInference[];
  layoutFamilySummaries?: ReferenceLayoutFamilySummary[];
  styleMeasurements?: ReferenceStyleMeasurements;
};

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

function countValues(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values.filter(Boolean)) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

async function xml(zip: JSZip, name: string) {
  const file = zip.file(name);
  return file ? file.async("string") : "";
}

function relationshipTarget(relXml: string, relationshipType: string) {
  const pattern = new RegExp(`<Relationship[^>]+Type="[^"]*${relationshipType}"[^>]+Target="([^"]+)"`, "i");
  return relXml.match(pattern)?.[1] ?? null;
}

function normalizedObject(block: string, type: NormalizedLayoutObject["type"], widthEmu: number, heightEmu: number): NormalizedLayoutObject | null {
  const match = block.match(/<[ap]:xfrm[^>]*>[\s\S]*?<a:off[^>]+x="(-?\d+)"[^>]+y="(-?\d+)"[^>]*\/>[\s\S]*?<a:ext[^>]+cx="(\d+)"[^>]+cy="(\d+)"[^>]*\/>[\s\S]*?<\/[ap]:xfrm>/);
  if (!match || widthEmu <= 0 || heightEmu <= 0) return null;
  return {
    type,
    x: Number(match[1]) / widthEmu,
    y: Number(match[2]) / heightEmu,
    width: Number(match[3]) / widthEmu,
    height: Number(match[4]) / heightEmu
  };
}

function extractLayoutObjects(raw: string, widthEmu: number, heightEmu: number) {
  const objects: NormalizedLayoutObject[] = [];
  const addBlocks = (pattern: RegExp, type: NormalizedLayoutObject["type"]) => {
    for (const match of raw.matchAll(pattern)) {
      const object = normalizedObject(match[0], type, widthEmu, heightEmu);
      if (object) objects.push(object);
    }
  };
  for (const match of raw.matchAll(/<p:graphicFrame\b[\s\S]*?<\/p:graphicFrame>/g)) {
    const type = /<c:chart\b/.test(match[0]) ? "chart" : /<a:tbl\b/.test(match[0]) ? "table" : "shape";
    const object = normalizedObject(match[0], type, widthEmu, heightEmu);
    if (object) objects.push(object);
  }
  addBlocks(/<p:pic\b[\s\S]*?<\/p:pic>/g, "image");
  for (const match of raw.matchAll(/<p:sp\b[\s\S]*?<\/p:sp>/g)) {
    const type = /<a:t>/.test(match[0]) ? "text" : "shape";
    const object = normalizedObject(match[0], type, widthEmu, heightEmu);
    if (object) objects.push(object);
  }
  return objects;
}

async function measureRenderedPage(renderDir: string | undefined, slide: number): Promise<RenderedPageEvidence | undefined> {
  if (!renderDir) return undefined;
  const slidePath = path.join(renderDir, `slide-${String(slide).padStart(3, "0")}.png`);
  try {
    const { default: sharp } = await import("sharp");
    const image = sharp(slidePath).resize({ width: 160, height: 90, fit: "fill" }).greyscale();
    const [{ data, info }, stats] = await Promise.all([
      image.clone().raw().toBuffer({ resolveWithObject: true }),
      image.clone().stats()
    ]);
    let luminance = 0;
    let lightPixels = 0;
    for (const value of data) {
      luminance += value;
      if (value >= 242) lightPixels += 1;
    }
    const pixels = Math.max(1, info.width * info.height);
    return {
      width: info.width,
      height: info.height,
      meanLuminance: Number((luminance / pixels).toFixed(2)),
      lightPixelRatio: Number((lightPixels / pixels).toFixed(4)),
      entropy: Number(stats.entropy.toFixed(4))
    };
  } catch {
    return undefined;
  }
}

function relationshipTargets(relXml: string) {
  const targets = new Map<string, string>();
  for (const match of relXml.matchAll(/<Relationship\b([^>]*)\/?\s*>/gi)) {
    const attributes = match[1];
    const id = attributes.match(/\bId="([^"]+)"/i)?.[1];
    const target = attributes.match(/\bTarget="([^"]+)"/i)?.[1];
    if (id && target) targets.set(id, target);
  }
  return targets;
}

function resolvePart(sourcePart: string, target: string) {
  if (target.startsWith("/")) return path.posix.normalize(target.slice(1));
  return path.posix.normalize(path.posix.join(path.posix.dirname(sourcePart), target.replace(/\\/g, "/")));
}

export async function analyzePptx(filePath: string, options: { renderDir?: string } = {}): Promise<ReferenceAnalysis> {
  const bytes = await readFile(filePath);
  const zip = await JSZip.loadAsync(bytes);
  const presentationXml = await xml(zip, "ppt/presentation.xml");
  const presentation = parser.parse(presentationXml);
  const size = presentation?.["p:presentation"]?.["p:sldSz"] ?? {};
  const widthEmu = Number(size["@_cx"] ?? 12192000);
  const heightEmu = Number(size["@_cy"] ?? 6858000);

  const slideNames = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]));

  const fonts: string[] = [];
  const rgbColors: string[] = [];
  const schemeColors: string[] = [];
  const positions: ReferenceAnalysis["positions"] = [];
  const layouts: ReferenceAnalysis["layouts"] = [];
  let charts = 0;
  let images = 0;
  let textCharacters = 0;
  const slideRoles: ReferenceSlideRoleInference[] = [];
  const layoutFamilies: ReferenceLayoutFamilyInference[] = [];
  const measurementSlides: Array<{ slide: number; xml: string; charts: Array<{ name: string; xml: string }> }> = [];

  const themeNames = Object.keys(zip.files).filter((name) => /^ppt\/theme\/theme\d+\.xml$/.test(name));
  for (const themeName of themeNames) {
    const raw = await xml(zip, themeName);
    for (const match of raw.matchAll(/<(?:a:latin|a:ea|a:cs)[^>]+typeface="([^"]*)"/g)) {
      if (match[1] && !match[1].startsWith("+")) fonts.push(match[1]);
    }
  }

  for (let index = 0; index < slideNames.length; index += 1) {
    const name = slideNames[index];
    const raw = await xml(zip, name);
    const texts = [...raw.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((match) => decodeXml(match[1]));
    const slideChartCount = (raw.match(/<c:chart\b/g) ?? []).length;
    const slideImageCount = (raw.match(/<p:pic\b/g) ?? []).length;
    const slideTableCount = (raw.match(/<a:tbl\b/g) ?? []).length;
    const slideConnectorCount = (raw.match(/<p:cxnSp\b/g) ?? []).length;
    const slideShapeCount = (raw.match(/<p:sp\b/g) ?? []).length;
    for (const match of raw.matchAll(/<(?:a:latin|a:ea|a:cs)[^>]+typeface="([^"]+)"/g)) fonts.push(match[1]);
    for (const match of raw.matchAll(/<a:srgbClr[^>]+val="([0-9A-Fa-f]{6})"/g)) rgbColors.push(match[1].toUpperCase());
    for (const match of raw.matchAll(/<a:schemeClr[^>]+val="([^"]+)"/g)) schemeColors.push(match[1]);
    textCharacters += texts.reduce((total, text) => total + text.length, 0);
    charts += slideChartCount;
    images += slideImageCount;

    const xfrmPattern = /<a:xfrm[^>]*>[\s\S]*?<a:off[^>]+x="(\d+)"[^>]+y="(\d+)"[^>]*\/>[\s\S]*?<a:ext[^>]+cx="(\d+)"[^>]+cy="(\d+)"[^>]*\/>[\s\S]*?<\/a:xfrm>/g;
    for (const match of raw.matchAll(xfrmPattern)) {
      positions.push({ slide: index + 1, x: Number(match[1]), y: Number(match[2]), width: Number(match[3]), height: Number(match[4]) });
    }

    const relName = `ppt/slides/_rels/${path.basename(name)}.rels`;
    const relRaw = await xml(zip, relName);
    layouts.push({ slide: index + 1, target: relationshipTarget(relRaw, "slideLayout") });
    const renderedPage = await measureRenderedPage(options.renderDir, index + 1);
    const roleInference = inferReferenceSlideRole({
      slide: index + 1,
      slideCount: slideNames.length,
      texts,
      shapeCount: slideShapeCount,
      chartCount: slideChartCount,
      imageCount: slideImageCount,
      tableCount: slideTableCount,
      connectorCount: slideConnectorCount,
      renderedPage
    });
    slideRoles.push(roleInference);
    layoutFamilies.push(inferReferenceLayoutFamily({
      slide: index + 1,
      roleInference,
      objects: extractLayoutObjects(raw, widthEmu, heightEmu),
      renderedPage
    }));
    const relTargets = relationshipTargets(relRaw);
    const chartIds = [...raw.matchAll(/<c:chart\b[^>]*\br:id="([^"]+)"/g)].map((match) => match[1]);
    const chartParts = await Promise.all(chartIds.map(async (id) => {
      const target = relTargets.get(id);
      if (!target) return null;
      const chartName = resolvePart(name, target);
      return { name: chartName, xml: await xml(zip, chartName) };
    }));
    measurementSlides.push({ slide: index + 1, xml: raw, charts: chartParts.filter((item): item is { name: string; xml: string } => Boolean(item?.xml)) });
  }

  const masterNames = Object.keys(zip.files).filter((name) => /^ppt\/slideMasters\/slideMaster\d+\.xml$/.test(name));
  const styleMeasurements = measureReferenceStyle({ slides: measurementSlides, slideSize: { widthEmu, heightEmu } });
  return {
    filename: path.basename(filePath),
    slideCount: slideNames.length,
    slideSize: { widthEmu, heightEmu, aspectRatio: widthEmu / heightEmu },
    fonts: countValues(fonts).map(([family, count]) => ({ family, count })),
    colors: [
      ...countValues(rgbColors).map(([value, count]) => ({ value, count, kind: "rgb" as const })),
      ...countValues(schemeColors).map(([value, count]) => ({ value, count, kind: "scheme" as const }))
    ],
    positions,
    layouts,
    masters: masterNames,
    charts,
    images,
    textCharacters,
    slideRoles,
    layoutFamilies,
    layoutFamilySummaries: summarizeReferenceLayoutFamilies(layoutFamilies),
    styleMeasurements
  };
}

export type { ReferenceSlideRole, ReferenceSlideRoleInference, RenderedPageEvidence } from "./role-inference";
export type { ReferenceLayoutFamily, ReferenceLayoutFamilyInference, ReferenceLayoutFamilySummary } from "./layout-family";
