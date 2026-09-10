import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { inferReferenceSlideRole } from "../adapters/reference-analyzer/role-inference.ts";

function fixture(overrides = {}) {
  return {
    slide: 2,
    slideCount: 12,
    texts: [],
    shapeCount: 2,
    chartCount: 0,
    imageCount: 0,
    tableCount: 0,
    connectorCount: 0,
    renderedPage: { width: 160, height: 90, meanLuminance: 240, lightPixelRatio: 0.88, entropy: 1.5 },
    ...overrides
  };
}

test("infers representative Chinese and English reference slide roles", () => {
  const cases = [
    ["cover", fixture({ slide: 1, texts: ["2026年产品策略会", "内部材料"] })],
    ["agenda_section", fixture({ texts: ["Agenda", "Market", "Product", "Execution"] })],
    ["agenda_section", fixture({ slide: 6, texts: ["Part 2", "配置策略"], renderedPage: { width: 160, height: 90, meanLuminance: 90, lightPixelRatio: 0, entropy: 0.25 } })],
    ["summary", fixture({ texts: ["核心观点", "需求持续改善", "风险总体可控"] })],
    ["evidence_data", fixture({ texts: ["经营数据趋势", "收入 128.5 亿元", "同比 18%", "份额 32%"], chartCount: 1 })],
    ["comparison", fixture({ texts: ["方案 A vs. 方案 B", "成本更低", "交付更快"] })],
    ["process_timeline", fixture({ texts: ["Implementation roadmap", "Step 1", "Step 2", "Milestone"], shapeCount: 8, connectorCount: 3 })],
    ["closing", fixture({ slide: 12, texts: ["谢谢", "Q&A"] })]
  ];
  for (const [expected, input] of cases) {
    const result = inferReferenceSlideRole(input);
    assert.equal(result.role, expected, JSON.stringify(result));
    assert.ok(result.confidence >= 0.5);
    assert.ok(result.evidence.length > 0);
  }
});

test("ambiguous pages honestly fall back to other", () => {
  const result = inferReferenceSlideRole(fixture({ texts: ["项目说明", "待进一步讨论"] }));
  assert.equal(result.role, "other");
  assert.ok(result.confidence <= 0.55);
});

test("role inference is deterministic and retains rendered evidence", () => {
  const input = fixture({ texts: ["Summary", "Key finding", "Action"] });
  const first = inferReferenceSlideRole(input);
  const second = inferReferenceSlideRole(structuredClone(input));
  assert.deepEqual(first, second);
  assert.equal(first.signals.renderedPage.lightPixelRatio, 0.88);
});

test("reference contracts persist roles and analyze after all-slide rendering", () => {
  const root = process.cwd();
  const route = fs.readFileSync(path.join(root, "app", "api", "reference", "analyze", "route.ts"), "utf8");
  const styleDna = fs.readFileSync(path.join(root, "lib", "style", "style-dna.ts"), "utf8");
  const analysisSchema = JSON.parse(fs.readFileSync(path.join(root, "schemas", "reference-analysis.schema.json"), "utf8"));
  const styleSchema = JSON.parse(fs.readFileSync(path.join(root, "schemas", "style-dna.schema.json"), "utf8"));
  assert.ok(route.indexOf("render-reference.mjs") < route.indexOf("analyzePptx(inputPath, { renderDir })"));
  assert.match(styleDna, /referenceSlideRoles: analysis\.slideRoles \?\? \[\]/);
  assert.ok(analysisSchema.required.includes("slideRoles"));
  assert.ok(styleSchema.properties.referenceSlideRoles);
});
