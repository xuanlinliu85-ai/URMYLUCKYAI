import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const baseUrl = (process.argv[2] ?? "http://127.0.0.1:3020").replace(/\/$/, "");

async function post(endpoint, body) {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const value = await response.json();
  if (!response.ok) throw new Error(`${endpoint}: ${value.error ?? JSON.stringify(value)}`);
  return value;
}

const fixture = JSON.parse(await fs.readFile("tasks/active/chart-label-collision-repair/chart-request.json", "utf8"));
const project = await post("/api/projects", { name: "Chart label collision acceptance" });
const projectId = project.id;
const projectDir = path.resolve("generated/projects", projectId);
await post("/api/deck/generate", {
  projectId,
  direction: fixture.direction,
  storyline: fixture.storyline,
  slidePlans: fixture.slidePlans,
  finalStyle: fixture.style,
  controls: fixture.controls,
  qaFixture: fixture.qaFixture
});
const before = await post("/api/qa/run", { projectId, referenceStrength: 0, repairPass: 0 });
let after = await post("/api/qa/fix", { projectId });
if (after.technical.chartLabelCollision.score <= before.technical.chartLabelCollision.score) {
  after = await post("/api/qa/fix", { projectId });
}
const chartRepairPass = after.repairPass;
const repairPlan = JSON.parse(await fs.readFile(path.join(projectDir, "qa", "repair-plan.json"), "utf8"));
const repairEvent = JSON.parse(await fs.readFile(path.join(projectDir, "qa", `repair-event-${chartRepairPass}.json`), "utf8"));
const beforeLayout = JSON.parse(await fs.readFile(path.join(projectDir, "render", `repair-backup-${chartRepairPass}`, "slide-001.layout.json"), "utf8"));
const afterLayout = JSON.parse(await fs.readFile(path.join(projectDir, "render", "final", "slide-001.layout.json"), "utf8"));
const beforeChart = beforeLayout.chartMetadata.charts[0];
const afterChart = afterLayout.chartMetadata.charts[0];
const dataPreserved = JSON.stringify({ categories: beforeChart.categories, series: beforeChart.series }) === JSON.stringify({ categories: afterChart.categories, series: afterChart.series });
const geometryPreserved = JSON.stringify(beforeChart.bbox) === JSON.stringify(afterChart.bbox);
const beforeChartType = beforeLayout.elements.find((element) => element.kind === "chart")?.chartType;
const afterChartType = afterLayout.elements.find((element) => element.kind === "chart")?.chartType;
const chartTypePreserved = beforeChartType === afterChartType;
const onlyLabelPolicyChanged = dataPreserved && geometryPreserved && chartTypePreserved &&
  beforeChart.dataLabels.fontSize !== afterChart.dataLabels.fontSize;
const finalPptx = path.join(projectDir, "output", "final.pptx");
const reopenedDir = path.join(projectDir, "render", "reopened-final");
const reopen = await execFileAsync(process.execPath, [path.resolve("adapters/native-pptx/render-reference.mjs"), finalPptx, reopenedDir], {
  env: process.env,
  maxBuffer: 10 * 1024 * 1024
});
const reopenReport = JSON.parse(reopen.stdout.trim().split(/\r?\n/).at(-1));
const inspect = await fs.readFile(path.join(reopenedDir, "inspect.ndjson"), "utf8");
const beforeTechnical = before.technical.chartLabelCollision;
const afterTechnical = after.technical.chartLabelCollision;
const passed = beforeTechnical.checkedCharts === 1 && beforeTechnical.failingLabels > 0 &&
  afterTechnical.score > beforeTechnical.score && afterTechnical.failingLabels === 0 && afterTechnical.passed &&
  repairPlan.status === "applied" && repairPlan.targets.length === 1 &&
  repairPlan.targets[0].dimension === "chartLabelCollision" && repairPlan.targets[0].objectNames.includes("metric-rate-chart") &&
  repairEvent.rolledBack === false && onlyLabelPolicyChanged && reopenReport.slides === 1 &&
  /"kind":"chart"/.test(inspect) && /[\u3400-\u9fff]/.test(inspect) && !/[\ufffd]/.test(inspect);
const manifest = {
  projectId,
  status: passed ? "PASS" : "FAIL",
  checks: {
    chartScoreBefore: beforeTechnical.score,
    chartScoreAfter: afterTechnical.score,
    failingLabelsBefore: beforeTechnical.failingLabels,
    failingLabelsAfter: afterTechnical.failingLabels,
    targetObject: repairPlan.targets[0]?.objectNames,
    targetDimension: repairPlan.targets[0]?.dimension,
    rolledBack: repairEvent.rolledBack,
    dataPreserved,
    geometryPreserved,
    chartTypePreserved,
    labelFontSizeBefore: beforeChart.dataLabels.fontSize,
    labelFontSizeAfter: afterChart.dataLabels.fontSize,
    reopenedSlides: reopenReport.slides,
    nativeChartPresent: /"kind":"chart"/.test(inspect),
    cjkIntact: /[\u3400-\u9fff]/.test(inspect) && !/[\ufffd]/.test(inspect)
  },
  artifacts: {
    finalPptx,
    beforeContactSheet: path.join(projectDir, "render", `repair-backup-${chartRepairPass}`, "contact-sheet.webp"),
    afterContactSheet: path.join(projectDir, "render", "final", "contact-sheet.webp"),
    qaBefore: path.join(projectDir, "qa", "qa-report-pass-0.json"),
    qaAfter: path.join(projectDir, "qa", `qa-report-pass-${chartRepairPass}.json`),
    repairPlan: path.join(projectDir, "qa", "repair-plan.json"),
    repairEvent: path.join(projectDir, "qa", `repair-event-${chartRepairPass}.json`),
    reopenedContactSheet: path.join(reopenedDir, "contact-sheet.webp")
  },
  generatedAt: new Date().toISOString()
};
await fs.writeFile(path.join(projectDir, "output", "chart-label-acceptance-manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
console.log(JSON.stringify(manifest, null, 2));
if (!passed) process.exitCode = 1;
