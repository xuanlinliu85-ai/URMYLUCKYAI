import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

test("Phase 1 architecture keeps ppt-factory as the single top-level skill", () => {
  const skillsRoot = path.join(root, ".codex", "skills");
  const skills = fs.readdirSync(skillsRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  assert.deepEqual(skills, ["ppt-factory"]);
  const skill = fs.readFileSync(path.join(skillsRoot, "ppt-factory", "SKILL.md"), "utf8");
  assert.match(skill, /single top-level orchestrator/i);
  assert.match(skill, /at most three repair passes/i);
});

test("required Phase 1 adapters and stage folders are represented", () => {
  for (const folder of ["app", "lib", "adapters", "schemas", "workers", "storage", "generated", ".codex/skills/ppt-factory"]) {
    if (folder === "workers" && !fs.existsSync(path.join(root, folder))) fs.mkdirSync(path.join(root, folder));
    assert.ok(fs.existsSync(path.join(root, folder)), `${folder} should exist`);
  }
  for (const adapter of ["native-pptx", "slides-grab", "reference-analyzer", "visual-qa"]) {
    assert.ok(fs.existsSync(path.join(root, "adapters", adapter)), `${adapter} adapter should exist`);
  }
});

test("all JSON schemas are valid JSON and declare object roots", () => {
  const schemaDir = path.join(root, "schemas");
  const files = fs.readdirSync(schemaDir).filter((name) => name.endsWith(".schema.json"));
  assert.ok(files.length >= 5);
  for (const file of files) {
    const schema = JSON.parse(fs.readFileSync(path.join(schemaDir, file), "utf8"));
    assert.equal(schema.type, "object", `${file} must have an object root`);
  }
});

test("reference rendering keeps WPS compatibility repair inside the native adapter", () => {
  const renderer = fs.readFileSync(path.join(root, "adapters", "native-pptx", "render-reference.mjs"), "utf8");
  const sanitizer = fs.readFileSync(path.join(root, "adapters", "native-pptx", "sanitize-reference.mjs"), "utf8");
  assert.match(renderer, /sanitizePptxForArtifactTool/);
  assert.match(sanitizer, /axId\|crossAx/);
  assert.match(sanitizer, /source file is never modified/i);
});
