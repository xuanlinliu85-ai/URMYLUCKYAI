import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const option = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const baseUrl = option("base-url", "http://127.0.0.1:3032").replace(/\/$/, "");
const referencePath = path.resolve(option("reference", "generated/showcase/rendered-fidelity-score/fidelity-acceptance.pptx"));
const materialPath = path.resolve(option("material", "tests/fixtures/unrelated-material.md"));

async function json(response) {
  const body = await response.json();
  if (!response.ok) throw new Error(`${response.status} ${response.url}: ${body.error ?? JSON.stringify(body)}`);
  return body;
}
async function post(endpoint, body) {
  return json(await fetch(`${baseUrl}${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
}
async function upload(endpoint, fields, filePath) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, String(value));
  if (filePath) form.set("file", new Blob([await fs.readFile(filePath)]), path.basename(filePath));
  return json(await fetch(`${baseUrl}${endpoint}`, { method: "POST", body: form }));
}

const project = await post("/api/projects", { name: "Golden Slide Core Acceptance" });
const projectDir = path.resolve("generated/projects", project.id);
const reference = await upload("/api/reference/analyze", { projectId: project.id, learnStyle: true, systemStylePreset: "adaptive" }, referencePath);
if (reference.analysis.slideCount > 8) throw new Error(`Golden acceptance is capped at 8 pages; received ${reference.analysis.slideCount}`);
const material = await upload("/api/materials/parse", {
  projectId: project.id, text: await fs.readFile(materialPath, "utf8"), audience: "业务管理层", purpose: "形成可执行判断", pageTarget: 8
});
const selected = material.slidePlans.filter((plan) => plan.layoutSource === "golden_slide" && plan.goldenMatch?.status === "selected");
if (!selected.length) throw new Error("Expected at least one eligible Golden Slide selection");
const controls = { referenceStrength: 80, minimalism: 65, modernity: 65, airiness: 60, visualWeight: 60, technologyTone: 30, visualImpact: 55, locks: { typography: false, colors: false, layout: false } };
await post("/api/deck/generate", { projectId: project.id, direction: "B", storyline: material.storyline, slidePlans: material.slidePlans, finalStyle: reference.styleDna, controls });
const initialQa = await post("/api/qa/run", { projectId: project.id, referenceStrength: 80, repairPass: 0 });
let qa = initialQa;
let repairPasses = 0;
while (repairPasses < 3 && qa.status !== "PASS" && qa.issues.some((issue) => issue.autoFixable)) {
  const repaired = await post("/api/qa/fix", { projectId: project.id });
  repairPasses += 1;
  qa = repaired.report ?? repaired;
  if (repaired.rolledBack) break;
}
const finalPptx = path.join(projectDir, "output", "final.pptx");
const reopenedDir = path.join(projectDir, "render", "reopened-final");
const reopen = await execFileAsync(process.execPath, [path.resolve("adapters/native-pptx/render-reference.mjs"), finalPptx, reopenedDir], { env: process.env, maxBuffer: 10 * 1024 * 1024 });
const reopenReport = JSON.parse(reopen.stdout.trim().split(/\r?\n/).at(-1));
const inspect = await fs.readFile(path.join(reopenedDir, "inspect.ndjson"), "utf8");
const pngs = (await fs.readdir(path.join(projectDir, "render", "final"))).filter((name) => /^slide-\d+\.png$/.test(name));
const checks = {
  sourceSlides: reference.analysis.slideCount,
  outputSlides: material.slidePlans.length,
  selectedGoldenSlides: selected.map((plan) => ({ slide: plan.slideIndex, candidateId: plan.goldenMatch.candidateId, sourceSlide: plan.goldenMatch.sourceSlide, score: plan.goldenMatch.score })),
  goldenLibraryPersisted: Boolean(reference.goldenSlides?.candidates?.length),
  allSlidesRendered: pngs.length === material.slidePlans.length,
  reopenedSlides: reopenReport.slides,
  openable: reopenReport.slides === material.slidePlans.length,
  cjkIntact: /[\u3400-\u9fff]/.test(inspect) && !/[\ufffd]/.test(inspect),
  nativeObjectsPresent: /"(?:kind|type|objectType)"\s*:\s*"(?:text|shape|chart|table)/i.test(inspect),
  qaStatus: qa.status, qaOverall: qa.overall, qaReadability: qa.readability, repairPasses,
  technicalPassed: Object.values(qa.technical).every((item) => item.passed)
};
const passed = checks.goldenLibraryPersisted && checks.selectedGoldenSlides.length > 0 && checks.allSlidesRendered && checks.openable
  && checks.cjkIntact && checks.nativeObjectsPresent && qa.overall >= 85 && qa.readability >= 85 && checks.technicalPassed;
const manifest = {
  status: passed ? "PASS" : "FAIL", projectId: project.id,
  artifacts: { goldenSlides: path.join(projectDir, "analysis", "golden-slides.json"), slidePlans: path.join(projectDir, "slide-plans", "slide-plans.json"), finalPptx, contactSheet: path.join(projectDir, "render", "final", "contact-sheet.webp"), reopenedContactSheet: path.join(reopenedDir, "contact-sheet.webp"), qa: path.join(projectDir, "qa", "qa-report.json") },
  checks, generatedAt: new Date().toISOString()
};
await fs.writeFile(path.join(projectDir, "output", "golden-slide-acceptance.json"), JSON.stringify(manifest, null, 2), "utf8");
console.log(JSON.stringify(manifest, null, 2));
if (!passed) process.exitCode = 1;
