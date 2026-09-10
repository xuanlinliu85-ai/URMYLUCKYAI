import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const fidelity = fs.readFileSync(path.join(root, "adapters/visual-qa/fidelity.ts"), "utf8");
const qa = fs.readFileSync(path.join(root, "adapters/visual-qa/index.ts"), "utf8");
const route = fs.readFileSync(path.join(root, "app/api/qa/run/route.ts"), "utf8");
const schema = JSON.parse(fs.readFileSync(path.join(root, "schemas/qa-report.schema.json"), "utf8"));

test("reference fidelity uses the documented semantic weights", () => {
  for (const [name, weight] of Object.entries({ typography: 20, color: 15, layout: 20, chartStyle: 15, density: 10, composition: 10, storytelling: 5, visualTone: 5 })) {
    assert.match(fidelity, new RegExp(`${name}: ${weight}`));
  }
  assert.match(fidelity, /measureReferenceFidelity/);
  assert.match(fidelity, /toFixed\(1\)/);
  assert.match(fidelity, /referenceSlides/);
  assert.match(fidelity, /outputSlides/);
  assert.match(fidelity, /collectTextRuns/);
  assert.match(fidelity, /Array\.isArray\(record\.runs\)/);
  assert.match(fidelity, /runWeight = clamp\(run\.fontSize \/ 16, 1, 4\)/);
});

test("QA measures rendered evidence instead of mapping requested strength to a score", () => {
  assert.match(qa, /measureReferenceFidelity/);
  assert.doesNotMatch(qa, /referenceStrength >= 81 \? 90/);
  assert.match(route, /render", "reference/);
});

test("locked fidelity dimensions target at least 95 and failed dimensions become local issues", () => {
  assert.match(fidelity, /Math\.max\(97, baseTarget\)/);
  assert.match(fidelity, /referenceMean \/ outputMean/);
  assert.match(fidelity, /\* 4/);
  assert.match(qa, /fidelity-\$\{name\}/);
  assert.match(qa, /filter\(\(\[, dimension\]\) => !dimension\.passed\)/);
  assert.match(qa, /fidelity\.target === 0 \|\| fidelity\.passed/);
});

test("QA schema persists measured fidelity evidence", () => {
  assert.ok(schema.properties.fidelity);
  assert.ok(schema.required.includes("fidelity"));
  assert.ok(schema.properties.fidelity.required.includes("dimensions"));
});
