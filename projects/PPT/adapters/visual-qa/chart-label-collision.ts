import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ChartLabelCollisionFinding, ChartLabelCollisionReport } from "@/lib/types";

type Bbox = [number, number, number, number];

type ChartMetadata = {
  objectName: string;
  bbox: Bbox;
  plotAreaBbox: Bbox;
  categories: string[];
  series: Array<{ name: string; values: number[] }>;
  minimumScale: number;
  maximumScale: number;
  barDirection: "column" | "bar";
  dataLabels: {
    showValue: boolean;
    position: "outEnd" | "inEnd" | "center";
    fontSize: number;
    displayStrategy: "all" | "none";
    suffix?: string;
  };
};

type LayoutWithChartMetadata = {
  slide?: { slide?: number };
  chartMetadata?: { schema?: string; charts?: ChartMetadata[] };
};

type EstimatedLabel = {
  key: string;
  label: string;
  bbox: Bbox;
  chart: ChartMetadata;
};

function intersectionRatio(a: Bbox, b: Bbox) {
  const width = Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]));
  const height = Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
  const smaller = Math.min(a[2] * a[3], b[2] * b[3]);
  return smaller > 0 ? width * height / smaller : 0;
}

function exceeds(inner: Bbox, outer: Bbox) {
  return inner[0] < outer[0] - 1 || inner[1] < outer[1] - 1 ||
    inner[0] + inner[2] > outer[0] + outer[2] + 1 ||
    inner[1] + inner[3] > outer[1] + outer[3] + 1;
}

function estimateColumnLabels(chart: ChartMetadata): EstimatedLabel[] {
  if (!chart.dataLabels.showValue || chart.dataLabels.displayStrategy === "none") return [];
  const [, , plotWidth, plotHeight] = chart.plotAreaBbox;
  const categoryCount = Math.max(1, chart.categories.length);
  const seriesCount = Math.max(1, chart.series.length);
  const slotWidth = plotWidth / categoryCount;
  const groupWidth = slotWidth * 0.72;
  const barWidth = groupWidth / seriesCount;
  const scale = Math.max(1, chart.maximumScale - chart.minimumScale);
  const fontSize = chart.dataLabels.fontSize;
  const lineHeight = fontSize * 1.25;
  const labels: EstimatedLabel[] = [];
  chart.series.forEach((series, seriesIndex) => series.values.forEach((value, categoryIndex) => {
    if (categoryIndex >= categoryCount) return;
    const label = `${Number(value).toLocaleString("en-US", { maximumFractionDigits: 1 })}${chart.dataLabels.suffix ?? ""}`;
    const width = Math.max(fontSize, label.length * fontSize * 0.62);
    const centerX = chart.plotAreaBbox[0] + slotWidth * (categoryIndex + 0.5) - groupWidth / 2 + barWidth * (seriesIndex + 0.5);
    const valueY = chart.plotAreaBbox[1] + plotHeight * (1 - (value - chart.minimumScale) / scale);
    const top = chart.dataLabels.position === "outEnd"
      ? valueY - lineHeight - 4
      : chart.dataLabels.position === "inEnd"
        ? valueY + 4
        : valueY - lineHeight / 2;
    labels.push({
      key: `${series.name}:${chart.categories[categoryIndex] ?? categoryIndex + 1}`,
      label,
      bbox: [centerX - width / 2, top, width, lineHeight],
      chart
    });
  }));
  return labels;
}

function estimateLabels(chart: ChartMetadata) {
  return chart.barDirection === "column" ? estimateColumnLabels(chart) : [];
}

export async function measureChartLabelCollision(renderDir: string, layoutFiles: string[]): Promise<ChartLabelCollisionReport> {
  const labelsBySlide = new Map<number, EstimatedLabel[]>();
  let checkedCharts = 0;
  for (const [index, file] of layoutFiles.entries()) {
    const layout = JSON.parse(await readFile(path.join(renderDir, file), "utf8")) as LayoutWithChartMetadata;
    const slide = layout.slide?.slide ?? index + 1;
    const charts = layout.chartMetadata?.schema === "ppt-factory/chart-labels/v1" ? layout.chartMetadata.charts ?? [] : [];
    checkedCharts += charts.length;
    labelsBySlide.set(slide, charts.flatMap(estimateLabels));
  }

  const findings: ChartLabelCollisionFinding[] = [];
  for (const [slide, labels] of labelsBySlide) {
    for (let index = 0; index < labels.length; index += 1) {
      const current = labels[index];
      const defects = new Set<ChartLabelCollisionFinding["defects"][number]>();
      const collidedWith: string[] = [];
      if (exceeds(current.bbox, current.chart.bbox)) defects.add("chart-bounds");
      for (let otherIndex = 0; otherIndex < labels.length; otherIndex += 1) {
        if (index === otherIndex || labels[otherIndex].chart.objectName !== current.chart.objectName) continue;
        if (intersectionRatio(current.bbox, labels[otherIndex].bbox) >= 0.2) {
          defects.add("label-collision");
          collidedWith.push(labels[otherIndex].key);
        }
      }
      const recommendedSize = Math.max(10, Math.min(14, Math.floor(current.chart.dataLabels.fontSize * 0.72)));
      findings.push({
        slide,
        objectName: current.chart.objectName,
        label: current.key,
        bbox: current.bbox.map((value) => Number(value.toFixed(2))) as Bbox,
        chartBbox: current.chart.bbox,
        defects: [...defects],
        collidedWith: [...new Set(collidedWith)],
        passed: defects.size === 0,
        recommended: {
          chartLabelPosition: "outEnd",
          chartLabelFontSize: recommendedSize,
          chartLabelDisplayStrategy: "all"
        },
        evidence: "layout-chart-metadata"
      });
    }
  }
  const failingLabels = findings.filter((finding) => !finding.passed).length;
  const checkedLabels = findings.length;
  const score = checkedLabels ? Number((100 * (checkedLabels - failingLabels) / checkedLabels).toFixed(1)) : 100;
  return {
    score,
    target: 100,
    passed: failingLabels === 0,
    checkedCharts,
    checkedLabels,
    failingLabels,
    findings
  };
}
