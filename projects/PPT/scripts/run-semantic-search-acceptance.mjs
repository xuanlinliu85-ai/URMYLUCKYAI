import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { buildSemanticSearchIndex, searchSemanticIndex } from "../lib/semantic-search.ts";

const projectId = "semantic_search_acceptance";
const root = path.join(process.cwd(), "generated", "projects", projectId);
const analysisDir = path.join(root, "analysis");
const styleDir = path.join(root, "style");
await fs.mkdir(analysisDir, { recursive: true });
await fs.mkdir(styleDir, { recursive: true });

const goldenSlides = {
  schema: "ppt-factory/golden-slides/v1", referenceStyleId: "style_acceptance", sourceFile: "bounded-8-slide-reference.pptx",
  usage: { mode: "learn-style", retrievalEligible: true }, thresholds: { candidate: 68, retrieval: 72 },
  candidates: [
    { id: "g_summary", sourceSlide: 2, role: "summary", layoutFamily: "EXEC_SUMMARY", density: "balanced", hasChart: false, score: 90, candidateThreshold: 68, eligible: true, dimensionScores: { layoutQuality: 90, clarity: 92, reusability: 91, styleRepresentativeness: 89, hierarchy: 90, balance: 88 }, evidence: ["经营摘要", "monthly operations"] },
    { id: "g_chart", sourceSlide: 4, role: "evidence_data", layoutFamily: "FULL_CHART", density: "balanced", hasChart: true, score: 94, candidateThreshold: 68, eligible: true, dimensionScores: { layoutQuality: 95, clarity: 94, reusability: 92, styleRepresentativeness: 93, hierarchy: 94, balance: 91 }, evidence: ["经营数据", "monthly operations", "chart:yes"] }
  ]
};
const stylePacks = {
  schema: "ppt-factory/style-pack-search-library/v1",
  packs: [{ id: "operating-review", version: "1.0.0", name: "经营分析月报", styleId: "style_operating", tags: ["经营", "月报", "monthly", "operations"], roles: ["summary", "evidence_data"], layoutFamilies: ["EXEC_SUMMARY", "FULL_CHART"], densities: ["balanced"], hasCharts: true, chartTypes: ["bar"], audienceTags: ["management", "管理层"], active: true }]
};
await fs.writeFile(path.join(analysisDir, "golden-slides.json"), JSON.stringify(goldenSlides, null, 2), "utf8");
await fs.writeFile(path.join(styleDir, "style-packs.json"), JSON.stringify(stylePacks, null, 2), "utf8");

const persistedGolden = JSON.parse(await fs.readFile(path.join(analysisDir, "golden-slides.json"), "utf8"));
const persistedPacks = JSON.parse(await fs.readFile(path.join(styleDir, "style-packs.json"), "utf8"));
const index = buildSemanticSearchIndex({ projectId, goldenSlides: persistedGolden, stylePacks: persistedPacks });
const query = { text: "经营 monthly operations", roles: ["evidence_data"], layoutFamilies: ["FULL_CHART"], densities: ["balanced"], chart: "required", audienceTags: ["management"], minScore: 55, limit: 8 };
const result = searchSemanticIndex(index, query);
const repeat = searchSemanticIndex(structuredClone(index), structuredClone(query));
assert.deepEqual(result, repeat);
assert.equal(result.status, "matched");
assert.equal(result.matches[0].id, "style-pack:operating-review@1.0.0");
assert.ok(result.matches.some((match) => match.id === "golden:g_chart"));
assert.ok(result.matches.every((match) => match.source.sourceSlide === undefined || match.source.sourceSlide <= 8));
await fs.writeFile(path.join(analysisDir, "semantic-search-index.json"), JSON.stringify(index, null, 2), "utf8");
await fs.writeFile(path.join(analysisDir, "semantic-search-result.json"), JSON.stringify(result, null, 2), "utf8");

console.log(JSON.stringify({ status: "PASS", projectId, documents: index.documents.length, matches: result.matches.map((item) => ({ id: item.id, score: item.score })), deterministic: true, compatibilityBoundary: "covered-by-unit-test", pptRegeneration: "not-required-metadata-only" }, null, 2));
