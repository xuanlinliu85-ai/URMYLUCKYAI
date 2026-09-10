import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { normalizeBindingInput, parseSimpleCsv, resolveSlidePlanBindings } from "../lib/data-binding.ts";

const root = process.cwd();

function plan(bindingTargets = []) {
  return {
    slideIndex: 3,
    role: "evidence",
    message: "经营指标",
    importance: "high",
    density: "medium",
    layoutSource: "generative_layout",
    visualPriority: "chart",
    components: ["title", "business_metric_spread", "footer"],
    renderRoutes: { title: "native", chart: "native" },
    editableLevel: "native",
    content: ["指标均来自本地绑定输入"],
    metrics: [{ label: "占位指标", value: "80%", numericValue: 80, unit: "%", sourceText: "占位指标为80%" }],
    bindingTargets
  };
}

test("nested JSON and CJK paths resolve native text and chart targets deterministically", () => {
  const targets = [
    { id: "kpi", kind: "text", objectName: "metric-delta", template: "{{经营.KPI.差额}} 个百分点" },
    {
      id: "trend", kind: "chart", objectName: "metric-rate-chart",
      categoriesTemplate: "{{经营.趋势.月份}}",
      series: [{ nameTemplate: "{{经营.趋势.名称}}", valuesTemplate: "{{经营.趋势.数值}}" }]
    }
  ];
  const input = { format: "json", name: "经营数据.json", data: { 经营: { KPI: { 差额: 7 }, 趋势: { 月份: ["一月", "二月"], 名称: "准时率", 数值: [81.5, "88.5"] } } } };
  const first = resolveSlidePlanBindings([plan(targets)], input);
  const second = resolveSlidePlanBindings([plan(targets)], input);
  assert.deepEqual(first, second);
  assert.equal(first.manifest.status, "resolved");
  assert.equal(first.manifest.source.inputHash.length, 64);
  assert.equal(first.manifest.targets[0].resolved, "7 个百分点");
  assert.deepEqual(first.slidePlans[0].resolvedBindings[1].chart.series[0].values, [81.5, 88.5]);
  assert.equal(first.manifest.resolutionHash, second.manifest.resolutionHash);
});

test("simple CSV exposes headers, rows and columns with stable numeric parsing", () => {
  const csv = "月份,收入,地区\r\n一月,\"1,234.5\",华东\r\n二月,1280,华南\r\n";
  const parsed = parseSimpleCsv(csv);
  assert.deepEqual(parsed.headers, ["月份", "收入", "地区"]);
  assert.deepEqual(parsed.columns.收入, [1234.5, 1280]);
  const normalized = normalizeBindingInput({ format: "csv", name: "月度.csv", content: csv });
  assert.deepEqual(normalized.map["columns.月份"], ["一月", "二月"]);
  assert.equal(normalized.map["rows.0.地区"], "华东");
  assert.equal(normalized.source.rows, 2);
});

test("missing paths are explicit and never receive invented values", () => {
  const result = resolveSlidePlanBindings([plan([
    { id: "missing", kind: "text", objectName: "metric-delta", template: "{{经营.不存在}}" }
  ])], { format: "json", name: "input.json", data: { 经营: { 已知: 1 } } });
  assert.equal(result.manifest.status, "error");
  assert.deepEqual(result.manifest.unresolvedKeys, ["经营.不存在"]);
  assert.equal(result.manifest.targets[0].status, "unresolved");
  assert.equal(result.slidePlans[0].resolvedBindings, undefined);
});

test("invalid chart values fail explicitly instead of being coerced or fabricated", () => {
  assert.throws(() => resolveSlidePlanBindings([plan([{
    id: "invalid-chart", kind: "chart", objectName: "metric-rate-chart",
    categoriesTemplate: "{{图表.类别}}",
    series: [{ nameTemplate: "{{图表.名称}}", valuesTemplate: "{{图表.数值}}" }]
  }])], { format: "json", name: "invalid.json", data: { 图表: { 类别: ["A"], 名称: "收入", 数值: ["不是数字"] } } }), /non-numeric/);
});

test("ambiguous duplicate binding targets fail before rendering", () => {
  const duplicate = { id: "same", kind: "text", objectName: "metric-delta", template: "{{值}}" };
  assert.throws(() => resolveSlidePlanBindings([plan([duplicate, duplicate])], {
    format: "json", name: "duplicate.json", data: { 值: 1 }
  }), /must be unique/);
});

test("schemas, API persistence and renderer keep bindings bounded and optional", () => {
  const manifestSchema = JSON.parse(fs.readFileSync(path.join(root, "schemas/binding-manifest.schema.json"), "utf8"));
  const slideSchema = JSON.parse(fs.readFileSync(path.join(root, "schemas/slide-plan.schema.json"), "utf8"));
  const route = fs.readFileSync(path.join(root, "app/api/deck/generate/route.ts"), "utf8");
  const renderer = fs.readFileSync(path.join(root, "adapters/native-pptx/generate-deck.mjs"), "utf8");
  assert.equal(manifestSchema.properties.schema.const, "ppt-factory/binding-manifest/v1");
  assert.ok(slideSchema.properties.bindingTargets);
  assert.match(route, /binding-manifest/);
  assert.match(route, /hasBindingTargets/);
  assert.match(renderer, /binding-render-evidence/);
  assert.match(renderer, /boundRateChart/);
  assert.match(renderer, /bound \? bound\.value : text/);
  assert.match(renderer, /request\.slidePlans/);
});
