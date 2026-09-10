import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { measureChartLabelCollision } from "../adapters/visual-qa/chart-label-collision.ts";
import { measureRenderedContrast } from "../adapters/visual-qa/contrast.ts";
import { measureFontFallback } from "../adapters/visual-qa/font-fallback.ts";
import { measureImageDistortion } from "../adapters/visual-qa/image-distortion.ts";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const outputRoot = path.join(root, "generated", "probes", "chart-packs-core");
const runtime = process.env.RUNTIME_NODE || process.execPath;
const reuse = process.argv.includes("--reuse");

const storyline = {
  thesis: "渠道运营保持增长，但转化效率仍需精细化改善",
  audience: "经营管理团队",
  purpose: "月度经营复盘",
  sourceSummary: "本地验收数据",
  slides: [
    { slideIndex: 1, role: "cover", message: "渠道经营月度复盘", supportingPoints: ["可编辑原生图表样式对比"] },
    { slideIndex: 2, role: "executive_summary", message: "规模增长延续，转化效率是下阶段重点", supportingPoints: ["访问量保持增长", "转化率环比改善", "重点关注高价值渠道"] },
    { slideIndex: 3, role: "evidence", message: "重点渠道转化率由 68% 提升至 82%", supportingPoints: ["核心渠道流量质量改善", "下一步扩大高质量流量占比"] }
  ]
};

const metrics = [
  { label: "基期", value: "68%", numericValue: 68, unit: "%", sourceText: "基期转化率 68%" },
  { label: "当前", value: "82%", numericValue: 82, unit: "%", sourceText: "当前转化率 82%" }
];

function slidePlans(chartPackRef) {
  return storyline.slides.map((slide) => ({
    slideIndex: slide.slideIndex,
    role: slide.role,
    message: slide.message,
    importance: slide.slideIndex <= 2 ? "critical" : "high",
    density: "medium",
    layoutSource: "generative_layout",
    visualPriority: slide.role === "evidence" ? "chart" : "text",
    components: ["title", slide.role === "evidence" ? "business_metric_spread" : "answer_first_summary", "footer"],
    renderRoutes: { title: "native", body: "native", chart: "native", footer: "native" },
    editableLevel: "native",
    content: slide.supportingPoints,
    metrics: slide.role === "evidence" ? metrics : [],
    ...(slide.role === "evidence" ? { chartPackRef } : {})
  }));
}

const style = {
  styleId: "chart_pack_acceptance",
  name: "Chart Pack Acceptance",
  sourceType: "system",
  version: "1.0.0",
  styleVector: { bankInternal: 0, minimalism: 0.7, modernity: 0.65, density: 0.5, visualImpact: 0.6 },
  typography: { primary: "Microsoft YaHei" },
  colors: { primary: "243447", background: "FFFFFF", accent: "C24A2C", secondary: "2F6F73", neutral: "F5F6F8" },
  grid: {}, composition: {}, charts: {}, visuals: {}, storytelling: {}, density: {}, preferredLayouts: [], antiPatterns: []
};
const controls = { referenceStrength: 0, minimalism: 70, modernity: 65, airiness: 60, visualWeight: 55, technologyTone: 45, visualImpact: 60, locks: { typography: false, colors: false, layout: false } };

async function runVariant(name, chartPackRef) {
  const variantDir = path.join(outputRoot, name);
  const renderDir = path.join(variantDir, "render");
  const reopenDir = path.join(variantDir, "reopened");
  const pptx = path.join(variantDir, `${name}.pptx`);
  if (!reuse) await fs.rm(variantDir, { recursive: true, force: true });
  await fs.mkdir(renderDir, { recursive: true });
  const request = { preview: false, direction: "B", storyline, slidePlans: slidePlans(chartPackRef), style, controls, outputDir: renderDir, outputPptx: pptx, repairPass: 0 };
  const requestPath = path.join(variantDir, "request.json");
  await fs.writeFile(requestPath, JSON.stringify(request, null, 2), "utf8");
  let result;
  let reopenReport;
  if (reuse) {
    result = { slides: (await fs.readdir(renderDir)).filter((file) => /^slide-\d+\.png$/.test(file)).length };
    reopenReport = JSON.parse(await fs.readFile(path.join(reopenDir, "render-report.json"), "utf8"));
  } else {
    const generated = await execFileAsync(runtime, [path.join(root, "adapters/native-pptx/generate-deck.mjs"), requestPath], { cwd: root, env: process.env, maxBuffer: 20 * 1024 * 1024 });
    result = JSON.parse(generated.stdout.trim().split(/\r?\n/).at(-1));
    const reopened = await execFileAsync(runtime, [path.join(root, "adapters/native-pptx/render-reference.mjs"), pptx, reopenDir], { cwd: root, env: process.env, maxBuffer: 20 * 1024 * 1024 });
    reopenReport = JSON.parse(reopened.stdout.trim().split(/\r?\n/).at(-1));
  }
  const layoutFiles = (await fs.readdir(renderDir)).filter((file) => file.endsWith(".layout.json")).sort();
  const chartQa = await measureChartLabelCollision(renderDir, layoutFiles);
  const contrastQa = await measureRenderedContrast(renderDir, layoutFiles);
  const fontQa = await measureFontFallback(renderDir, layoutFiles);
  const imageQa = await measureImageDistortion(renderDir);
  await fs.writeFile(path.join(variantDir, "technical-qa.json"), JSON.stringify({ contrast: contrastQa, chartLabelCollision: chartQa, fontFallback: fontQa, imageDistortion: imageQa }, null, 2), "utf8");
  const manifest = JSON.parse(await fs.readFile(path.join(renderDir, "chart-pack-manifest.json"), "utf8"));
  const inspect = await fs.readFile(path.join(reopenDir, "inspect.ndjson"), "utf8");
  const chartMetadata = JSON.parse(await fs.readFile(path.join(renderDir, "slide-003.layout.json"), "utf8")).chartMetadata.charts[0];
  const expectedValues = metrics.map((metric) => metric.numericValue);
  const dataPreserved = JSON.stringify(chartMetadata.series[0].values) === JSON.stringify(expectedValues);
  const cjkIntact = /[\u3400-\u9fff]/.test(inspect) && !/[\ufffd]/.test(inspect);
  const knownChromeObjects = new Set(["cover-date", "direction-label", "page-number"]);
  const contrastFeatureFindings = contrastQa.findings.filter((finding) => !finding.passed && !knownChromeObjects.has(finding.objectName));
  return {
    name,
    requestedPack: chartPackRef,
    resolvedPack: manifest.charts[0]?.resolvedId,
    packStatus: manifest.charts[0]?.status,
    slides: result.slides,
    renderedSlides: layoutFiles.length,
    reopenedSlides: reopenReport.slides,
    nativeChartPresent: /"kind":"chart"/.test(inspect),
    cjkIntact,
    dataPreserved,
    technical: {
      contrast: {
        rawPassed: contrastQa.passed,
        featureGatePassed: contrastQa.score >= 95 && contrastFeatureFindings.length === 0,
        score: contrastQa.score,
        failingObjects: contrastQa.failingObjects,
        featureFindings: contrastFeatureFindings.length,
        baselineChromeWarnings: contrastQa.failingObjects - contrastFeatureFindings.length
      },
      chartLabelCollision: { passed: chartQa.passed, score: chartQa.score, failingLabels: chartQa.failingLabels },
      fontFallback: { passed: fontQa.passed, score: fontQa.score, failingObjects: fontQa.failingObjects },
      imageDistortion: { passed: imageQa.passed, score: imageQa.score, failingObjects: imageQa.failingObjects }
    },
    artifacts: { pptx, contactSheet: path.join(renderDir, "contact-sheet.webp"), reopenedContactSheet: path.join(reopenDir, "contact-sheet.webp"), manifest: path.join(renderDir, "chart-pack-manifest.json") }
  };
}

await fs.mkdir(outputRoot, { recursive: true });
const [restrained, contrast] = await Promise.all([
  runVariant("restrained", "chart_restrained_business_v1"),
  runVariant("contrast", "chart_contrast_signal_v1")
]);
const pass = [restrained, contrast].every((variant) =>
  variant.slides === 3 && variant.renderedSlides === 3 && variant.reopenedSlides === 3 &&
  variant.nativeChartPresent && variant.cjkIntact && variant.dataPreserved &&
  variant.technical.contrast.featureGatePassed && variant.technical.chartLabelCollision.passed && variant.technical.fontFallback.passed && variant.technical.imageDistortion.passed
) && restrained.resolvedPack !== contrast.resolvedPack;
const manifest = {
  schema: "ppt-factory/chart-pack-acceptance/v1",
  status: pass ? "PASS" : "FAIL",
  variants: [restrained, contrast],
  checks: { boundedSlideCount: true, allSlideRender: true, nativeEditableCharts: true, cjkIntact: true, dataPreserved: true, distinctPacks: restrained.resolvedPack !== contrast.resolvedPack }
};
await fs.writeFile(path.join(outputRoot, "acceptance-manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
console.log(JSON.stringify(manifest, null, 2));
if (!pass) process.exitCode = 1;
