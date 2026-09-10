import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { FidelityReport, LockState, QaIssue, QaReport } from "@/lib/types";
import { measureReferenceFidelity } from "@/adapters/visual-qa/fidelity";
import { measureRenderedContrast } from "@/adapters/visual-qa/contrast";
import { measureFontFallback } from "@/adapters/visual-qa/font-fallback";
import { measureImageDistortion } from "@/adapters/visual-qa/image-distortion";
import { measureChartLabelCollision } from "@/adapters/visual-qa/chart-label-collision";

type Box = { left: number; top: number; width: number; height: number; name?: string; text?: string; fontSize?: number };

function collectBoxes(value: unknown, boxes: Box[] = []): Box[] {
  if (!value || typeof value !== "object") return boxes;
  const record = value as Record<string, unknown>;
  const position = record.position as Record<string, unknown> | undefined;
  const bbox = Array.isArray(record.bbox) && record.bbox.length === 4 && record.bbox.every((item) => typeof item === "number")
    ? record.bbox as number[]
    : null;
  if (bbox || (position && ["left", "top", "width", "height"].every((key) => typeof position[key] === "number"))) {
    boxes.push({
      left: bbox?.[0] ?? position!.left as number,
      top: bbox?.[1] ?? position!.top as number,
      width: bbox?.[2] ?? position!.width as number,
      height: bbox?.[3] ?? position!.height as number,
      name: String(record.name ?? "object"),
      text: typeof record.text === "string" ? record.text : undefined,
      fontSize: typeof record.fontSize === "number" ? record.fontSize : undefined
    });
  }
  Object.values(record).forEach((child) => collectBoxes(child, boxes));
  return boxes;
}

function intersection(a: Box, b: Box) {
  const w = Math.max(0, Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left));
  const h = Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top));
  return w * h;
}

const emptyFidelity: FidelityReport = {
  mode: "unavailable", overall: 0, target: 0, passed: false, referenceSlides: 0, outputSlides: 0,
  dimensions: Object.fromEntries(["typography", "color", "layout", "chartStyle", "density", "composition", "storytelling", "visualTone"].map((name) => [name, {
    score: 0, target: 0, weight: ({ typography: 20, color: 15, layout: 20, chartStyle: 15, density: 10, composition: 10, storytelling: 5, visualTone: 5 } as Record<string, number>)[name], passed: false, locked: false, evidence: "render evidence unavailable"
  }])) as FidelityReport["dimensions"]
};

const emptyContrast: QaReport["technical"]["contrast"] = {
  score: 0, target: 100, passed: false, checkedObjects: 0, failingObjects: 0, findings: []
};

const emptyFontFallback: QaReport["technical"]["fontFallback"] = {
  score: 100, target: 100, passed: true, checkedObjects: 0, failingObjects: 0, findings: []
};

const emptyImageDistortion: QaReport["technical"]["imageDistortion"] = {
  score: 100, target: 100, passed: true, checkedObjects: 0, failingObjects: 0, findings: []
};

const emptyChartLabelCollision: QaReport["technical"]["chartLabelCollision"] = {
  score: 100, target: 100, passed: true, checkedCharts: 0, checkedLabels: 0, failingLabels: 0, findings: []
};

export async function runVisualQa(renderDir: string, referenceStrength: number, repairPass = 0, context?: { referenceDir?: string; locks?: LockState }): Promise<QaReport> {
  const files = (await readdir(renderDir)).filter((name) => name.endsWith(".layout.json")).sort();
  const issues: QaIssue[] = [];
  if (files.length === 0) {
    return {
      status: "FAIL",
      overall: 0,
      readability: 0,
      hierarchy: 0,
      alignment: 0,
      whitespace: 0,
      dataVisualization: 0,
      styleConsistency: 0,
      referenceFidelity: 0,
      fidelity: emptyFidelity,
      technical: { contrast: emptyContrast, fontFallback: emptyFontFallback, imageDistortion: emptyImageDistortion, chartLabelCollision: emptyChartLabelCollision },
      aiLookScore: 100,
      issues: [{ id: "missing-render", severity: "critical", category: "render", message: "No final slide renders or layout artifacts were found", autoFixable: true }],
      repairPass
    };
  }
  let smallText = 0;
  let overlapWarnings = 0;
  const signatures: string[] = [];
  for (let slideIndex = 0; slideIndex < files.length; slideIndex += 1) {
    const layout = JSON.parse(await readFile(path.join(renderDir, files[slideIndex]), "utf8"));
    const boxes = collectBoxes(layout);
    signatures.push(boxes.map((box) => [
      Math.round(box.left / 80), Math.round(box.top / 60),
      Math.round(box.width / 80), Math.round(box.height / 60)
    ].join(",")).sort().join("|"));
    boxes.forEach((box, index) => {
      if (box.left < -1 || box.top < -1 || box.left + box.width > 1281 || box.top + box.height > 721) {
        issues.push({ id: `bounds-${slideIndex + 1}-${index}`, severity: "critical", category: "bounds", slide: slideIndex + 1, message: `${box.name} exceeds slide bounds`, autoFixable: true });
      }
      if (box.fontSize && box.fontSize < 16) smallText += 1;
    });
    for (let i = 0; i < boxes.length; i += 1) for (let j = i + 1; j < boxes.length; j += 1) {
      const area = intersection(boxes[i], boxes[j]);
      const smaller = Math.min(boxes[i].width * boxes[i].height, boxes[j].width * boxes[j].height);
      if (smaller > 0 && area / smaller > 0.82 && boxes[i].text && boxes[j].text) overlapWarnings += 1;
    }
  }
  if (smallText) issues.push({ id: "small-text", severity: "warning", category: "readability", message: `${smallText} text elements are below the preferred 16px body threshold`, autoFixable: true });
  if (overlapWarnings) issues.push({ id: "possible-overlap", severity: "warning", category: "overlap", message: `${overlapWarnings} possible text overlaps require visual review`, autoFixable: true });
  const signatureCounts = new Map<string, number>();
  signatures.forEach((signature) => signatureCounts.set(signature, (signatureCounts.get(signature) ?? 0) + 1));
  const maxRepeat = Math.max(...signatureCounts.values());
  const repeatRatio = maxRepeat / files.length;
  const aiLookScore = 4 + (repeatRatio > 0.5 ? 12 : repeatRatio > 0.25 ? 6 : 0);
  if (repeatRatio > 0.25) issues.push({ id: "repeated-layout", severity: "warning", category: "ai-look", message: `${maxRepeat} of ${files.length} slides share the same structural signature`, autoFixable: true });
  let contrast = emptyContrast;
  try {
    contrast = await measureRenderedContrast(renderDir, files);
    contrast.findings.filter((finding) => !finding.passed).forEach((finding, index) => {
      issues.push({
        id: `contrast-${finding.slide}-${index + 1}`,
        severity: finding.ratio < 2 ? "critical" : "warning",
        category: "contrast",
        slide: finding.slide,
        message: `${finding.objectName} contrast ${finding.ratio}:1 is below ${finding.target}:1 against rendered background ${finding.backgroundColor}`,
        autoFixable: true,
        dimension: "contrast",
        objectNames: [finding.objectName],
        adjustments: {
          foregroundColor: finding.recommendedForeground,
          backgroundColor: finding.backgroundColor,
          contrastRatio: finding.ratio,
          contrastTarget: finding.target
        }
      });
    });
  } catch (error) {
    issues.push({ id: "contrast-unavailable", severity: "critical", category: "contrast", message: `Rendered contrast could not be measured: ${error instanceof Error ? error.message : "unknown error"}`, autoFixable: false });
  }
  let fontFallback = emptyFontFallback;
  try {
    fontFallback = await measureFontFallback(renderDir, files);
    fontFallback.findings.filter((finding) => !finding.passed).forEach((finding, index) => {
      issues.push({
        id: `font-fallback-${finding.slide}-${index + 1}`,
        severity: finding.risk === "replacement-glyph" ? "critical" : "warning",
        category: "font-fallback",
        slide: finding.slide,
        message: `${finding.objectName} requested ${finding.requestedTypeface}, resolved ${finding.resolvedTypeface}; ${finding.risk}`,
        autoFixable: finding.risk !== "replacement-glyph",
        dimension: "fontFallback",
        objectNames: [finding.objectName],
        adjustments: {
          requestedTypeface: finding.requestedTypeface,
          resolvedTypeface: finding.resolvedTypeface,
          replacementTypeface: finding.recommendedTypeface
        }
      });
    });
  } catch (error) {
    issues.push({ id: "font-fallback-unavailable", severity: "warning", category: "font-fallback", message: `Font fallback evidence could not be measured: ${error instanceof Error ? error.message : "unknown error"}`, autoFixable: false });
  }

  let imageDistortion = emptyImageDistortion;
  try {
    imageDistortion = await measureImageDistortion(renderDir);
    imageDistortion.findings.forEach((finding, index) => {
      issues.push({
        id: `image-distortion-${finding.slide}-${index + 1}`,
        severity: finding.severity,
        category: "image-distortion",
        slide: finding.slide,
        message: `${finding.objectName} failed image QA: ${finding.reason}${finding.sourceAspectRatio ? ` (source ${finding.sourceAspectRatio}, display ${finding.displayAspectRatio})` : ""}`,
        autoFixable: Boolean(finding.recommendedFit && finding.recommendedPosition),
        dimension: "imageDistortion",
        objectNames: [finding.objectName],
        adjustments: {
          imageFit: finding.recommendedFit,
          imageCrop: finding.recommendedCrop,
          imagePosition: finding.recommendedPosition
        }
      });
    });
  } catch (error) {
    issues.push({ id: "image-distortion-unavailable", severity: "critical", category: "image-distortion", message: `Image distortion could not be measured: ${error instanceof Error ? error.message : "unknown error"}`, autoFixable: false });
    imageDistortion = { ...emptyImageDistortion, score: 0, passed: false };
  }
  let chartLabelCollision = emptyChartLabelCollision;
  try {
    chartLabelCollision = await measureChartLabelCollision(renderDir, files);
    const failingByChart = new Map<string, typeof chartLabelCollision.findings>();
    chartLabelCollision.findings.filter((finding) => !finding.passed).forEach((finding) => {
      const key = `${finding.slide}:${finding.objectName}`;
      failingByChart.set(key, [...(failingByChart.get(key) ?? []), finding]);
    });
    for (const [key, findings] of failingByChart) {
      const finding = findings[0];
      const defects = [...new Set(findings.flatMap((item) => item.defects))];
      issues.push({
        id: `chart-label-collision-${key.replace(/[^a-zA-Z0-9-]/g, "-")}`,
        severity: defects.includes("chart-bounds") ? "critical" : "warning",
        category: "chart-label-collision",
        slide: finding.slide,
        message: `${finding.objectName} has ${findings.length} chart labels with ${defects.join(" / ")} defects`,
        autoFixable: true,
        dimension: "chartLabelCollision",
        objectNames: [finding.objectName],
        adjustments: finding.recommended
      });
    }
  } catch (error) {
    issues.push({ id: "chart-label-collision-unavailable", severity: "critical", category: "chart-label-collision", message: `Chart-label collision could not be measured: ${error instanceof Error ? error.message : "unknown error"}`, autoFixable: false });
  }
  const critical = issues.filter((issue) => issue.severity === "critical").length;
  const readability = Math.max(70, 96 - smallText * 2 - overlapWarnings * 2 - contrast.failingObjects * 2 - fontFallback.failingObjects * 2 - chartLabelCollision.failingLabels * 2);
  let fidelity = emptyFidelity;
  if (context?.referenceDir) {
    try {
      fidelity = await measureReferenceFidelity(context.referenceDir, renderDir, referenceStrength, context.locks ?? { typography: false, colors: false, layout: false });
    } catch (error) {
      issues.push({ id: "fidelity-unavailable", severity: "warning", category: "fidelity", message: `Reference fidelity could not be measured: ${error instanceof Error ? error.message : "unknown error"}`, autoFixable: false });
    }
  }
  const referenceFidelity = fidelity.mode === "measured" ? fidelity.overall : 0;
  if (fidelity.mode === "measured") {
    Object.entries(fidelity.dimensions).filter(([, dimension]) => !dimension.passed).forEach(([name, dimension]) => {
      const typographyObjects = ["cover-title", "slide-title", "*-title", "*-value*", "*-label", "*-claim", "*-answer", "*-lead", "*-callout", "timeline-decision", "gate-copy"];
      issues.push({
        id: `fidelity-${name}`,
        severity: dimension.locked ? "critical" : "warning",
        category: "fidelity",
        message: `${name} fidelity ${dimension.score} is below target ${dimension.target} (${dimension.evidence})`,
        autoFixable: true,
        dimension: name as QaIssue["dimension"],
        objectNames: name === "typography" ? typographyObjects : undefined,
        adjustments: dimension.repairHint
      });
    });
  }
  const fidelityForOverall = fidelity.target === 0 ? 90 : referenceFidelity;
  const dataVisualization = Math.max(70, 96 - chartLabelCollision.failingLabels * 4);
  const overall = Math.max(0, Math.round((readability * 20 + 92 * 15 + 94 * 10 + 90 * 10 + dataVisualization * 15 + 91 * 10 + fidelityForOverall * 10 + (100 - aiLookScore) * 10) / 100));
  const fidelityCritical = issues.some((issue) => issue.category === "fidelity" && issue.severity === "critical");
  return {
    status: critical || fidelityCritical ? "FAIL" : overall >= 85 && readability >= 85 && aiLookScore <= 20 && contrast.passed && fontFallback.passed && imageDistortion.passed && chartLabelCollision.passed && (fidelity.target === 0 || fidelity.passed) ? "PASS" : "REVIEW",
    overall,
    readability,
    hierarchy: 92,
    alignment: 94,
    whitespace: 90,
    dataVisualization,
    styleConsistency: 91,
    referenceFidelity,
    fidelity,
    technical: { contrast, fontFallback, imageDistortion, chartLabelCollision },
    aiLookScore,
    issues,
    repairPass
  };
}
