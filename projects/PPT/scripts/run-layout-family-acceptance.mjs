import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

function loadSharedDependency(name) {
  let cursor = process.cwd();
  while (true) {
    if (fsSync.existsSync(path.join(cursor, "node_modules", name))) return createRequire(path.join(cursor, "package.json"))(name);
    const parent = path.dirname(cursor);
    if (parent === cursor) throw new Error(`Cannot find shared dependency: ${name}`);
    cursor = parent;
  }
}

const JSZip = loadSharedDependency("jszip");

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const baseUrl = option("base-url", "http://127.0.0.1:3031").replace(/\/$/, "");
const referencePath = path.resolve(option("reference", "generated/showcase/rendered-fidelity-score/fidelity-acceptance.pptx"));

async function json(response) {
  const body = await response.json();
  if (!response.ok) throw new Error(`${response.status} ${response.url}: ${body.error ?? JSON.stringify(body)}`);
  return body;
}

const zip = await JSZip.loadAsync(await fs.readFile(referencePath));
const sourceSlides = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name)).length;
if (sourceSlides < 1 || sourceSlides > 8) throw new Error(`Acceptance reference must contain 1-8 slides, received ${sourceSlides}`);

const project = await json(await fetch(`${baseUrl}/api/projects`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "Layout Family Acceptance" })
}));
const form = new FormData();
form.set("projectId", project.id);
form.set("learnStyle", "true");
form.set("systemStylePreset", "adaptive");
form.set("file", new Blob([await fs.readFile(referencePath)]), path.basename(referencePath));
const result = await json(await fetch(`${baseUrl}/api/reference/analyze`, { method: "POST", body: form }));
const projectDir = path.resolve("generated/projects", project.id);
const renderDir = path.join(projectDir, "render", "reference");
const renderedSlides = (await fs.readdir(renderDir)).filter((name) => /^slide-\d+\.png$/.test(name)).length;
const persistedAnalysis = JSON.parse(await fs.readFile(path.join(projectDir, "analysis", "reference-analysis.json"), "utf8"));
const persistedStyle = JSON.parse(await fs.readFile(path.join(projectDir, "style", "reference-style-dna.json"), "utf8"));
const checks = {
  sourceSlides,
  renderedSlides,
  allSlidesRendered: renderedSlides === sourceSlides,
  familyRecords: result.analysis.layoutFamilies.length,
  familyForEverySlide: result.analysis.layoutFamilies.length === sourceSlides,
  explainable: result.analysis.layoutFamilies.every((item) => item.evidence.length > 0 && item.confidence >= 0 && item.confidence <= 1),
  deterministicPersistence: JSON.stringify(result.analysis.layoutFamilies) === JSON.stringify(persistedAnalysis.layoutFamilies),
  styleDnaPersistence: JSON.stringify(result.analysis.layoutFamilies) === JSON.stringify(persistedStyle.referenceLayoutFamilies),
  summariesPersisted: persistedAnalysis.layoutFamilySummaries.length > 0 && persistedStyle.layoutFamilySummaries.length > 0,
  families: result.analysis.layoutFamilies.map(({ slide, family, confidence }) => ({ slide, family, confidence }))
};
const status = Object.entries(checks).filter(([, value]) => typeof value === "boolean").every(([, value]) => value) ? "PASS" : "FAIL";
const report = {
  status,
  projectId: project.id,
  referencePath,
  contactSheet: path.join(renderDir, "contact-sheet.webp"),
  checks
};
await fs.writeFile(path.join(projectDir, "analysis", "layout-family-acceptance.json"), JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify(report));
if (status !== "PASS") process.exitCode = 1;
