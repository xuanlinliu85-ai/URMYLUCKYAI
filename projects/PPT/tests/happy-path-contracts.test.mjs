import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

test("V1 Happy Path persists the missing intermediate contracts", () => {
  for (const name of ["content-analysis", "style-mix", "repair-plan", "acceptance-manifest"]) {
    assert.ok(fs.existsSync(path.join(root, "schemas", `${name}.schema.json`)), `${name} schema should exist`);
  }
  const materialRoute = fs.readFileSync(path.join(root, "app/api/materials/parse/route.ts"), "utf8");
  assert.match(materialRoute, /content-analysis/);
  assert.match(materialRoute, /slidePlans/);
});

test("preview evidence is separated by set and the renderer consumes Slide Plans", () => {
  const previewRoute = fs.readFileSync(path.join(root, "app/api/style/preview/route.ts"), "utf8");
  const renderer = fs.readFileSync(path.join(root, "adapters/native-pptx/generate-deck.mjs"), "utf8");
  assert.match(previewRoute, /previewSet/);
  assert.match(previewRoute, /style-mix-/);
  assert.match(renderer, /request\.slidePlans/);
  assert.match(renderer, /cover-side-field/);
  assert.match(renderer, /editorial-field/);
  assert.match(renderer, /cover-rule/);
});

test("AutoFix persists a bounded Repair Plan with rollback state", () => {
  const fixRoute = fs.readFileSync(path.join(root, "app/api/qa/fix/route.ts"), "utf8");
  assert.match(fixRoute, /repair-plan-pass-/);
  assert.match(fixRoute, /rolled_back/);
  assert.match(fixRoute, />= 3/);
});

test("material parsing strips Markdown chrome and preserves decimal business metrics", () => {
  const parser = fs.readFileSync(path.join(root, "lib/material-text.ts"), "utf8");
  assert.match(parser, /#{1,6}/);
  assert.match(parser, /\(\?<!\\d\)\\\.\(\?!\\d\)/);
});

test("storyline distribution uses balanced boundaries instead of empty tail chunks", () => {
  const storyline = fs.readFileSync(path.join(root, "lib/storyline.ts"), "utf8");
  assert.match(storyline, /Math\.floor\(index \* bodySource\.length \/ bodyCount\)/);
  assert.doesNotMatch(storyline, /展开第/);
});

test("visual QA consumes the current layout bbox contract", () => {
  const qa = fs.readFileSync(path.join(root, "adapters/visual-qa/index.ts"), "utf8");
  assert.match(qa, /record\.bbox/);
  assert.match(qa, /bbox\?\.\[0\]/);
});
