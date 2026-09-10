import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { measureChartLabelCollision } from "../adapters/visual-qa/chart-label-collision.ts";

const root = process.cwd();
const qa = fs.readFileSync(path.join(root, "adapters/visual-qa/index.ts"), "utf8");
const fixRoute = fs.readFileSync(path.join(root, "app/api/qa/fix/route.ts"), "utf8");
const renderer = fs.readFileSync(path.join(root, "adapters/native-pptx/generate-deck.mjs"), "utf8");
const repairSchema = JSON.parse(fs.readFileSync(path.join(root, "schemas/repair-plan.schema.json"), "utf8"));

function layout(fontSize, position) {
  return {
    slide: { slide: 1 },
    chartMetadata: {
      schema: "ppt-factory/chart-labels/v1",
      charts: [{
        objectName: "metric-rate-chart",
        bbox: [112, 230, 260, 285],
        plotAreaBbox: [177, 265, 165, 205],
        categories: ["基期", "一厂", "二厂", "三厂", "四厂", "五厂"],
        series: [{ name: "准时交付率", values: [98, 99, 97, 98, 96, 99] }],
        minimumScale: 0,
        maximumScale: 100,
        barDirection: "column",
        dataLabels: { showValue: true, position, fontSize, displayStrategy: "all", suffix: "%" }
      }]
    }
  };
}

test("chart metadata detector finds crowded labels and clears after local policy repair", async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "ppt-chart-label-"));
  const file = "slide-001.layout.json";
  await fsp.writeFile(path.join(dir, file), JSON.stringify(layout(48, "outEnd")), "utf8");
  const before = await measureChartLabelCollision(dir, [file]);
  assert.equal(before.checkedCharts, 1);
  assert.ok(before.failingLabels >= 1);
  assert.equal(before.passed, false);
  await fsp.writeFile(path.join(dir, file), JSON.stringify(layout(12, "inEnd")), "utf8");
  const after = await measureChartLabelCollision(dir, [file]);
  assert.equal(after.failingLabels, 0);
  assert.equal(after.score, 100);
});

test("QA and AutoFix use a chart-specific technical target and object-local rollback score", () => {
  assert.match(qa, /dimension: "chartLabelCollision"/);
  assert.match(qa, /objectNames: \[finding\.objectName\]/);
  assert.match(fixRoute, /qa\.technical\.chartLabelCollision\.score/);
  assert.match(fixRoute, /target\.dimension === "chartLabelCollision"/);
  assert.match(fixRoute, /chartLabelIssues\.length/);
  assert.match(fixRoute, /targetScores\.some\(\(score\) => score\.after <= score\.before\)/);
});

test("native renderer changes only target chart label policy and persists chart metadata", () => {
  assert.match(renderer, /chartLabelPolicy\(chartName/);
  assert.match(renderer, /target\.dimension === "chartLabelCollision"/);
  assert.match(renderer, /chartLabelPosition/);
  assert.match(renderer, /chartLabelFontSize/);
  assert.match(renderer, /ppt-factory\/chart-labels\/v1/);
  assert.ok(repairSchema.properties.targets.items.properties.dimension.enum.includes("chartLabelCollision"));
});
