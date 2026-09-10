import { readFile } from "node:fs/promises";
import path from "node:path";
import type { FontFallbackFinding, FontFallbackReport } from "@/lib/types";

type FontEvidence = {
  slide: number;
  objectName: string;
  text: string;
  requestedTypeface: string;
  appliedTypeface: string;
};

type LayoutElement = {
  name?: string;
  text?: string;
  resolvedTextStyle?: { typeface?: string };
  paragraphs?: Array<{ runs?: Array<{ typeface?: string }> }>;
};

const safeCjkTypefaces = new Set([
  "microsoftyahei", "微软雅黑", "microsoftjhenghei", "微软正黑体",
  "simhei", "黑体", "simsun", "宋体", "dengxian", "等线",
  "notosanscjksc", "notoserifcjksc", "sourcehansanssc", "sourcehanserifsc",
  "思源黑体", "思源宋体", "pingfangsc", "苹方", "kaiti", "楷体", "fangsong", "仿宋"
]);

function normalizeTypeface(value: string) {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

export function hasCjk(value: string) {
  return /[\u3400-\u9fff\uf900-\ufaff]/u.test(value);
}

export function isSafeCjkTypeface(value: string) {
  return safeCjkTypefaces.has(normalizeTypeface(value));
}

function resolvedTypefaces(element: LayoutElement) {
  const runs = (element.paragraphs ?? []).flatMap((paragraph) => paragraph.runs ?? []);
  return [...new Set(runs.map((run) => run.typeface).filter((value): value is string => Boolean(value)))]
    .concat(element.resolvedTextStyle?.typeface ? [element.resolvedTextStyle.typeface] : []);
}

function inspectObjects(raw: string) {
  const objects = new Set<string>();
  for (const line of raw.split(/\r?\n/).filter(Boolean)) {
    try {
      const record = JSON.parse(line) as { slide?: number; name?: string };
      if (record.slide && record.name) objects.add(`${record.slide}|${record.name}`);
    } catch {}
  }
  return objects;
}

export async function measureFontFallback(renderDir: string, layoutFiles: string[]): Promise<FontFallbackReport> {
  const evidence = JSON.parse(await readFile(path.join(renderDir, "font-evidence.json"), "utf8")) as { objects: FontEvidence[] };
  const inspect = inspectObjects(await readFile(path.join(renderDir, "inspect.ndjson"), "utf8"));
  const requested = new Map(evidence.objects.map((item) => [`${item.slide}|${item.objectName}`, item]));
  const findings: FontFallbackFinding[] = [];

  for (let slideIndex = 0; slideIndex < layoutFiles.length; slideIndex += 1) {
    const layout = JSON.parse(await readFile(path.join(renderDir, layoutFiles[slideIndex]), "utf8")) as { elements?: LayoutElement[] };
    for (const element of layout.elements ?? []) {
      if (!element.name || !element.text || !hasCjk(element.text)) continue;
      const key = `${slideIndex + 1}|${element.name}`;
      const source = requested.get(key);
      if (!source) continue;
      const typefaces = resolvedTypefaces(element);
      const resolvedTypeface = typefaces[0] ?? source.appliedTypeface;
      const plannedReplacement = normalizeTypeface(source.appliedTypeface) !== normalizeTypeface(source.requestedTypeface);
      const mismatch = !plannedReplacement && normalizeTypeface(source.requestedTypeface) !== normalizeTypeface(resolvedTypeface);
      const replacementGlyph = /\ufffd/u.test(element.text);
      const unsafe = !isSafeCjkTypeface(resolvedTypeface);
      const risk: FontFallbackFinding["risk"] = replacementGlyph
        ? "replacement-glyph"
        : mismatch
          ? "requested-resolved-mismatch"
          : unsafe
            ? "unsafe-cjk-typeface"
            : "none";
      const passed = risk === "none";
      findings.push({
        slide: slideIndex + 1,
        objectName: element.name,
        textPreview: element.text.slice(0, 80),
        requestedTypeface: source.requestedTypeface,
        appliedTypeface: source.appliedTypeface,
        resolvedTypeface,
        risk,
        passed,
        recommendedTypeface: passed ? undefined : mismatch && isSafeCjkTypeface(resolvedTypeface) ? resolvedTypeface : "Microsoft YaHei",
        evidence: inspect.has(key)
          ? ["renderer-request", "layout-resolved", "inspect-object"]
          : ["renderer-request", "layout-resolved"]
      });
    }
  }

  const failingObjects = findings.filter((finding) => !finding.passed).length;
  const score = findings.length ? Number(((findings.length - failingObjects) / findings.length * 100).toFixed(1)) : 100;
  return { score, target: 100, passed: failingObjects === 0, checkedObjects: findings.length, failingObjects, findings };
}

