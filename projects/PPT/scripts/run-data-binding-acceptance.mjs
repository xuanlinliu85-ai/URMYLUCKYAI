import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const baseUrl = (process.argv[2] ?? "http://127.0.0.1:3042").replace(/\/$/, "");

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

const storyline = {
  thesis: "经营数据绑定必须可追溯且可重复",
  audience: "经营决策者",
  purpose: "验证本地数据驱动的可编辑汇报",
  sourceSummary: "本验收只使用 5 页合成业务内容，不读取长文档。",
  slides: [
    { slideIndex: 1, role: "cover", message: "经营数据绑定验证", supportingPoints: ["JSON → 原生 KPI 与图表"] },
    { slideIndex: 2, role: "executive_summary", message: "核心判断与关键依据", supportingPoints: ["绑定数据必须可追溯", "缺失值必须显式失败", "重复运行结果必须一致"] },
    { slideIndex: 3, role: "evidence", message: "准时交付率连续改善", supportingPoints: ["两期数据来自本地 JSON", "改善幅度用于经营复盘"] },
    { slideIndex: 4, role: "strategy", message: "先固化口径，再扩展数据源", supportingPoints: ["保持原生对象", "后续再接 Excel"] },
    { slideIndex: 5, role: "conclusion", message: "结论与下一步", supportingPoints: ["绑定清单作为事实来源", "保持无绑定项目兼容", "禁止静默编造数据"] }
  ]
};

const metric = { label: "准时交付率", value: "78%", numericValue: 78, unit: "%", sourceText: "准时交付率基期为78%" };
const slidePlans = storyline.slides.map((slide) => ({
  slideIndex: slide.slideIndex,
  role: slide.role,
  message: slide.message,
  importance: slide.slideIndex <= 2 ? "critical" : "high",
  density: "medium",
  layoutSource: "generative_layout",
  visualPriority: slide.slideIndex === 3 ? "chart" : "balanced",
  components: ["title", slide.slideIndex === 3 ? "business_metric_spread" : "body", "footer"],
  renderRoutes: { title: "native", body: "native", chart: "native", footer: "native" },
  editableLevel: "native",
  content: slide.supportingPoints,
  metrics: slide.slideIndex === 3 ? [metric] : [],
  ...(slide.slideIndex === 3 ? { bindingTargets: [
    { id: "delivery-gap-kpi", kind: "text", objectName: "metric-delta", template: "{{经营.KPI.改善}} 个百分点" },
    {
      id: "delivery-rate-chart", kind: "chart", objectName: "metric-rate-chart",
      categoriesTemplate: "{{经营.趋势.期间}}",
      series: [{ nameTemplate: "{{经营.趋势.名称}}", valuesTemplate: "{{经营.趋势.数值}}" }]
    }
  ] } : {})
}));

const style = {
  styleId: "data_binding_acceptance_v1", name: "Data Binding Acceptance", sourceType: "system", version: "1",
  styleVector: {}, typography: { primary: "Microsoft YaHei" }, colors: { primary: "#123B5D" },
  grid: {}, composition: {}, charts: {}, visuals: {}, storytelling: {}, density: {}, preferredLayouts: [], antiPatterns: []
};
const controls = {
  referenceStrength: 0, minimalism: 65, modernity: 65, airiness: 60,
  visualWeight: 60, technologyTone: 30, visualImpact: 55,
  locks: { typography: false, colors: false, layout: false }
};
const bindingInput = {
  format: "json", name: "经营指标.json",
  data: { 经营: { KPI: { 改善: 7 }, 趋势: { 期间: ["基期", "当前"], 名称: "准时交付率", 数值: [78, 85] } } }
};

const project = await post("/api/projects", { name: "Data Binding Core Acceptance" });
const projectId = project.id;
const projectDir = path.resolve("generated/projects", projectId);
const request = { projectId, direction: "B", storyline, slidePlans, finalStyle: style, controls, bindingInput };

async function generateSnapshot() {
  const response = await post("/api/deck/generate", request);
  const manifest = JSON.parse(await fs.readFile(path.join(projectDir, "slide-plans", "binding-manifest.json"), "utf8"));
  const evidence = JSON.parse(await fs.readFile(path.join(projectDir, "render", "final", "binding-render-evidence.json"), "utf8"));
  const layout = JSON.parse(await fs.readFile(path.join(projectDir, "render", "final", "slide-003.layout.json"), "utf8"));
  return { response, manifest, evidence, chart: layout.chartMetadata.charts.find((item) => item.objectName === "metric-rate-chart") };
}

const first = await generateSnapshot();
const second = await generateSnapshot();
const initialQa = await post("/api/qa/run", { projectId, referenceStrength: 0, repairPass: 0 });
let qa = initialQa;
let repairAttempts = 0;
while (qa.status !== "PASS" && repairAttempts < 3 && qa.issues.some((issue) => issue.autoFixable)) {
  qa = await post("/api/qa/fix", { projectId });
  repairAttempts += 1;
  if (qa.rolledBack) break;
}
const finalEvidence = JSON.parse(await fs.readFile(path.join(projectDir, "render", "final", "binding-render-evidence.json"), "utf8"));
const finalLayout = JSON.parse(await fs.readFile(path.join(projectDir, "render", "final", "slide-003.layout.json"), "utf8"));
const finalChart = finalLayout.chartMetadata.charts.find((item) => item.objectName === "metric-rate-chart");
const finalPptx = path.join(projectDir, "output", "final.pptx");
const reopenedDir = path.join(projectDir, "render", "reopened-final");
const reopen = await execFileAsync(process.execPath, [path.resolve("adapters/native-pptx/render-reference.mjs"), finalPptx, reopenedDir], {
  env: process.env,
  maxBuffer: 10 * 1024 * 1024
});
const reopenReport = JSON.parse(reopen.stdout.trim().split(/\r?\n/).at(-1));
const inspect = await fs.readFile(path.join(reopenedDir, "inspect.ndjson"), "utf8");
const finalFontEvidence = JSON.parse(await fs.readFile(path.join(projectDir, "render", "final", "font-evidence.json"), "utf8"));
const kpiText = finalFontEvidence.objects.find((item) => item.objectName === "metric-delta")?.text;
const deterministicManifest = JSON.stringify(first.manifest) === JSON.stringify(second.manifest);
const deterministicData = JSON.stringify(first.evidence) === JSON.stringify(second.evidence) && JSON.stringify(first.chart) === JSON.stringify(second.chart);
const bindingPreservedThroughQa = JSON.stringify(second.evidence) === JSON.stringify(finalEvidence) &&
  JSON.stringify(second.chart.categories) === JSON.stringify(finalChart.categories) &&
  JSON.stringify(second.chart.series) === JSON.stringify(finalChart.series);
const technicalPassed = Object.values(qa.technical).every((report) => report.passed);
const passed = first.response.slides === 5 && first.manifest.status === "resolved" && first.manifest.targets.length === 2 &&
  first.manifest.unresolvedKeys.length === 0 && deterministicManifest && deterministicData &&
  kpiText === "7 个百分点" && JSON.stringify(first.chart.categories) === JSON.stringify(["基期", "当前"]) &&
  JSON.stringify(first.chart.series[0].values) === JSON.stringify([78, 85]) &&
  first.evidence.appliedTargets.length === 2 && bindingPreservedThroughQa && qa.status === "PASS" && technicalPassed &&
  reopenReport.slides === 5 && /"kind":"chart"/.test(inspect) && /[\u3400-\u9fff]/.test(inspect) && !/[\ufffd]/.test(inspect);
const manifest = {
  projectId,
  status: passed ? "PASS" : "FAIL",
  checks: {
    slides: first.response.slides,
    bindingStatus: first.manifest.status,
    inputHash: first.manifest.source.inputHash,
    resolutionHash: first.manifest.resolutionHash,
    resolvedKeys: first.manifest.resolvedKeys,
    unresolvedKeys: first.manifest.unresolvedKeys,
    deterministicManifest,
    deterministicData,
    bindingPreservedThroughQa,
    kpiText,
    chartCategories: first.chart.categories,
    chartValues: first.chart.series[0].values,
    appliedTargets: first.evidence.appliedTargets.map((item) => `${item.kind}:${item.objectName}`),
    qaStatus: qa.status,
    qaOverall: qa.overall,
    qaReadability: qa.readability,
    initialQaStatus: initialQa.status,
    repairAttempts,
    technicalPassed,
    reopenedSlides: reopenReport.slides,
    nativeChartPresent: /"kind":"chart"/.test(inspect),
    cjkIntact: /[\u3400-\u9fff]/.test(inspect) && !/[\ufffd]/.test(inspect)
  },
  artifacts: {
    finalPptx,
    bindingManifest: path.join(projectDir, "slide-plans", "binding-manifest.json"),
    bindingRenderEvidence: path.join(projectDir, "render", "final", "binding-render-evidence.json"),
    contactSheet: path.join(projectDir, "render", "final", "contact-sheet.webp"),
    reopenedContactSheet: path.join(reopenedDir, "contact-sheet.webp"),
    qaReport: path.join(projectDir, "qa", "qa-report.json")
  }
};
await fs.writeFile(path.join(projectDir, "output", "data-binding-acceptance-manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
console.log(JSON.stringify(manifest, null, 2));
if (!passed) process.exitCode = 1;
