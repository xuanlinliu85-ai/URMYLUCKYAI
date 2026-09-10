import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { createRequire } from "node:module";

const root = process.cwd();
const source = fs.readFileSync(path.join(root, "lib/style/style-dna.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
const nativeRequire = createRequire(import.meta.url);
const module = { exports: {} };
const dimensions = ["typography", "color", "layout", "chart", "density", "composition", "storytelling", "visualTone"];
const localRequire = (id) => id === "@/lib/types" ? { STYLE_DIMENSIONS: dimensions } : id === "@/adapters/reference-analyzer" ? {} : nativeRequire(id);
vm.runInNewContext(compiled, { module, exports: module.exports, require: localRequire, structuredClone, console }, { filename: "style-dna.cjs" });
const { createAdaptiveProfessionalStyleDna, createBankInternalStyleDna, interpretPromptStyle, resolveStyleMix } = module.exports;
const plain = (value) => JSON.parse(JSON.stringify(value));

function controls(overrides = {}) {
  return {
    referenceStrength: 60, minimalism: 65, modernity: 70, airiness: 65,
    visualWeight: 60, technologyTone: 25, visualImpact: 55,
    locks: { typography: false, colors: false, layout: false },
    ...overrides
  };
}

test("prompt style interpretation is deterministic and unknown intent stays neutral", () => {
  const first = interpretPromptStyle("克制、留白、金融机构感");
  const second = interpretPromptStyle("克制、留白、金融机构感");
  assert.deepEqual(first, second);
  assert.equal(first.promptInterpretation.neutral, false);
  assert.deepEqual(plain(first.promptInterpretation.matchedIntents), ["minimal", "financial", "airy"]);

  const unknown = interpretPromptStyle("量子海盐风格 xyzzy");
  assert.equal(unknown.promptInterpretation.neutral, true);
  assert.deepEqual(plain(unknown.styleVector), {});
});

test("locked dimensions retain reference ownership and exact dimension DNA", () => {
  const reference = createBankInternalStyleDna();
  const system = createAdaptiveProfessionalStyleDna();
  const result = resolveStyleMix(reference, controls({ locks: { typography: true, colors: false, layout: false } }), {
    systemStyle: system,
    promptText: "现代科技终端 high impact"
  });
  assert.deepEqual(plain(result.finalStyle.typography), plain(reference.typography));
  assert.equal(result.resolvedOwnership.typography.owner, "reference");
  assert.equal(result.resolvedOwnership.typography.locked, true);
  assert.deepEqual(plain(result.weights.typography), { reference: 1, system: 0, prompt: 0 });
});

test("unlocked dimensions respond to source weights while sliders remain compatible", () => {
  const reference = createBankInternalStyleDna();
  const system = createAdaptiveProfessionalStyleDna();
  const baseLocks = Object.fromEntries(dimensions.map((dimension) => [dimension, dimension === "typography"]));
  const referenceRows = Object.fromEntries(dimensions.map((dimension) => [dimension, { reference: 90, system: 10, prompt: 0 }]));
  const promptRows = Object.fromEntries(dimensions.map((dimension) => [dimension, { reference: 5, system: 5, prompt: 90 }]));
  const referenceLed = resolveStyleMix(reference, controls({ advancedMixer: { weights: referenceRows, locks: baseLocks } }), { systemStyle: system, promptText: "现代科技终端" });
  const promptLed = resolveStyleMix(reference, controls({ advancedMixer: { weights: promptRows, locks: baseLocks }, visualImpact: 95 }), { systemStyle: system, promptText: "现代科技终端 high impact" });
  assert.equal(referenceLed.resolvedOwnership.color.owner, "reference");
  assert.equal(promptLed.resolvedOwnership.color.owner, "prompt");
  assert.notDeepEqual(plain(referenceLed.finalStyle.colors), plain(promptLed.finalStyle.colors));
  assert.notEqual(referenceLed.finalStyle.styleVector.visualImpact, promptLed.finalStyle.styleVector.visualImpact);
  assert.deepEqual(plain(promptLed.finalStyle.typography), plain(reference.typography));
});

test("STYLE_MIX schema requires explainable eight-dimension state and final DNA", () => {
  const schema = JSON.parse(fs.readFileSync(path.join(root, "schemas/style-mix.schema.json"), "utf8"));
  for (const key of ["weights", "locks", "resolvedOwnership", "finalStyle"]) assert.ok(schema.required.includes(key));
  const controlsSchema = JSON.parse(fs.readFileSync(path.join(root, "schemas/style-controls.schema.json"), "utf8"));
  assert.deepEqual(controlsSchema.$defs.dimensionLocks.required, dimensions);
  assert.deepEqual(controlsSchema.$defs.dimensionWeights.required, dimensions);
});
