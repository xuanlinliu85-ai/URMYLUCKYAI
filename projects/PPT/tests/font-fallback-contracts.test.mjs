import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const detector = fs.readFileSync(path.join(root, "adapters/visual-qa/font-fallback.ts"), "utf8");
const qa = fs.readFileSync(path.join(root, "adapters/visual-qa/index.ts"), "utf8");
const fixRoute = fs.readFileSync(path.join(root, "app/api/qa/fix/route.ts"), "utf8");
const renderer = fs.readFileSync(path.join(root, "adapters/native-pptx/generate-deck.mjs"), "utf8");
const repairSchema = JSON.parse(fs.readFileSync(path.join(root, "schemas/repair-plan.schema.json"), "utf8"));
const qaSchema = JSON.parse(fs.readFileSync(path.join(root, "schemas/qa-report.schema.json"), "utf8"));

test("font QA combines requested, layout-resolved and inspect evidence", () => {
  assert.match(detector, /font-evidence\.json/);
  assert.match(detector, /layout-resolved/);
  assert.match(detector, /inspect\.ndjson/);
  assert.match(detector, /requested-resolved-mismatch/);
});

test("CJK fallback findings emit object-local repair targets", () => {
  assert.match(detector, /isSafeCjkTypeface/);
  assert.match(detector, /recommendedTypeface/);
  assert.match(qa, /dimension: "fontFallback"/);
  assert.match(qa, /replacementTypeface: finding\.recommendedTypeface/);
});

test("renderer changes only matching font fallback targets", () => {
  assert.match(renderer, /activeFontFallbackRepairs\.find/);
  assert.match(renderer, /typeface: fontFallbackRepair\.replacementTypeface/);
  assert.match(renderer, /requestedTypeface/);
  assert.match(renderer, /appliedTypeface/);
});

test("AutoFix compares the fontFallback technical score", () => {
  assert.match(fixRoute, /qa\.technical\.fontFallback\.score/);
  assert.match(fixRoute, /target\.dimension === "fontFallback"/);
  assert.match(fixRoute, /cumulativeRepairPlan/);
  assert.match(fixRoute, /retainedTargets/);
  assert.ok(repairSchema.properties.targets.items.properties.dimension.enum.includes("fontFallback"));
  assert.ok(qaSchema.properties.technical.required.includes("fontFallback"));
});
