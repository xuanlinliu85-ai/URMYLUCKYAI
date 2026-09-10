import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const renderer = fs.readFileSync(path.join(root, "adapters/native-pptx/generate-deck.mjs"), "utf8");
const planner = fs.readFileSync(path.join(root, "lib/slide-plans.ts"), "utf8");
const analyzer = fs.readFileSync(path.join(root, "lib/content-analysis.ts"), "utf8");

test("business data slides never chart sentence character counts", () => {
  assert.doesNotMatch(renderer, /字符数|材料信息量|character count/i);
  assert.match(renderer, /Native business metrics from Content Analysis JSON/);
  assert.match(planner, /business_metric_spread/);
});

test("Chinese business metrics preserve whitespace-separated units", () => {
  assert.match(analyzer, /\\s\*\(\?:个百分点\|万元\|亿元\|小时\|分钟/);
  assert.match(analyzer, /const value = `\$\{numericValue\}\$\{unit\}`/);
});

test("direction B uses a light content canvas and a deliberate dark cover", () => {
  assert.match(renderer, /B: \{ bg: "#F2F5F7"/);
  assert.match(renderer, /slide\.background\.fill = t\.dark/);
  assert.match(renderer, /cover-side-field/);
});

test("full decks expose multiple native composition families", () => {
  for (const marker of ["answer_first_summary", "business_metric_spread", "native_timeline", "decision_gate", "action_summary"]) {
    assert.match(planner, new RegExp(marker));
  }
  for (const rendererMarker of ["addSummary", "addDataSlide", "addTimeline", "addDecisionGates", "addConclusion"]) {
    assert.match(renderer, new RegExp(rendererMarker));
  }
});
