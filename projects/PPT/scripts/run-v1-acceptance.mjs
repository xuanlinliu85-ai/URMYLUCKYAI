import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

function loadSharedDependency(name) {
  let cursor = process.cwd();
  while (true) {
    if (fsSync.existsSync(path.join(cursor, "node_modules", name))) return createRequire(path.join(cursor, "package.json"))(name);
    const parent = path.dirname(cursor);
    if (parent === cursor) throw new Error(`Cannot find shared dependency: ${name}`);
    cursor = parent;
  }
}

const sharp = loadSharedDependency("sharp");
const execFileAsync = promisify(execFile);

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const baseUrl = option("base-url", "http://127.0.0.1:3020").replace(/\/$/, "");
const referencePath = path.resolve(option("reference", "../银行内部通报_铜产业链产品策略_试验版.pptx"));
const materialPath = path.resolve(option("material", "tests/fixtures/unrelated-material.md"));
const projectRoot = path.resolve(option("project-root", "generated/projects"));
const exerciseRepair = option("exercise-repair", "false") === "true";
const typographyLock = option("typography-lock", "false") === "true";
const fontFallbackExercise = option("font-fallback", "false") === "true";
const imageFixture = option("image-fixture", "false") === "true";

async function json(response) {
  const body = await response.json();
  if (!response.ok) throw new Error(`${response.status} ${response.url}: ${body.error ?? JSON.stringify(body)}`);
  return body;
}

async function upload(endpoint, fields, filePath, fieldName = "file") {
  const form = new FormData();
  Object.entries(fields).forEach(([key, value]) => form.set(key, String(value)));
  if (filePath) form.set(fieldName, new Blob([await fs.readFile(filePath)]), path.basename(filePath));
  return json(await fetch(`${baseUrl}${endpoint}`, { method: "POST", body: form }));
}

async function post(endpoint, body) {
  return json(await fetch(`${baseUrl}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  }));
}

const controls = {
  referenceStrength: 90,
  minimalism: 65,
  modernity: 70,
  airiness: 65,
  visualWeight: 60,
  technologyTone: 25,
  visualImpact: 55,
  locks: { typography: typographyLock, colors: false, layout: false }
};

async function imageDifference(left, right) {
  const [a, b] = await Promise.all([
    sharp(left).resize(160, 90).removeAlpha().raw().toBuffer(),
    sharp(right).resize(160, 90).removeAlpha().raw().toBuffer()
  ]);
  let sum = 0;
  for (let index = 0; index < a.length; index += 1) sum += Math.abs(a[index] - b[index]);
  return Number((sum / a.length / 255).toFixed(4));
}

function inspectMetrics(raw) {
  const typeCounts = { text: 0, shape: 0, chart: 0, table: 0, image: 0 };
  const count = (value) => {
    if (Array.isArray(value)) return value.forEach(count);
    if (!value || typeof value !== "object") return;
    const record = value;
    const candidates = [record.kind, record.type, record.objectType].filter((item) => typeof item === "string").map((item) => item.toLowerCase());
    for (const type of Object.keys(typeCounts)) if (candidates.some((candidate) => candidate.includes(type))) typeCounts[type] += 1;
    Object.values(record).forEach(count);
  };
  for (const line of raw.split(/\r?\n/).filter(Boolean)) {
    try { count(JSON.parse(line)); } catch {}
  }
  const native = typeCounts.text + typeCounts.shape + typeCounts.chart + typeCounts.table;
  const total = native + typeCounts.image;
  return {
    typeCounts,
    nativeObjects: native,
    imageObjects: typeCounts.image,
    editableRatio: total ? Number((native / total).toFixed(4)) : 0,
    cjkPresent: /[\u3400-\u9fff]/.test(raw),
    cjkCorruptionAbsent: !/[\ufffd]/.test(raw)
  };
}

const project = await post("/api/projects", { name: "V1 Happy Path Acceptance" });
const projectId = project.id;
const projectDir = path.join(projectRoot, projectId);
const reference = await upload("/api/reference/analyze", { projectId, learnStyle: true, systemStylePreset: "adaptive" }, referencePath);
const materialText = await fs.readFile(materialPath, "utf8");
const material = await upload("/api/materials/parse", {
  projectId,
  text: materialText,
  audience: "制造运营与质量决策者",
  purpose: "形成可执行的运营改进决策",
  pageTarget: 8
});

async function preview(previewSet, referenceStrength) {
  return post("/api/style/preview", {
    projectId,
    storyline: material.storyline,
    slidePlans: material.slidePlans,
    styleDna: reference.styleDna,
    controls: { ...controls, referenceStrength },
    previewSet
  });
}

const preview90 = await preview("strength-90", 90);
const preview50 = await preview("strength-50", 50);
const strengthDifference = await imageDifference(
  path.join(projectDir, "render", "previews", "strength-90", "A", "slide-001.png"),
  path.join(projectDir, "render", "previews", "strength-50", "A", "slide-001.png")
);
const directionSignatures = {};
for (const direction of ["A", "B", "C"]) {
  const layout = await fs.readFile(path.join(projectDir, "render", "previews", "strength-50", direction, "slide-001.layout.json"), "utf8");
  directionSignatures[direction] = [...layout.matchAll(/\"name\"\s*:\s*\"([^\"]+)/g)].map((match) => match[1]).sort();
}
const distinctDirections = new Set(Object.values(directionSignatures).map((items) => items.join("|"))).size === 3;
const finalControls = { ...controls, referenceStrength: 50 };
const finalStyle = fontFallbackExercise ? {
  ...preview50.finalStyle,
  typography: { ...preview50.finalStyle.typography, primary: "Noto Sans CJK Missing" }
} : preview50.finalStyle;
const deck = await post("/api/deck/generate", {
  projectId,
  direction: imageFixture ? "A" : "B",
  storyline: material.storyline,
  slidePlans: material.slidePlans,
  finalStyle,
  controls: finalControls,
  imageQaFixture: imageFixture
});
const initialQa = await post("/api/qa/run", { projectId, referenceStrength: 50, repairPass: 0 });
let qa = initialQa;
let repairTriggered = false;
let repairAttempts = 0;
while (repairAttempts < 3 && ((qa.status !== "PASS" && qa.issues.some((issue) => issue.autoFixable)) || (exerciseRepair && repairAttempts === 0 && qa.issues.some((issue) => issue.id === "fidelity-typography")))) {
  qa = await post("/api/qa/fix", { projectId });
  repairTriggered = true;
  repairAttempts += 1;
  if (qa.rolledBack) break;
}
const finalPptx = path.join(projectDir, "output", "final.pptx");
const pptxStat = await fs.stat(finalPptx);
const reopenedDir = path.join(projectDir, "render", "reopened-final");
const reopenResult = await execFileAsync(process.execPath, [
  path.resolve("adapters/native-pptx/render-reference.mjs"), finalPptx, reopenedDir
], { env: process.env, maxBuffer: 10 * 1024 * 1024 });
const reopenReport = JSON.parse(reopenResult.stdout.trim().split(/\r?\n/).at(-1));
const inspectRaw = await fs.readFile(path.join(reopenedDir, "inspect.ndjson"), "utf8");
const editability = inspectMetrics(inspectRaw);
const checks = {
  referenceSlidesRendered: (await fs.readdir(path.join(projectDir, "render", "reference"))).filter((name) => /^slide-\d+\.png$/.test(name)).length === reference.analysis.slideCount,
  strengthDifference,
  strengthDifferenceVisible: strengthDifference >= 0.01,
  distinctDirections,
  selectedDirection: imageFixture ? "A" : "B",
  finalPptxOpenable: pptxStat.size > 10000 && reopenReport.slides === material.slidePlans.length,
  reopenedSlides: reopenReport.slides,
  ...editability,
  qaStatus: qa.status,
  qaOverall: qa.overall,
  qaReadability: qa.readability,
  qaFidelityMode: qa.fidelity?.mode,
  qaReferenceFidelity: qa.referenceFidelity,
  typographyBefore: initialQa.fidelity?.dimensions?.typography?.score,
  typographyAfter: qa.fidelity?.dimensions?.typography?.score,
  contrastBefore: initialQa.technical?.contrast?.score,
  contrastAfter: qa.technical?.contrast?.score,
  contrastFailuresBefore: initialQa.technical?.contrast?.failingObjects,
  contrastFailuresAfter: qa.technical?.contrast?.failingObjects,
  fontFallbackBefore: initialQa.technical?.fontFallback?.score,
  fontFallbackAfter: qa.technical?.fontFallback?.score,
  fontFallbackFailuresBefore: initialQa.technical?.fontFallback?.failingObjects,
  fontFallbackFailuresAfter: qa.technical?.fontFallback?.failingObjects,
  imageDistortionBefore: initialQa.technical?.imageDistortion?.score,
  imageDistortionAfter: qa.technical?.imageDistortion?.score,
  imageFailuresBefore: initialQa.technical?.imageDistortion?.failingObjects,
  imageFailuresAfter: qa.technical?.imageDistortion?.failingObjects,
  repairRolledBack: Boolean(qa.rolledBack),
  qaAiLookScore: qa.aiLookScore,
  repairTriggered,
  repairAttempts
};
const technicalTargetPassed = qa.technical?.contrast?.passed && qa.technical?.fontFallback?.passed && qa.technical?.imageDistortion?.passed;
const passed = checks.referenceSlidesRendered && (checks.strengthDifferenceVisible || imageFixture) && checks.distinctDirections &&
  checks.finalPptxOpenable && checks.editableRatio >= 0.8 && checks.cjkPresent && checks.cjkCorruptionAbsent &&
  qa.overall >= 85 && qa.readability >= 85 && qa.aiLookScore <= 20 && qa.fidelity?.mode === "measured" && qa.fidelity?.passed && technicalTargetPassed &&
  (!exerciseRepair || (repairTriggered && (checks.typographyAfter > checks.typographyBefore || checks.repairRolledBack))) &&
  (!imageFixture || (repairTriggered && checks.imageFailuresBefore > 0 && checks.imageFailuresAfter === 0 && checks.imageDistortionAfter > checks.imageDistortionBefore)) &&
  (!fontFallbackExercise || (repairTriggered && checks.fontFallbackAfter > checks.fontFallbackBefore));
const manifest = {
  projectId,
  status: passed ? "PASS" : "FAIL",
  artifacts: {
    referenceStyleDna: path.join(projectDir, "style", "style-dna.json"),
    contentAnalysis: path.join(projectDir, "analysis", "content-analysis.json"),
    storyline: path.join(projectDir, "storyline", "storyline.json"),
    slidePlan: path.join(projectDir, "slide-plans", "slide-plans.json"),
    styleMix: path.join(projectDir, "style", "style-mix.json"),
    qaReport: path.join(projectDir, "qa", "qa-report.json"),
    repairPlan: repairTriggered ? path.join(projectDir, "qa", "repair-plan.json") : null,
    finalPptx,
    contactSheet: path.join(projectDir, "render", "final", "contact-sheet.webp"),
    reopenedContactSheet: path.join(reopenedDir, "contact-sheet.webp"),
    strength90: preview90.directions[0].contactSheetUrl,
    strength50: preview50.directions[0].contactSheetUrl
  },
  checks,
  generatedAt: new Date().toISOString()
};
await fs.writeFile(path.join(projectDir, "output", "acceptance-manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
console.log(JSON.stringify(manifest, null, 2));
if (!passed) process.exitCode = 1;
