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
const dimensions = ["typography", "color", "layout", "chart", "density", "composition", "storytelling", "visualTone"];

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const baseUrl = option("base-url", "http://127.0.0.1:3026").replace(/\/$/, "");
const referencePath = path.resolve(option("reference", "generated/showcase/visual-quality-gate/PPT-Factory-视觉质量版.pptx"));
const materialPath = path.resolve(option("material", "tests/fixtures/unrelated-material.md"));
const projectRoot = path.resolve(option("project-root", "generated/projects"));
const existingProjectId = option("project-id", "");
const reusePreviews = option("reuse-previews", "false") === "true";
const verifyOnly = option("verify-only", "false") === "true";

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
  return json(await fetch(`${baseUrl}${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
}

function advancedControls(kind) {
  const promptLed = kind === "technology";
  const weights = Object.fromEntries(dimensions.map((dimension) => [dimension,
    dimension === "color" || dimension === "visualTone"
      ? { reference: 5, system: 5, prompt: 90 }
      : { reference: promptLed ? 35 : 60, system: promptLed ? 30 : 40, prompt: promptLed ? 35 : 0 }
  ]));
  return {
    referenceStrength: 30,
    minimalism: promptLed ? 45 : 82,
    modernity: promptLed ? 92 : 58,
    airiness: promptLed ? 45 : 82,
    visualWeight: promptLed ? 82 : 52,
    technologyTone: promptLed ? 94 : 8,
    visualImpact: promptLed ? 92 : 42,
    locks: { typography: false, colors: false, layout: false },
    advancedMixer: {
      weights,
      locks: { typography: false, color: false, layout: false, chart: true, density: false, composition: false, storytelling: false, visualTone: false }
    }
  };
}

function layoutSignature(raw) {
  return [...raw.matchAll(/"name"\s*:\s*"([^"]+)/g)].map((match) => match[1]).sort().join("|");
}

async function imageDifference(left, right) {
  const [a, b] = await Promise.all([sharp(left).resize(160, 90).removeAlpha().raw().toBuffer(), sharp(right).resize(160, 90).removeAlpha().raw().toBuffer()]);
  let sum = 0;
  for (let index = 0; index < a.length; index += 1) sum += Math.abs(a[index] - b[index]);
  return Number((sum / a.length / 255).toFixed(4));
}

function inspectMetrics(raw) {
  const counts = { text: 0, shape: 0, chart: 0, table: 0, image: 0 };
  const visit = (value) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== "object") return;
    const candidates = [value.kind, value.type, value.objectType].filter((item) => typeof item === "string").map((item) => item.toLowerCase());
    for (const type of Object.keys(counts)) if (candidates.some((candidate) => candidate.includes(type))) counts[type] += 1;
    Object.values(value).forEach(visit);
  };
  for (const line of raw.split(/\r?\n/).filter(Boolean)) try { visit(JSON.parse(line)); } catch {}
  const native = counts.text + counts.shape + counts.chart + counts.table;
  const total = native + counts.image;
  return { counts, editableRatio: total ? Number((native / total).toFixed(4)) : 0, cjkIntact: /[\u3400-\u9fff]/.test(raw) && !/[\ufffd]/.test(raw) };
}

const project = existingProjectId ? { id: existingProjectId } : await post("/api/projects", { name: "Advanced Style Mixer Acceptance" });
const projectId = project.id;
const projectDir = path.join(projectRoot, projectId);
const reference = existingProjectId ? {
  analysis: JSON.parse(await fs.readFile(path.join(projectDir, "analysis", "reference-analysis.json"), "utf8")),
  referenceStyleDna: JSON.parse(await fs.readFile(path.join(projectDir, "style", "reference-style-dna.json"), "utf8")),
  systemStyleDna: JSON.parse(await fs.readFile(path.join(projectDir, "style", "system-style-dna.json"), "utf8"))
} : await upload("/api/reference/analyze", { projectId, learnStyle: true, systemStylePreset: "adaptive" }, referencePath);
if (reference.analysis.slideCount > 8) throw new Error(`Acceptance reference exceeds 8 slides: ${reference.analysis.slideCount}`);
const material = existingProjectId ? {
  storyline: JSON.parse(await fs.readFile(path.join(projectDir, "storyline", "storyline.json"), "utf8")),
  slidePlans: JSON.parse(await fs.readFile(path.join(projectDir, "slide-plans", "slide-plans.json"), "utf8"))
} : await upload("/api/materials/parse", {
  projectId,
  text: await fs.readFile(materialPath, "utf8"),
  audience: "制造运营与质量决策者",
  purpose: "形成可执行的运营改进决策",
  pageTarget: 8
});

const settings = [
  { id: "financial", promptText: "克制、留白、金融机构感 restrained airy institutional" },
  { id: "technology", promptText: "现代科技终端、高冲击 modern technology terminal high impact" }
];
const evidence = {};

if (verifyOnly) {
  const manifestPath = path.join(projectDir, "output", "advanced-style-mixer-acceptance.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  manifest.checks.renderedDifference = await imageDifference(manifest.settings.financial.artifacts.contactSheet, manifest.settings.technology.artifacts.contactSheet);
  manifest.checks.renderedDifferenceVisible = manifest.checks.renderedDifference >= 0.003;
  manifest.status = Object.entries(manifest.checks).every(([key, value]) => ["referenceSlides", "outputSlides", "renderedDifference"].includes(key) || value === true) ? "PASS" : "FAIL";
  manifest.verifiedAt = new Date().toISOString();
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  console.log(JSON.stringify(manifest, null, 2));
  if (manifest.status !== "PASS") process.exitCode = 1;
  process.exit();
}

for (const setting of settings) {
  const controls = advancedControls(setting.id);
  const preview = reusePreviews ? {
    styleMix: JSON.parse(await fs.readFile(path.join(projectDir, "style", `style-mix-advanced-${setting.id}.json`), "utf8"))
  } : await post("/api/style/preview", {
    projectId, storyline: material.storyline, slidePlans: material.slidePlans,
    styleDna: reference.referenceStyleDna, systemStyleDna: reference.systemStyleDna,
    promptText: setting.promptText, controls, previewSet: `advanced-${setting.id}`
  });
  if (reusePreviews) preview.finalStyle = preview.styleMix.finalStyle;
  const signatures = {};
  for (const direction of ["A", "B", "C"]) {
    signatures[direction] = layoutSignature(await fs.readFile(path.join(projectDir, "render", "previews", `advanced-${setting.id}`, direction, "slide-001.layout.json"), "utf8"));
  }
  const deck = await post("/api/deck/generate", {
    projectId, direction: "B", storyline: material.storyline, slidePlans: material.slidePlans,
    finalStyle: preview.finalStyle, controls
  });
  let qa = await post("/api/qa/run", { projectId, referenceStrength: controls.referenceStrength, repairPass: 0 });
  let repairPasses = 0;
  while (repairPasses < 3 && qa.status !== "PASS" && qa.issues.some((issue) => issue.autoFixable)) {
    qa = await post("/api/qa/fix", { projectId });
    repairPasses += 1;
    if (qa.rolledBack) break;
  }
  const savedPptx = path.join(projectDir, "output", `advanced-${setting.id}.pptx`);
  const savedRender = path.join(projectDir, "render", `advanced-${setting.id}`);
  await fs.copyFile(path.join(projectDir, "output", "final.pptx"), savedPptx);
  await fs.cp(path.join(projectDir, "render", "final"), savedRender, { recursive: true });
  const reopenedDir = path.join(projectDir, "render", `reopened-${setting.id}`);
  const reopen = await execFileAsync(process.execPath, [path.resolve("adapters/native-pptx/render-reference.mjs"), savedPptx, reopenedDir], { env: process.env, maxBuffer: 10 * 1024 * 1024 });
  const reopenReport = JSON.parse(reopen.stdout.trim().split(/\r?\n/).at(-1));
  const inspect = inspectMetrics(await fs.readFile(path.join(reopenedDir, "inspect.ndjson"), "utf8"));
  evidence[setting.id] = {
    controls, styleMix: preview.styleMix, finalStyle: preview.finalStyle,
    distinctDirections: new Set(Object.values(signatures)).size === 3,
    slidesRendered: (await fs.readdir(savedRender)).filter((name) => /^slide-\d+\.png$/.test(name)).length,
    reopenedSlides: reopenReport.slides,
    inspect,
    qa, repairPasses,
    artifacts: { pptx: savedPptx, contactSheet: path.join(savedRender, "contact-sheet.webp"), reopenedContactSheet: path.join(reopenedDir, "contact-sheet.webp") }
  };
}

const renderedDifference = await imageDifference(evidence.financial.artifacts.contactSheet, evidence.technology.artifacts.contactSheet);
const chartLockStable = JSON.stringify(evidence.financial.finalStyle.charts) === JSON.stringify(reference.referenceStyleDna.charts)
  && JSON.stringify(evidence.technology.finalStyle.charts) === JSON.stringify(reference.referenceStyleDna.charts)
  && evidence.financial.styleMix.resolvedOwnership.chart.locked === true
  && evidence.technology.styleMix.resolvedOwnership.chart.locked === true;
const unlockedColorChanged = JSON.stringify(evidence.financial.finalStyle.colors) !== JSON.stringify(evidence.technology.finalStyle.colors);
const qaPassed = settings.every(({ id }) => {
  const item = evidence[id];
  return item.qa.overall >= 85 && item.qa.readability >= 85 && item.qa.aiLookScore <= 20
    && item.qa.technical.contrast.passed && item.qa.technical.fontFallback.passed
    && item.qa.technical.imageDistortion.passed && item.qa.technical.chartLabelCollision.passed;
});
const checks = {
  referenceSlides: reference.analysis.slideCount,
  outputSlides: material.slidePlans.length,
  bothAtMostEight: reference.analysis.slideCount <= 8 && material.slidePlans.length <= 8,
  distinctDirections: settings.every(({ id }) => evidence[id].distinctDirections),
  allSlidesRendered: settings.every(({ id }) => evidence[id].slidesRendered === material.slidePlans.length && evidence[id].reopenedSlides === material.slidePlans.length),
  editable: settings.every(({ id }) => evidence[id].inspect.editableRatio >= 0.8 && evidence[id].inspect.cjkIntact),
  chartLockStable,
  unlockedColorChanged,
  renderedDifference,
  renderedDifferenceVisible: renderedDifference >= 0.003,
  qaPassed
};
const passed = Object.entries(checks).every(([key, value]) => ["referenceSlides", "outputSlides", "renderedDifference"].includes(key) || value === true);
const manifest = { projectId, status: passed ? "PASS" : "FAIL", settings: Object.fromEntries(settings.map(({ id }) => [id, { artifacts: evidence[id].artifacts, qa: { status: evidence[id].qa.status, overall: evidence[id].qa.overall, readability: evidence[id].qa.readability, aiLookScore: evidence[id].qa.aiLookScore, repairPasses: evidence[id].repairPasses }, editableRatio: evidence[id].inspect.editableRatio, resolvedOwnership: evidence[id].styleMix.resolvedOwnership, colors: evidence[id].finalStyle.colors, charts: evidence[id].finalStyle.charts }])), checks, generatedAt: new Date().toISOString() };
await fs.writeFile(path.join(projectDir, "output", "advanced-style-mixer-acceptance.json"), JSON.stringify(manifest, null, 2), "utf8");
console.log(JSON.stringify(manifest, null, 2));
if (!passed) process.exitCode = 1;
