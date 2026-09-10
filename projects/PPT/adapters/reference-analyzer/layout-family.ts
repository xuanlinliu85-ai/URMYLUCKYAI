import type { ReferenceSlideRoleInference, RenderedPageEvidence } from "./role-inference";

export type ReferenceLayoutFamily =
  | "COVER"
  | "SECTION"
  | "EXEC_SUMMARY"
  | "DATA_LEFT_TEXT_RIGHT"
  | "TEXT_LEFT_DATA_RIGHT"
  | "FULL_CHART"
  | "FULL_TABLE"
  | "BIG_NUMBER"
  | "TWO_COLUMN"
  | "HERO_IMAGE"
  | "COMPARISON"
  | "PROCESS_TIMELINE"
  | "OTHER";

export type ReferenceLayoutObjectType = "text" | "chart" | "table" | "image" | "shape";

export type NormalizedLayoutObject = {
  type: ReferenceLayoutObjectType;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ReferenceLayoutFamilyInference = {
  slide: number;
  family: ReferenceLayoutFamily;
  confidence: number;
  evidence: string[];
  signals: {
    role: ReferenceSlideRoleInference["role"];
    objectCounts: Record<ReferenceLayoutObjectType, number>;
    leftOccupancy: number;
    rightOccupancy: number;
    largestChartArea: number;
    largestTableArea: number;
    largestImageArea: number;
    renderedPage: RenderedPageEvidence | null;
  };
};

export type ReferenceLayoutFamilySummary = {
  family: ReferenceLayoutFamily;
  count: number;
  share: number;
  averageConfidence: number;
  slides: number[];
};

export type ReferenceLayoutFamilyInput = {
  slide: number;
  roleInference: ReferenceSlideRoleInference;
  objects: NormalizedLayoutObject[];
  renderedPage?: RenderedPageEvidence;
};

const familyOrder: ReferenceLayoutFamily[] = [
  "COVER", "SECTION", "EXEC_SUMMARY", "DATA_LEFT_TEXT_RIGHT",
  "TEXT_LEFT_DATA_RIGHT", "FULL_CHART", "FULL_TABLE", "BIG_NUMBER",
  "TWO_COLUMN", "HERO_IMAGE", "COMPARISON", "PROCESS_TIMELINE", "OTHER"
];

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function area(object: NormalizedLayoutObject) {
  return Math.max(0, object.width) * Math.max(0, object.height);
}

function horizontalOccupancy(objects: NormalizedLayoutObject[], from: number, to: number) {
  return Math.min(1, objects.reduce((total, object) => {
    const overlap = Math.max(0, Math.min(to, object.x + object.width) - Math.max(from, object.x));
    return total + overlap * Math.max(0, object.height);
  }, 0) / Math.max(0.01, to - from));
}

function maxArea(objects: NormalizedLayoutObject[], type: ReferenceLayoutObjectType) {
  return Math.max(0, ...objects.filter((object) => object.type === type).map(area));
}

export function inferReferenceLayoutFamily(input: ReferenceLayoutFamilyInput): ReferenceLayoutFamilyInference {
  const objects = input.objects.filter((object) => [object.x, object.y, object.width, object.height].every(Number.isFinite));
  const objectCounts = Object.fromEntries(
    (["text", "chart", "table", "image", "shape"] as ReferenceLayoutObjectType[])
      .map((type) => [type, objects.filter((object) => object.type === type).length])
  ) as Record<ReferenceLayoutObjectType, number>;
  const leftOccupancy = horizontalOccupancy(objects, 0, 0.5);
  const rightOccupancy = horizontalOccupancy(objects, 0.5, 1);
  const largestChartArea = maxArea(objects, "chart");
  const largestTableArea = maxArea(objects, "table");
  const largestImageArea = maxArea(objects, "image");
  const role = input.roleInference.role;
  const evidence: string[] = [`role:${role}`];
  let family: ReferenceLayoutFamily = "OTHER";
  let confidence = 0.42;

  // Semantic roles are the strongest evidence for narrative-specific families.
  if (role === "cover") {
    family = "COVER";
    confidence = Math.max(0.76, input.roleInference.confidence);
  } else if (role === "agenda_section") {
    family = "SECTION";
    confidence = Math.max(0.72, input.roleInference.confidence);
  } else if (role === "summary") {
    family = "EXEC_SUMMARY";
    confidence = Math.max(0.7, input.roleInference.confidence);
  } else if (role === "comparison") {
    family = "COMPARISON";
    confidence = Math.max(0.74, input.roleInference.confidence);
  } else if (role === "process_timeline") {
    family = "PROCESS_TIMELINE";
    confidence = Math.max(0.74, input.roleInference.confidence);
  } else if (largestTableArea >= 0.42 || (objectCounts.table > 0 && objectCounts.chart === 0)) {
    family = "FULL_TABLE";
    confidence = largestTableArea >= 0.55 ? 0.91 : 0.8;
    evidence.push(`geometry:largest-table-area=${round(largestTableArea)}`);
  } else if (largestChartArea >= 0.5) {
    family = "FULL_CHART";
    confidence = 0.9;
    evidence.push(`geometry:largest-chart-area=${round(largestChartArea)}`);
  } else if (largestImageArea >= 0.38) {
    family = "HERO_IMAGE";
    confidence = largestImageArea >= 0.55 ? 0.9 : 0.78;
    evidence.push(`geometry:largest-image-area=${round(largestImageArea)}`);
  } else if (objectCounts.chart + objectCounts.table > 0) {
    const dataObjects = objects.filter((object) => object.type === "chart" || object.type === "table");
    const dataCenter = dataObjects.reduce((sum, object) => sum + object.x + object.width / 2, 0) / dataObjects.length;
    family = dataCenter < 0.5 ? "DATA_LEFT_TEXT_RIGHT" : "TEXT_LEFT_DATA_RIGHT";
    confidence = Math.abs(dataCenter - 0.5) >= 0.16 ? 0.88 : 0.72;
    evidence.push(`geometry:data-center-x=${round(dataCenter)}`, `native:data-objects=${dataObjects.length}`);
  } else if (
    input.roleInference.signals.numericTokens >= 2
    && input.roleInference.signals.textBlocks <= 5
    && input.roleInference.signals.textCharacters <= 160
  ) {
    family = "BIG_NUMBER";
    confidence = 0.75;
    evidence.push(`xml:numeric-tokens=${input.roleInference.signals.numericTokens}`, "xml:sparse-numeric-page");
  } else if (leftOccupancy >= 0.08 && rightOccupancy >= 0.08 && Math.abs(leftOccupancy - rightOccupancy) <= 0.35) {
    family = "TWO_COLUMN";
    confidence = 0.68 + Math.min(0.16, Math.min(leftOccupancy, rightOccupancy) * 0.3);
    evidence.push(`geometry:left-right-occupancy=${round(leftOccupancy)}/${round(rightOccupancy)}`);
  } else {
    evidence.push("classification:insufficient-semantic-or-geometry-evidence");
  }

  if (input.renderedPage) {
    evidence.push(`render:light=${round(input.renderedPage.lightPixelRatio)},entropy=${round(input.renderedPage.entropy)}`);
  } else {
    evidence.push("render:unavailable");
  }

  return {
    slide: input.slide,
    family,
    confidence: round(Math.min(0.98, confidence)),
    evidence: [...new Set(evidence)].sort(),
    signals: {
      role,
      objectCounts,
      leftOccupancy: round(leftOccupancy),
      rightOccupancy: round(rightOccupancy),
      largestChartArea: round(largestChartArea),
      largestTableArea: round(largestTableArea),
      largestImageArea: round(largestImageArea),
      renderedPage: input.renderedPage ?? null
    }
  };
}

export function summarizeReferenceLayoutFamilies(items: ReferenceLayoutFamilyInference[]): ReferenceLayoutFamilySummary[] {
  const total = Math.max(1, items.length);
  return familyOrder.flatMap((family) => {
    const matches = items.filter((item) => item.family === family);
    if (!matches.length) return [];
    return [{
      family,
      count: matches.length,
      share: round(matches.length / total),
      averageConfidence: round(matches.reduce((sum, item) => sum + item.confidence, 0) / matches.length),
      slides: matches.map((item) => item.slide).sort((a, b) => a - b)
    }];
  });
}
