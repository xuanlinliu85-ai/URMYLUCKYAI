import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createChartPackLibrary, mapChartPackToNative, resolveChartPack } from "../lib/chart-packs.mjs";

test("chart pack library is versioned and exposes two native editable bar treatments", () => {
  const library = createChartPackLibrary();
  assert.equal(library.schema, "ppt-factory/chart-pack-library/v1");
  assert.equal(library.packs.length, 2);
  assert.deepEqual(library.packs.map((pack) => pack.treatment.surface), ["light", "dark"]);
  assert.ok(library.packs.every((pack) => pack.supportedNativeTypes.includes("bar")));
  const schema = JSON.parse(fs.readFileSync(path.join(process.cwd(), "schemas/chart-pack.schema.json"), "utf8"));
  assert.equal(schema.properties.packs.minItems, 2);
});

test("slide plan reference wins, style reference is optional, and selection is deterministic", () => {
  const input = { slidePlan: { chartPackRef: "chart_contrast_signal_v1" }, style: { charts: { chartPackId: "chart_restrained_business_v1" } }, nativeType: "bar" };
  const first = resolveChartPack(input);
  const second = resolveChartPack(input);
  assert.deepEqual(first, second);
  assert.equal(first.resolvedId, "chart_contrast_signal_v1");
  assert.equal(first.source, "slide-plan");
});

test("unknown or incompatible pack references fall back safely", () => {
  const unknown = resolveChartPack({ slidePlan: { chartPackRef: "missing" }, nativeType: "bar" });
  assert.equal(unknown.status, "fallback");
  assert.equal(unknown.resolvedId, "chart_restrained_business_v1");
  assert.match(unknown.reason, /unknown-pack/);
  const incompatible = resolveChartPack({ slidePlan: { chartPackRef: "chart_contrast_signal_v1" }, nativeType: "line" });
  assert.equal(incompatible.status, "fallback");
  assert.match(incompatible.reason, /unsupported-native-type/);
});

test("native mapping changes treatment without touching chart data", () => {
  const tokens = { accent: "#123B5D", secondary: "#C18A32", muted: "#667485", ink: "#132335", pale: "#E5ECF1", panel: "#FFFFFF", dark: "#0B2239" };
  const label = { position: "outEnd", fontSize: 16, displayStrategy: "all" };
  const light = mapChartPackToNative(resolveChartPack({}), tokens, label);
  const dark = mapChartPackToNative(resolveChartPack({ slidePlan: { chartPackRef: "chart_contrast_signal_v1" } }), tokens, label);
  assert.equal(light.chartFill, "#FFFFFF");
  assert.equal(dark.chartFill, "#0B2239");
  assert.notEqual(light.barOptions.gapWidth, dark.barOptions.gapWidth);
  assert.equal(typeof light.series, "undefined");
});

test("renderer consumes chart pack reference and persists selection manifest", () => {
  const renderer = fs.readFileSync(path.join(process.cwd(), "adapters/native-pptx/generate-deck.mjs"), "utf8");
  const planSchema = JSON.parse(fs.readFileSync(path.join(process.cwd(), "schemas/slide-plan.schema.json"), "utf8"));
  assert.ok(planSchema.properties.chartPackRef);
  assert.match(renderer, /resolveChartPack\(\{ slidePlan: activeSlidePlan/);
  assert.match(renderer, /chart-pack-manifest\.json/);
  assert.match(renderer, /slide\.charts\.add\("bar"/);
});
