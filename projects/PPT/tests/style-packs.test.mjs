import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { createRequire } from "node:module";
import { buildSemanticSearchIndex, searchSemanticIndex } from "../lib/semantic-search.ts";

const root = process.cwd();
const source = fs.readFileSync(path.join(root, "lib/style-packs.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
const nativeRequire = createRequire(import.meta.url);
const dimensions = ["typography", "color", "layout", "chart", "density", "composition", "storytelling", "visualTone"];
const module = { exports: {} };
const localRequire = (id) => ["@/lib/types", "./types.ts"].includes(id) ? { STYLE_DIMENSIONS: dimensions } : nativeRequire(id);
vm.runInNewContext(compiled, { module, exports: module.exports, require: localRequire, structuredClone }, { filename: "style-packs.cjs" });
const { applyStylePack, createStylePack, getStylePack, listStylePacks, updateStylePack } = module.exports;
const plain = (value) => JSON.parse(JSON.stringify(value));

function mix(overrides = {}) {
  const weights = Object.fromEntries(dimensions.map((dimension) => [dimension, { reference: dimension === "typography" ? 1 : 0.4, system: dimension === "typography" ? 0 : 0.3, prompt: dimension === "typography" ? 0 : 0.3 }]));
  const locks = Object.fromEntries(dimensions.map((dimension) => [dimension, dimension === "typography"]));
  const resolvedOwnership = Object.fromEntries(dimensions.map((dimension) => [dimension, { owner: dimension === "typography" ? "reference" : "system", weights: weights[dimension], locked: locks[dimension] }]));
  const finalStyle = {
    styleId: "style_mixed_001", name: "Institutional Mix", sourceType: "hybrid", version: "1.0.0",
    styleVector: { minimalism: 0.7 }, typography: { primary: "Microsoft YaHei" },
    colors: { primary: "0E2B4F" }, grid: { columns: 12 }, composition: { preferred: "answer-first" },
    charts: { style: "flat-native" }, visuals: { imagery: "evidence-led" },
    storytelling: { model: "answer-evidence-action" }, density: { label: "medium" },
    preferredLayouts: ["EXEC_SUMMARY", "FULL_CHART"], antiPatterns: ["pill-overload"]
  };
  return {
    previewSet: "pack-source", sources: { referenceStyleId: "reference_1", systemStyleId: "system_1", promptStyleId: "prompt_1", promptText: "克制金融机构风" },
    controls: { referenceStrength: 60, minimalism: 70, modernity: 65, airiness: 68, visualWeight: 55, technologyTone: 15, visualImpact: 45, locks: { typography: true, colors: false, layout: false }, advancedMixer: { weights, locks } },
    weights, locks, resolvedOwnership, finalStyleId: finalStyle.styleId, finalStyle,
    promptInterpretation: { schema: "ppt-factory/prompt-style-interpretation/v1", input: "克制金融机构风", normalizedInput: "克制金融机构风", matchedIntents: ["minimal", "financial"], neutral: false },
    generatedAt: "2026-08-24T00:00:00.000Z", ...overrides
  };
}

const input = () => ({
  name: "董事会经营月报", styleMix: mix(),
  metadata: { tags: ["经营", "monthly", "经营"], roles: ["summary", "evidence_data"], layoutFamilies: ["EXEC_SUMMARY", "FULL_CHART"], densities: ["balanced"], hasCharts: true, chartTypes: ["bar"], audienceTags: ["董事会", "board"], examplePrompts: ["克制的董事会经营月报"] }
});

test("create is deterministic, sorted and idempotent", () => {
  const first = createStylePack(undefined, input());
  const second = createStylePack(first.library, input());
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.deepEqual(plain(first.pack), plain(second.pack));
  assert.match(first.pack.contentHash, /^[a-f0-9]{64}$/);
  assert.deepEqual(plain(first.pack.tags), ["monthly", "经营"]);
  assert.equal(first.pack.previews.cover, "render/previews/pack-source/B/slide-001.png");
  assert.deepEqual(plain(first.pack.provenance.locks), plain(mix().locks));
  assert.deepEqual(plain(first.pack.provenance.resolvedOwnership), plain(mix().resolvedOwnership));
});

test("immutable version conflicts fail and update appends without changing the base", () => {
  const first = createStylePack(undefined, input());
  assert.throws(() => createStylePack(first.library, { ...input(), metadata: { ...input().metadata, tags: ["different"] } }), /already exists/);
  const baseSnapshot = JSON.stringify(first.pack);
  const updated = updateStylePack(first.library, { id: first.pack.id, metadata: { tags: ["经营", "approved"] } });
  assert.equal(updated.pack.version, "1.0.1");
  assert.equal(updated.library.packs.length, 2);
  assert.equal(JSON.stringify(getStylePack(updated.library, first.pack.id, "1.0.0")), baseSnapshot);
  assert.equal(getStylePack(updated.library, first.pack.id).version, "1.0.1");
  assert.deepEqual(plain(listStylePacks(updated.library).map((item) => item.version)), ["1.0.1", "1.0.0"]);
});

test("apply restores the existing Style Mix and final Style DNA contracts exactly", () => {
  const saved = createStylePack(undefined, input());
  const application = applyStylePack(saved.library, saved.pack.id);
  assert.equal(application.schema, "ppt-factory/style-pack-application/v1");
  assert.deepEqual(plain(application.styleMix), plain(mix()));
  assert.deepEqual(plain(application.finalStyle), plain(mix().finalStyle));
  for (const dimension of dimensions) {
    assert.deepEqual(plain(application.styleMix.weights[dimension]), plain(mix().weights[dimension]));
    assert.equal(application.styleMix.locks[dimension], mix().locks[dimension]);
  }
  const tampered = structuredClone(saved.library);
  tampered.packs[0].style.colors.primary = "FFFFFF";
  assert.throws(() => applyStylePack(tampered, saved.pack.id), /has been modified/);
});

test("saved Style Pack library is directly searchable through the existing contract", () => {
  const saved = createStylePack(undefined, input());
  const index = buildSemanticSearchIndex({ projectId: "project_style_pack", stylePacks: saved.library });
  const result = searchSemanticIndex(index, { text: "monthly 经营 bar", artifactTypes: ["style_pack"], roles: ["evidence_data"], chart: "required", minScore: 50 });
  assert.equal(index.sources.stylePacks.count, 1);
  assert.equal(result.status, "matched");
  assert.equal(result.matches[0].source.stylePackId, saved.pack.id);
  assert.equal(result.matches[0].source.version, "1.0.0");
});

test("schemas and API expose versioned local save/apply persistence", () => {
  const packSchema = JSON.parse(fs.readFileSync(path.join(root, "schemas/style-pack.schema.json"), "utf8"));
  const librarySchema = JSON.parse(fs.readFileSync(path.join(root, "schemas/style-pack-search-library.schema.json"), "utf8"));
  assert.equal(packSchema.$defs.stylePackVersion.properties.schema.const, "ppt-factory/style-pack/v1");
  assert.equal(librarySchema.properties.packs.items.$ref, "style-pack.schema.json#/$defs/stylePackVersion");
  const route = fs.readFileSync(path.join(root, "app/api/style/packs/route.ts"), "utf8");
  assert.match(route, /writeJson\(projectId, "style", "style-packs"/);
  assert.match(route, /writeJson\(projectId, "style", "final-style"/);
  assert.match(route, /writeJson\(projectId, "style", "style-mix"/);
  assert.match(route, /writeJson\(projectId, "style", "style-pack-application"/);
});
