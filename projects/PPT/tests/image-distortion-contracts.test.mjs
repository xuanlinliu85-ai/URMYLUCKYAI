import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const detector = fs.readFileSync(path.join(root, "adapters/visual-qa/image-distortion.ts"), "utf8");
const qa = fs.readFileSync(path.join(root, "adapters/visual-qa/index.ts"), "utf8");
const fix = fs.readFileSync(path.join(root, "app/api/qa/fix/route.ts"), "utf8");
const renderer = fs.readFileSync(path.join(root, "adapters/native-pptx/generate-deck.mjs"), "utf8");
const qaSchema = JSON.parse(fs.readFileSync(path.join(root, "schemas/qa-report.schema.json"), "utf8"));
const repairSchema = JSON.parse(fs.readFileSync(path.join(root, "schemas/repair-plan.schema.json"), "utf8"));

test("image QA combines native metadata with layout and inspect evidence", () => {
  assert.match(detector, /native-image-metadata/);
  assert.match(detector, /slide-.*\.layout\.json/);
  assert.match(detector, /inspect\.ndjson/);
  assert.match(detector, /stretched_aspect_ratio/);
  assert.match(detector, /missing_asset/);
  assert.match(detector, /out_of_bounds/);
});

test("image findings produce object-local repair targets", () => {
  assert.match(qa, /dimension: "imageDistortion"/);
  assert.match(qa, /objectNames: \[finding\.objectName\]/);
  assert.match(qa, /imageFit: finding\.recommendedFit/);
  assert.match(qa, /imagePosition: finding\.recommendedPosition/);
});

test("AutoFix preserves global controls and compares image target score", () => {
  assert.match(fix, /target\.dimension === "imageDistortion"/);
  assert.match(fix, /qa\.technical\.imageDistortion\.score/);
  assert.match(fix, /imageIssues\.length \? imageIssues/);
});

test("native renderer changes only a named image fit crop and position", () => {
  assert.match(renderer, /target\.dimension === "imageDistortion"/);
  assert.match(renderer, /target\.adjustments\.imagePosition/);
  assert.match(renderer, /fit: repair\.fit, crop: repair\.crop/);
  assert.match(renderer, /qa-fixture-image/);
});

test("schemas persist image technical report and repair adjustments", () => {
  assert.ok(qaSchema.properties.technical.properties.imageDistortion);
  assert.ok(qaSchema.properties.technical.required.includes("imageDistortion"));
  assert.ok(repairSchema.properties.targets.items.properties.dimension.enum.includes("imageDistortion"));
  assert.ok(repairSchema.properties.targets.items.properties.adjustments.properties.imagePosition);
});
