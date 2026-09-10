import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import JSZip from "jszip";
import { applyExistingDeckUpdate, inspectEditableDeck } from "../adapters/native-pptx/update-existing-deck.mjs";

const execFileAsync = promisify(execFile);
const root = path.resolve("generated/probes/update-existing-deck");
const sourceRender = path.join(root, "source-render");
const beforeRender = path.join(root, "before-render");
const afterRender = path.join(root, "after-render");
const sourcePptx = path.join(root, "source-v1.pptx");
const outputPptx = path.join(root, "updated-v2.pptx");
const requestPath = path.join(root, "source-request.json");
const manifestPath = path.join(root, "DECK_UPDATE_MANIFEST.json");
await fs.rm(root, { recursive: true, force: true });
await fs.mkdir(root, { recursive: true });

const storyline = {
  thesis: "可控更新必须保留原稿结构和编辑能力",
  audience: "经营管理层",
  purpose: "验证已有汇报的定点更新",
  sourceSummary: "5页合成经营简报，仅用于本地验收。",
  slides: [
    { slideIndex: 1, role: "cover", message: "二季度经营复盘", supportingPoints: ["原稿版本 V1"] },
    { slideIndex: 2, role: "executive_summary", message: "经营质量改善，但交付波动仍需治理", supportingPoints: ["收入质量保持稳定", "交付节奏是当前核心约束", "明确责任人和周度节奏"] },
    { slideIndex: 3, role: "evidence", message: "准时交付率持续改善", supportingPoints: ["目标是把改善转化为稳定能力", "核心数据来自明确更新计划"] },
    { slideIndex: 4, role: "strategy", message: "用三项动作固化改善", supportingPoints: ["统一口径", "周度复盘", "异常闭环"] },
    { slideIndex: 5, role: "conclusion", message: "形成可复用的经营更新机制", supportingPoints: ["只改目标对象", "保留原稿风格", "版本可追溯"] }
  ]
};
const metric = (label, value) => ({ label, value: `${value}%`, numericValue: value, unit: "%", sourceText: `${label}${value}%` });
const slidePlans = storyline.slides.map((slide) => ({
  slideIndex: slide.slideIndex, role: slide.role, message: slide.message,
  importance: slide.slideIndex < 3 ? "critical" : "high", density: "medium",
  layoutSource: "generative_layout", visualPriority: slide.slideIndex === 3 ? "chart" : "balanced",
  components: ["title", slide.slideIndex === 3 ? "business_metric_spread" : "body", "footer"],
  renderRoutes: { title: "native", body: "native", chart: "native", footer: "native" },
  editableLevel: "native", content: slide.supportingPoints,
  metrics: slide.slideIndex === 3 ? [metric("基期", 72), metric("当前", 81)] : []
}));
const request = {
  preview: false, direction: "B", storyline, slidePlans,
  style: { styleId: "deck_update_acceptance", name: "Deck Update Acceptance", sourceType: "system", version: "1", styleVector: {}, typography: { primary: "Microsoft YaHei" }, colors: { primary: "#123B5D" }, grid: {}, composition: {}, charts: {}, visuals: {}, storytelling: {}, density: {}, preferredLayouts: [], antiPatterns: [] },
  controls: { referenceStrength: 0, minimalism: 65, modernity: 65, airiness: 60, visualWeight: 60, technologyTone: 30, visualImpact: 55, locks: { typography: true, colors: true, layout: true }, advancedMixer: { locks: { typography: true, color: true, layout: true, chart: true, density: true, composition: true, storytelling: true, visualTone: true }, weights: Object.fromEntries(["typography", "color", "layout", "chart", "density", "composition", "storytelling", "visualTone"].map((dimension) => [dimension, { reference: 0, system: 100, prompt: 0 }])) } },
  outputDir: sourceRender, outputPptx: sourcePptx, repairPass: 0
};
await fs.writeFile(requestPath, JSON.stringify(request, null, 2), "utf8");
await execFileAsync(process.execPath, [path.resolve("adapters/native-pptx/generate-deck.mjs"), requestPath], { env: process.env, maxBuffer: 20 * 1024 * 1024 });
await execFileAsync(process.execPath, [path.resolve("adapters/native-pptx/render-reference.mjs"), sourcePptx, beforeRender], { env: process.env, maxBuffer: 20 * 1024 * 1024 });

const catalog = await inspectEditableDeck(sourcePptx);
const textTarget = catalog.objects.find((item) => item.slideIndex === 1 && item.objectName === "cover-title" && item.kind === "text");
const chartTarget = catalog.objects.find((item) => item.slideIndex === 3 && item.kind === "chart");
if (!textTarget || !chartTarget) throw new Error("Acceptance source lacks expected native targets");
const sourceHashBefore = createHash("sha256").update(await fs.readFile(sourcePptx)).digest("hex");
const plan = {
  updateId: "v2", sourceVersionId: "v1",
  lockedDimensions: ["typography", "color", "layout", "chart", "density", "composition", "storytelling", "visualTone"],
  targets: [
    { targetId: "cover-quarter", slideIndex: 1, kind: "text", stableId: textTarget.stableId, objectName: "cover-title", value: "三季度经营复盘" },
    { targetId: "delivery-trend", slideIndex: 3, kind: "chart", stableId: chartTarget.stableId, objectName: chartTarget.objectName, chart: { categories: ["基期", "当前"], series: [{ name: "准时交付率", values: [76, 88] }] } }
  ]
};
const manifest = await applyExistingDeckUpdate({ sourcePath: sourcePptx, outputPath: outputPptx, plan });
await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
await execFileAsync(process.execPath, [path.resolve("adapters/native-pptx/render-reference.mjs"), outputPptx, afterRender], { env: process.env, maxBuffer: 20 * 1024 * 1024 });

const sourceHashAfter = createHash("sha256").update(await fs.readFile(sourcePptx)).digest("hex");
const beforeInspect = await fs.readFile(path.join(beforeRender, "inspect.ndjson"), "utf8");
const afterInspect = await fs.readFile(path.join(afterRender, "inspect.ndjson"), "utf8");
const outputZip = await JSZip.loadAsync(await fs.readFile(outputPptx));
const chartPart = Object.keys(outputZip.files).find((name) => /(?:^|\/)charts\/chart\d+\.xml$/.test(name));
const chartXml = chartPart ? await outputZip.file(chartPart).async("string") : "";
const pngHash = async (directory, slide) => createHash("sha256").update(await fs.readFile(path.join(directory, `slide-${String(slide).padStart(3, "0")}.png`))).digest("hex");
const untouchedSlides = [2, 4, 5];
const untouchedVisualsStable = (await Promise.all(untouchedSlides.map(async (slide) => (await pngHash(beforeRender, slide)) === (await pngHash(afterRender, slide))))).every(Boolean);
const layoutChecks = [];
let allObjectsInBounds = true;
for (let slide = 1; slide <= 5; slide += 1) {
  const layout = JSON.parse(await fs.readFile(path.join(afterRender, `slide-${String(slide).padStart(3, "0")}.layout.json`), "utf8"));
  layoutChecks.push(Boolean(layout));
  const frame = layout.slide.frame;
  allObjectsInBounds &&= layout.elements.every((element) => {
    if (!Array.isArray(element.bbox)) return true;
    const [left, top, width, height] = element.bbox;
    return left >= 0 && top >= 0 && width >= 0 && height >= 0 && left + width <= frame.width + 1 && top + height <= frame.height + 1;
  });
}
const checks = {
  sourceSlides: catalog.source.slides,
  outputSlides: manifest.output.slides,
  sourceNotOverwritten: sourceHashBefore === sourceHashAfter,
  twoExplicitChanges: manifest.changes.length === 2,
  untouchedObjectsStable: manifest.preservation.untouchedObjectsStable,
  untouchedVisualsStable,
  allSlidesRendered: layoutChecks.every(Boolean),
  cjkIntact: /三季度经营复盘/.test(afterInspect) && /[\u3400-\u9fff]/.test(afterInspect) && !/[\ufffd]/.test(afterInspect),
  oldTitleAbsent: !/二季度经营复盘/.test(afterInspect),
  nativeChartPresent: /"kind":"chart"/.test(afterInspect),
  nativeTextPresent: /"kind":"textbox"/.test(afterInspect),
  chartValuesUpdated: /<c:v>76<\/c:v>/.test(chartXml) && /<c:v>88<\/c:v>/.test(chartXml),
  lockedDimensionsPreserved: manifest.lockedDimensions.length === 8,
  beforeCjkIntact: /[\u3400-\u9fff]/.test(beforeInspect) && !/[\ufffd]/.test(beforeInspect),
  allObjectsInBounds,
  technicalPassed: layoutChecks.every(Boolean) && allObjectsInBounds && !/[\ufffd]/.test(afterInspect) && /"kind":"chart"/.test(afterInspect)
};
const passed = Object.values(checks).every((value) => value === true || value === 5);
const report = {
  schema: "ppt-factory/deck-update-acceptance/v1", status: passed ? "PASS" : "FAIL", checks,
  artifacts: { sourcePptx, outputPptx, manifest: manifestPath, beforeContactSheet: path.join(beforeRender, "contact-sheet.webp"), afterContactSheet: path.join(afterRender, "contact-sheet.webp") }
};
await fs.writeFile(path.join(root, "ACCEPTANCE.json"), JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify(report, null, 2));
if (!passed) process.exitCode = 1;
