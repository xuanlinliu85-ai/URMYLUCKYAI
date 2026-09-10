import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const contrast = fs.readFileSync(path.join(root, "adapters/visual-qa/contrast.ts"), "utf8");
const qa = fs.readFileSync(path.join(root, "adapters/visual-qa/index.ts"), "utf8");
const fixRoute = fs.readFileSync(path.join(root, "app/api/qa/fix/route.ts"), "utf8");
const renderer = fs.readFileSync(path.join(root, "adapters/native-pptx/generate-deck.mjs"), "utf8");
const repairSchema = JSON.parse(fs.readFileSync(path.join(root, "schemas/repair-plan.schema.json"), "utf8"));

test("contrast QA combines native text color with rendered pixel evidence", () => {
  assert.match(contrast, /rendered-pixel-sample/);
  assert.match(contrast, /sharp\(pngPath\).*raw\(\)/s);
  assert.match(contrast, /contrastRatio\(foreground, background\)/);
  assert.match(qa, /measureRenderedContrast/);
});

test("contrast findings identify a slide, object and bounded foreground repair", () => {
  assert.match(qa, /dimension: "contrast"/);
  assert.match(qa, /objectNames: \[finding\.objectName\]/);
  assert.match(qa, /foregroundColor: finding\.recommendedForeground/);
  assert.match(contrast, /for \(let step = 1; step <= 20; step \+= 1\)/);
});

test("AutoFix prioritizes contrast issues and compares the technical target score", () => {
  assert.match(fixRoute, /contrastIssues\.length \? contrastIssues/);
  assert.match(fixRoute, /dimension === "contrast"/);
  assert.match(fixRoute, /qa\.technical\.contrast\.score/);
  assert.match(fixRoute, /objectLocalOnly/);
});

test("native renderer changes only matching contrast target objects", () => {
  assert.match(renderer, /repair\.slide === activeSlideNumber/);
  assert.match(renderer, /repair\.objectNames\.some/);
  assert.match(renderer, /color: contrastRepair\.foregroundColor/);
  assert.ok(repairSchema.properties.targets.items.properties.dimension.enum.includes("contrast"));
});

