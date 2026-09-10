import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const fixRoute = fs.readFileSync(path.join(root, "app/api/qa/fix/route.ts"), "utf8");
const renderer = fs.readFileSync(path.join(root, "adapters/native-pptx/generate-deck.mjs"), "utf8");
const qa = fs.readFileSync(path.join(root, "adapters/visual-qa/index.ts"), "utf8");

test("typography fidelity issues identify native object families", () => {
  assert.match(qa, /dimension: name as QaIssue/);
  assert.match(qa, /cover-title/);
  assert.match(qa, /\*-value\*/);
  assert.match(qa, /objectNames/);
});

test("typography-only repair preserves global style controls", () => {
  assert.match(fixRoute, /objectLocalOnly \? deckRequest\.controls/);
  assert.match(fixRoute, /adjustments: issue\.adjustments/);
  assert.match(fixRoute, /targetScores\.some\(\(score\) => score\.after <= score\.before\)/);
});

test("native renderer applies bounded font scaling only to targeted object names", () => {
  assert.match(renderer, /activeTypographyRepair\.objectNames\.some/);
  assert.match(renderer, /matchesObjectPattern/);
  assert.match(renderer, /Math\.min\(72, Math\.max\(10/);
  assert.match(renderer, /target\.dimension === "typography"/);
});
