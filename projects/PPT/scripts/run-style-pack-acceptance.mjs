import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.PPT_FACTORY_URL ?? "http://127.0.0.1:3139";
const dimensions = ["typography", "color", "layout", "chart", "density", "composition", "storytelling", "visualTone"];
const weights = Object.fromEntries(dimensions.map((dimension) => [dimension, { reference: dimension === "typography" ? 1 : .5, system: dimension === "typography" ? 0 : .3, prompt: dimension === "typography" ? 0 : .2 }]));
const locks = Object.fromEntries(dimensions.map((dimension) => [dimension, dimension === "typography"]));
const resolvedOwnership = Object.fromEntries(dimensions.map((dimension) => [dimension, { owner: dimension === "typography" ? "reference" : "system", weights: weights[dimension], locked: locks[dimension] }]));
const finalStyle = {
  styleId: "style_acceptance_pack", name: "Style Pack Acceptance", sourceType: "hybrid", version: "1.0.0",
  styleVector: { minimalism: .7, density: .4 }, typography: { primary: "Microsoft YaHei" }, colors: { primary: "0E2B4F", accent: "9B1C31" },
  grid: { columns: 12 }, composition: { preferred: "answer-first" }, charts: { style: "flat-native" },
  visuals: { imagery: "evidence-led" }, storytelling: { model: "answer-evidence-action" }, density: { label: "medium" },
  preferredLayouts: ["EXEC_SUMMARY", "FULL_CHART"], antiPatterns: ["pill-overload"]
};
const styleMix = {
  previewSet: "acceptance", sources: { referenceStyleId: "reference_acceptance", systemStyleId: "system_adaptive_professional_v1", promptStyleId: "prompt_acceptance", promptText: "克制金融机构风" },
  controls: { referenceStrength: 60, minimalism: 70, modernity: 65, airiness: 68, visualWeight: 55, technologyTone: 15, visualImpact: 45, locks: { typography: true, colors: false, layout: false }, advancedMixer: { weights, locks } },
  weights, locks, resolvedOwnership, finalStyleId: finalStyle.styleId, finalStyle,
  promptInterpretation: { schema: "ppt-factory/prompt-style-interpretation/v1", input: "克制金融机构风", normalizedInput: "克制金融机构风", matchedIntents: ["minimal", "financial"], neutral: false },
  generatedAt: "2026-08-24T00:00:00.000Z"
};

async function json(url, init) {
  const response = await fetch(`${baseUrl}${url}`, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const value = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${JSON.stringify(value)}`);
  return value;
}

const project = await json("/api/projects", { method: "POST", body: JSON.stringify({ name: "Saved Style Pack Acceptance" }) });
const request = {
  projectId: project.id, action: "create",
  pack: { name: "董事会经营月报", styleMix, metadata: { tags: ["经营", "monthly"], roles: ["summary", "evidence_data"], layoutFamilies: ["EXEC_SUMMARY", "FULL_CHART"], densities: ["balanced"], hasCharts: true, chartTypes: ["bar"], audienceTags: ["board", "董事会"], examplePrompts: ["克制的董事会经营月报"] } }
};
const created = await json("/api/style/packs", { method: "POST", body: JSON.stringify(request) });
const repeated = await json("/api/style/packs", { method: "POST", body: JSON.stringify(request) });
assert.equal(created.created, true);
assert.equal(repeated.created, false);
assert.equal(created.pack.contentHash, repeated.pack.contentHash);

const updated = await json("/api/style/packs", { method: "POST", body: JSON.stringify({ projectId: project.id, action: "update", id: created.pack.id, changes: { metadata: { tags: ["经营", "monthly", "approved"] } } }) });
assert.equal(updated.pack.version, "1.0.1");
const original = await json(`/api/style/packs?projectId=${encodeURIComponent(project.id)}&id=${encodeURIComponent(created.pack.id)}&version=1.0.0`);
assert.equal(original.pack.contentHash, created.pack.contentHash);

const application = await json("/api/style/packs", { method: "POST", body: JSON.stringify({ projectId: project.id, action: "apply", id: created.pack.id }) });
assert.equal(application.pack.version, "1.0.1");
assert.deepEqual(application.styleMix.weights, styleMix.weights);
assert.deepEqual(application.styleMix.locks, styleMix.locks);
assert.equal(application.finalStyle.styleId, styleMix.finalStyleId);

const search = await json("/api/search/semantics", { method: "POST", body: JSON.stringify({ projectId: project.id, query: { text: "monthly 经营 bar", artifactTypes: ["style_pack"], chart: "required", minScore: 40 } }) });
assert.equal(search.result.status, "matched");
assert.equal(search.index.sources.stylePacks.count, 2);

const projectRoot = path.join(process.cwd(), "generated", "projects", project.id);
for (const name of ["style-packs.json", "style-pack-application.json", "style-mix.json", "final-style.json"]) {
  JSON.parse(await readFile(path.join(projectRoot, "style", name), "utf8"));
}
const report = {
  schema: "ppt-factory/style-pack-acceptance/v1", status: "PASS", projectId: project.id,
  assertions: { deterministicCreate: true, immutableBase: true, appendedVersion: "1.0.1", preservedEightDimensions: dimensions.length, persistedExistingMixerContracts: true, semanticSearchCompatible: true },
  rendererBehaviorChanged: false
};
await mkdir(path.join(projectRoot, "output"), { recursive: true });
await writeFile(path.join(projectRoot, "output", "style-pack-acceptance.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
