import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { inferReferenceLayoutFamily, summarizeReferenceLayoutFamilies } from "../adapters/reference-analyzer/layout-family.ts";

function role(roleName = "other", overrides = {}) {
  return {
    slide: 2,
    role: roleName,
    confidence: roleName === "other" ? 0.45 : 0.84,
    evidence: [`fixture:${roleName}`],
    signals: {
      title: "经营情况",
      textCharacters: 80,
      textBlocks: 4,
      numericTokens: 0,
      shapeCount: 3,
      chartCount: 0,
      imageCount: 0,
      tableCount: 0,
      connectorCount: 0,
      renderedPage: null,
      ...overrides
    }
  };
}

const box = (type, x, y, width, height) => ({ type, x, y, width, height });

test("maps merged semantic roles to narrative layout families", () => {
  const cases = [
    ["cover", "COVER"],
    ["agenda_section", "SECTION"],
    ["summary", "EXEC_SUMMARY"],
    ["comparison", "COMPARISON"],
    ["process_timeline", "PROCESS_TIMELINE"]
  ];
  for (const [roleName, expected] of cases) {
    const result = inferReferenceLayoutFamily({ slide: 2, roleInference: role(roleName), objects: [] });
    assert.equal(result.family, expected);
    assert.ok(result.evidence.includes(`role:${roleName}`));
  }
});

test("classifies Chinese business chart/table and left-right compositions", () => {
  const chartLeft = inferReferenceLayoutFamily({
    slide: 3,
    roleInference: role("evidence_data", { chartCount: 1, numericTokens: 4 }),
    objects: [box("chart", 0.06, 0.2, 0.42, 0.62), box("text", 0.58, 0.22, 0.34, 0.48)]
  });
  assert.equal(chartLeft.family, "DATA_LEFT_TEXT_RIGHT");

  const chartRight = inferReferenceLayoutFamily({
    slide: 4,
    roleInference: role("evidence_data", { chartCount: 1, numericTokens: 3 }),
    objects: [box("text", 0.06, 0.2, 0.34, 0.52), box("chart", 0.54, 0.18, 0.4, 0.65)]
  });
  assert.equal(chartRight.family, "TEXT_LEFT_DATA_RIGHT");

  const fullTable = inferReferenceLayoutFamily({
    slide: 5,
    roleInference: role("evidence_data", { tableCount: 1, numericTokens: 8 }),
    objects: [box("table", 0.05, 0.18, 0.9, 0.68)]
  });
  assert.equal(fullTable.family, "FULL_TABLE");
});

test("classifies full chart, hero image, big number and balanced columns", () => {
  assert.equal(inferReferenceLayoutFamily({
    slide: 2, roleInference: role("evidence_data", { chartCount: 1 }), objects: [box("chart", 0.08, 0.18, 0.84, 0.68)]
  }).family, "FULL_CHART");
  assert.equal(inferReferenceLayoutFamily({
    slide: 2, roleInference: role(), objects: [box("image", 0.02, 0.05, 0.64, 0.9), box("text", 0.7, 0.2, 0.24, 0.4)]
  }).family, "HERO_IMAGE");
  assert.equal(inferReferenceLayoutFamily({
    slide: 2, roleInference: role("evidence_data", { numericTokens: 3, textBlocks: 3, textCharacters: 42 }), objects: [box("text", 0.2, 0.25, 0.6, 0.4)]
  }).family, "BIG_NUMBER");
  assert.equal(inferReferenceLayoutFamily({
    slide: 2, roleInference: role(), objects: [box("text", 0.06, 0.2, 0.38, 0.55), box("text", 0.56, 0.2, 0.38, 0.55)]
  }).family, "TWO_COLUMN");
});

test("ambiguous classification is honest, deterministic and aggregation is stable", () => {
  const input = { slide: 7, roleInference: role(), objects: [box("text", 0.1, 0.2, 0.3, 0.1)] };
  const first = inferReferenceLayoutFamily(input);
  const second = inferReferenceLayoutFamily(structuredClone(input));
  assert.deepEqual(first, second);
  assert.equal(first.family, "OTHER");
  assert.ok(first.confidence <= 0.5);
  const summaries = summarizeReferenceLayoutFamilies([first, { ...first, slide: 8 }, inferReferenceLayoutFamily({ slide: 1, roleInference: role("cover"), objects: [] })]);
  assert.deepEqual(summaries.map(({ family, count }) => [family, count]), [["COVER", 1], ["OTHER", 2]]);
  assert.equal(summaries.reduce((sum, item) => sum + item.share, 0), 1);
});

test("reference contracts persist layout-family artifacts with backward-compatible Style DNA consumption", () => {
  const root = process.cwd();
  const analysisSchema = JSON.parse(fs.readFileSync(path.join(root, "schemas", "reference-analysis.schema.json"), "utf8"));
  const styleSchema = JSON.parse(fs.readFileSync(path.join(root, "schemas", "style-dna.schema.json"), "utf8"));
  const styleDna = fs.readFileSync(path.join(root, "lib", "style", "style-dna.ts"), "utf8");
  assert.ok(analysisSchema.properties.layoutFamilies);
  assert.ok(analysisSchema.properties.layoutFamilySummaries);
  assert.ok(!analysisSchema.required.includes("layoutFamilies"));
  assert.ok(styleSchema.properties.referenceLayoutFamilies);
  assert.ok(styleSchema.properties.layoutFamilySummaries);
  assert.match(styleDna, /referenceLayoutFamilies: analysis\.layoutFamilies \?\? \[\]/);
  assert.match(styleDna, /layoutFamilySummaries: analysis\.layoutFamilySummaries \?\? \[\]/);
});
