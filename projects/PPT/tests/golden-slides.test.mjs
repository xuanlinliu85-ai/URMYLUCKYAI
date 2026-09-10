import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { buildGoldenSlideLibrary, retrieveGoldenSlide } from "../lib/golden-slides.ts";

const typography = (title = 32, body = 18) => ({
  title: { count: 1, fontSizePt: { count: 1, min: title, max: title, mean: title, median: title, p25: title, p75: title }, families: [], cjkRuns: 1 },
  body: { count: 2, fontSizePt: { count: 2, min: body, max: body, mean: body, median: body, p25: body, p75: body }, families: [], cjkRuns: 2 },
  caption: { count: 0, fontSizePt: { count: 0, min: 0, max: 0, mean: 0, median: 0, p25: 0, p75: 0 }, families: [], cjkRuns: 0 },
  kpi: { count: 0, fontSizePt: { count: 0, min: 0, max: 0, mean: 0, median: 0, p25: 0, p75: 0 }, families: [], cjkRuns: 0 }, cjkRuns: 3
});

function fixture() {
  const roles = [
    { slide: 1, role: "cover", confidence: .9 },
    { slide: 2, role: "summary", confidence: .86 },
    { slide: 3, role: "evidence_data", confidence: .91 }
  ].map((item) => ({ ...item, evidence: [`fixture:${item.role}`], signals: { title: "标题", textCharacters: 80, textBlocks: 3, numericTokens: item.slide === 3 ? 4 : 0, shapeCount: 4, chartCount: item.slide === 3 ? 1 : 0, imageCount: 0, tableCount: 0, connectorCount: 0, renderedPage: null } }));
  const families = [
    { slide: 1, family: "COVER", confidence: .9 },
    { slide: 2, family: "EXEC_SUMMARY", confidence: .86 },
    { slide: 3, family: "FULL_CHART", confidence: .92 }
  ].map((item) => ({ ...item, evidence: [`fixture:${item.family}`], signals: { role: roles[item.slide - 1].role, objectCounts: { text: 3, chart: item.slide === 3 ? 1 : 0, table: 0, image: 0, shape: 1 }, leftOccupancy: .3, rightOccupancy: .32, largestChartArea: item.slide === 3 ? .6 : 0, largestTableArea: 0, largestImageArea: 0, renderedPage: null } }));
  const slides = [1, 2, 3].map((slide) => ({
    slide, typography: typography(), density: { informationScore: .45, visualScore: .48, label: slide === 1 ? "sparse" : "balanced", textCharacters: 80, objectCount: 4, imageCount: 0, chartCount: slide === 3 ? 1 : 0 },
    whitespace: { occupiedAreaRatio: .52, whitespaceRatio: .48, method: "ooxml-bounded-union" },
    charts: { count: slide === 3 ? 1 : 0, treatments: [] }
  }));
  return {
    analysis: { filename: "fixture.pptx", slideCount: 3, slideSize: { widthEmu: 1, heightEmu: 1, aspectRatio: 16 / 9 }, fonts: [], colors: [], positions: [], layouts: [], masters: [], charts: 1, images: 0, textCharacters: 240, slideRoles: roles, layoutFamilies: families, layoutFamilySummaries: families.map((item) => ({ family: item.family, count: 1, share: 1 / 3, averageConfidence: item.confidence, slides: [item.slide] })), styleMeasurements: { schema: "ppt-factory/reference-style-measurements/v1", method: "deterministic-ooxml", summary: { typography: { ...typography(), hierarchy: { titleToBodyRatio: 1.778 } }, density: { meanInformationScore: .45, meanVisualScore: .48, sparseSlides: 1, balancedSlides: 2, denseSlides: 0 }, whitespace: { meanOccupiedAreaRatio: .52, meanWhitespaceRatio: .48, method: "ooxml-bounded-union" }, charts: { count: 1, slidesWithCharts: 1, defaultTreatment: { type: "barChart", dataLabels: "outEnd", legend: "none", gridlines: "none", seriesColorMode: "theme" } } }, slides } },
    style: { styleId: "style_fixture", name: "Fixture", sourceType: "reference", version: "1", styleVector: {}, typography: {}, colors: {}, grid: {}, composition: {}, charts: {}, visuals: {}, storytelling: {}, density: {}, preferredLayouts: [], antiPatterns: [] }
  };
}

test("candidate scoring is deterministic, explainable and yields reusable pages", () => {
  const { analysis, style } = fixture();
  const first = buildGoldenSlideLibrary(analysis, style, "learn-style");
  const second = buildGoldenSlideLibrary(structuredClone(analysis), structuredClone(style), "learn-style");
  assert.deepEqual(first, second);
  assert.ok(first.candidates.some((item) => item.eligible));
  assert.ok(first.candidates.every((item) => Object.keys(item.dimensionScores).length === 6 && item.evidence.length >= 6));
});

test("retrieval explains role, layout, density and chart compatibility", () => {
  const { analysis, style } = fixture();
  const library = buildGoldenSlideLibrary(analysis, style, "learn-style");
  const result = retrieveGoldenSlide(library, { role: "evidence", density: "medium", visualPriority: "chart", metrics: [{ label: "增速", value: "12%", numericValue: 12, unit: "%", sourceText: "增速12%" }] });
  assert.equal(result.status, "selected");
  assert.equal(result.layoutSource, "golden_slide");
  assert.equal(result.sourceSlide, 3);
  assert.ok(result.evidence.some((item) => item.startsWith("chart-match:100")));
});

test("compatibility-only libraries can be inspected but never retrieved", () => {
  const { analysis, style } = fixture();
  const library = buildGoldenSlideLibrary(analysis, style, "compatibility-only");
  assert.ok(library.candidates.length > 0);
  assert.ok(library.candidates.every((item) => !item.eligible));
  const result = retrieveGoldenSlide(library, { role: "cover", density: "low", visualPriority: "text", metrics: [] });
  assert.equal(result.status, "fallback");
  assert.deepEqual(result.evidence, ["reference-usage:compatibility-only", "retrieval:blocked"]);
});

test("low match falls back and Slide Plan integration records threshold evidence", () => {
  const { analysis, style } = fixture();
  const library = buildGoldenSlideLibrary(analysis, style, "learn-style");
  library.thresholds.retrieval = 101;
  const result = retrieveGoldenSlide(library, { role: "cover", density: "low", visualPriority: "text", metrics: [] });
  assert.equal(result.layoutSource, "generative_layout");
  assert.equal(result.status, "fallback");
  assert.ok(result.evidence.includes("threshold:not-met"));
  const source = fs.readFileSync(path.join(process.cwd(), "lib/slide-plans.ts"), "utf8");
  assert.match(source, /const goldenMatch = retrieveGoldenSlide/);
  assert.match(source, /layoutSource: goldenMatch\.layoutSource, goldenMatch/);
});

test("Golden contracts and API persistence are explicit JSON artifacts", () => {
  const root = process.cwd();
  const schema = JSON.parse(fs.readFileSync(path.join(root, "schemas/golden-slides.schema.json"), "utf8"));
  const slideSchema = JSON.parse(fs.readFileSync(path.join(root, "schemas/slide-plan.schema.json"), "utf8"));
  assert.equal(schema.properties.schema.const, "ppt-factory/golden-slides/v1");
  assert.ok(slideSchema.properties.layoutSource.enum.includes("golden_slide"));
  assert.ok(slideSchema.properties.goldenMatch);
  const analyzeRoute = fs.readFileSync(path.join(root, "app/api/reference/analyze/route.ts"), "utf8");
  const materialRoute = fs.readFileSync(path.join(root, "app/api/materials/parse/route.ts"), "utf8");
  assert.match(analyzeRoute, /writeJson\(projectId, "analysis", "golden-slides"/);
  assert.match(materialRoute, /readJson<GoldenSlideLibrary>/);
});
