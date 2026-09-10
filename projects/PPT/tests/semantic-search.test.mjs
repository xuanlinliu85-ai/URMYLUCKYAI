import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { buildSemanticSearchIndex, searchSemanticIndex } from "../lib/semantic-search.ts";

function golden(mode = "learn-style") {
  return {
    schema: "ppt-factory/golden-slides/v1", referenceStyleId: "style_bank", sourceFile: "reference.pptx",
    usage: { mode, retrievalEligible: mode === "learn-style" }, thresholds: { candidate: 68, retrieval: 72 },
    candidates: [
      { id: "golden_data", sourceSlide: 3, role: "evidence_data", layoutFamily: "FULL_CHART", density: "balanced", hasChart: true, score: 92, candidateThreshold: 68, eligible: mode === "learn-style", dimensionScores: { layoutQuality: 95, clarity: 92, reusability: 90, styleRepresentativeness: 91, hierarchy: 94, balance: 88 }, evidence: ["monthly operations", "chart:yes"] },
      { id: "golden_cover", sourceSlide: 1, role: "cover", layoutFamily: "COVER", density: "sparse", hasChart: false, score: 86, candidateThreshold: 68, eligible: mode === "learn-style", dimensionScores: { layoutQuality: 90, clarity: 88, reusability: 84, styleRepresentativeness: 87, hierarchy: 90, balance: 83 }, evidence: ["institutional cover", "chart:no"] },
      { id: "not_eligible", sourceSlide: 8, role: "other", layoutFamily: "OTHER", density: "dense", hasChart: false, score: 40, candidateThreshold: 68, eligible: false, dimensionScores: { layoutQuality: 40, clarity: 40, reusability: 40, styleRepresentativeness: 40, hierarchy: 40, balance: 40 }, evidence: ["weak"] }
    ]
  };
}

const packs = {
  schema: "ppt-factory/style-pack-search-library/v1",
  packs: [
    { id: "pack_board", version: "1.2.0", name: "董事会经营月报", styleId: "style_board", tags: ["monthly", "operations", "月报", "经营"], roles: ["summary", "evidence_data"], layoutFamilies: ["EXEC_SUMMARY", "FULL_CHART"], densities: ["balanced"], hasCharts: true, chartTypes: ["bar"], audienceTags: ["board", "董事会"], active: true },
    { id: "pack_archived", version: "0.9.0", name: "旧版", styleId: "style_old", tags: ["legacy"], roles: ["cover"], layoutFamilies: ["COVER"], densities: ["sparse"], hasCharts: false, chartTypes: [], audienceTags: [], active: false }
  ]
};

test("index is deterministic and projects only eligible local artifacts", () => {
  const first = buildSemanticSearchIndex({ projectId: "project_search", goldenSlides: golden(), stylePacks: packs });
  const second = buildSemanticSearchIndex({ projectId: "project_search", goldenSlides: structuredClone(golden()), stylePacks: structuredClone(packs) });
  assert.deepEqual(first, second);
  assert.equal(first.documents.length, 3);
  assert.ok(!first.documents.some((item) => item.id.includes("not_eligible") || item.id.includes("archived")));
  assert.deepEqual(first.documents.map((item) => item.id), [...first.documents.map((item) => item.id)].sort());
});
test("structured metadata produces explainable stable ranking", () => {
  const index = buildSemanticSearchIndex({ projectId: "project_search", goldenSlides: golden(), stylePacks: packs });
  const query = { text: "monthly operations chart", roles: ["evidence_data"], layoutFamilies: ["FULL_CHART"], densities: ["balanced"], chart: "required", audienceTags: ["board"], limit: 5, minScore: 50 };
  const result = searchSemanticIndex(index, query);
  assert.equal(result.status, "matched");
  assert.equal(result.matches[0].id, "style-pack:pack_board@1.2.0");
  assert.ok(result.matches.some((item) => item.id === "golden:golden_data"));
  assert.ok(result.matches.every((item) => item.evidence.length === 8));
  assert.deepEqual(result, searchSemanticIndex(index, structuredClone(query)));
});

test("compatibility-only references never enter the search index", () => {
  const index = buildSemanticSearchIndex({ projectId: "project_compat", goldenSlides: golden("compatibility-only") });
  assert.equal(index.sources.goldenSlides.available, true);
  assert.equal(index.sources.goldenSlides.searchable, false);
  assert.equal(index.sources.goldenSlides.count, 0);
  assert.equal(index.documents.length, 0);
  const result = searchSemanticIndex(index, { text: "cover", minScore: 1 });
  assert.equal(result.status, "fallback");
  assert.equal(result.fallback, "no_candidate_above_threshold");
});

test("threshold, filters and result bounds are enforced", () => {
  const index = buildSemanticSearchIndex({ projectId: "project_search", goldenSlides: golden(), stylePacks: packs });
  const onlyGolden = searchSemanticIndex(index, { artifactTypes: ["golden_slide"], chart: "excluded", limit: 99, minScore: 0 });
  assert.ok(onlyGolden.matches.length <= 20);
  assert.ok(onlyGolden.matches.every((item) => item.artifactType === "golden_slide"));
  assert.equal(onlyGolden.query.limit, 20);
  const none = searchSemanticIndex(index, { text: "不存在的语义", minScore: 100 });
  assert.equal(none.status, "fallback");
});

test("schemas and API make JSON persistence explicit", () => {
  const root = process.cwd();
  const searchSchema = JSON.parse(fs.readFileSync(path.join(root, "schemas/semantic-search.schema.json"), "utf8"));
  const packSchema = JSON.parse(fs.readFileSync(path.join(root, "schemas/style-pack-search-library.schema.json"), "utf8"));
  assert.equal(searchSchema.oneOf[0].properties.schema.const, "ppt-factory/semantic-search-index/v1");
  assert.equal(packSchema.properties.schema.const, "ppt-factory/style-pack-search-library/v1");
  const route = fs.readFileSync(path.join(root, "app/api/search/semantics/route.ts"), "utf8");
  assert.match(route, /readJson<T>/);
  assert.match(route, /writeJson\(projectId, "analysis", "semantic-search-index"/);
  assert.match(route, /writeJson\(projectId, "analysis", "semantic-search-result"/);
});
