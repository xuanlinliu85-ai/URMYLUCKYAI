import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalFundCode,
  normalizeUniverseRows,
} from "../packages/providers/ifind/src/fund-provider.mjs";

test("canonicalFundCode normalizes OTC public-fund codes", () => {
  assert.equal(canonicalFundCode("519702"), "519702.OF");
  assert.equal(canonicalFundCode(" 519702.of "), "519702.OF");
  assert.equal(canonicalFundCode("512880.SH"), "512880.SH");
  assert.equal(canonicalFundCode("bad"), "");
});

test("normalizeUniverseRows maps and deduplicates iFinD rows", () => {
  const rows = normalizeUniverseRows({
    data: [
      { "基金代码": "519702.OF", "基金简称": "交银趋势", "基金@投资类型(二级分类)": "偏股混合型基金" },
      { "基金代码": "519702.OF", "基金简称": "重复", "基金@投资类型(二级分类)": "偏股混合型基金" },
      { "基金代码": "invalid", "基金简称": "无效" },
    ],
  });
  assert.deepEqual(rows, [{
    fundCode: "519702.OF",
    fundName: "交银趋势",
    investmentType: "偏股混合型基金",
    source: "iFinD MCP",
  }]);
});

