// 诊断：工作台 18 张图 / 迷你走势的数据可用性
// 目的：找出「面板里没有图」的真实原因（是数据缺失，还是容器/时序问题）
// 只读，不改任何产物
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const snap = JSON.parse(readFileSync(resolve(root, "public/macro-snapshot.json"), "utf8"));
const trends = snap.trends || {};
const inds = snap.indicators || [];

const SETS = {
  mktFundChart: ["MKT_DR001", "MKT_DR007", "MKT_R001", "MKT_R007", "MKT_SHIBOR_1W"],
  mktEquityChart: ["MKT_HS300", "MKT_CSI1000", "MKT_CYB", "MKT_SSE"],
  mktFxChart: ["MKT_USDCNY", "MKT_USDCNH"],
  mktCmdtyChart: ["HF_BRENT", "HF_COPPER", "HF_REBAR", "HF_IRON_ORE", "HF_COKING_COAL", "HF_GLASS"],
  basInflationChart: ["CN_CPI", "CN_PPI", "CN_CPI_FOOD", "CN_CPI_NONFOOD"],
  basCreditChart: ["CN_M1", "CN_M2", "CN_TSF", "CN_TSF_GOV"],
  basPmiChart: ["CN_PMI", "CN_PMI_ORDER", "CN_PMI_PROD", "CN_PMI_INVENTORY"],
  basPropertyChart: ["CN_RE_INV", "CN_RE_SALES_YOY", "CN_RE_COMPLETE_YOY"],
  basDemandChart: ["CN_RETAIL", "CN_RETAIL_CATERING", "CN_EXPORT", "CN_IMPORT"],
  basIndustryChart: ["CN_IP", "CN_IP_PROFIT"],
};

console.log("=== 快照概况 ===");
console.log("asOf:", snap.asOf, "| trends 键数:", Object.keys(trends).length, "| indicators:", inds.length);
console.log("categories 组:", Object.keys(snap.categories || {}).join(", "));
console.log("");

console.log("=== 趋势键全清单 ===");
console.log(Object.keys(trends).sort().join("  "));
console.log("");

console.log("=== 各图数据可用性 ===");
let bad = 0;
for (const [chart, ids] of Object.entries(SETS)) {
  const rows = [];
  for (const id of ids) {
    const t = trends[id];
    const pts = t ? (t.points ? t.points.length : (Array.isArray(t) ? t.length : 0)) : 0;
    const hasPts = Array.isArray(t && t.points) ? t.points.length : Array.isArray(t) ? t.length : 0;
    if (!t) { bad++; rows.push(`  MISSING  ${id}`); }
    else rows.push(`  ok(${String(hasPts).padStart(4)}) ${id}  freq=${t.freq || "?"} unit=${t.unit || "?"}`);
  }
  console.log(`${chart}:`);
  console.log(rows.join("\n"));
}
console.log("");
console.log("缺失条目数:", bad);

// 检查 trends 的实际结构（取一个样本）
const sampleKey = Object.keys(trends)[0];
console.log("\n=== trends[sample] 结构 ===");
console.log(sampleKey, "=>", JSON.stringify(trends[sampleKey]).slice(0, 400));

// 检查 indicators 里被引用的 id 是否存在（总表/迷你走势用）
console.log("\n=== indicators 前 3 项结构 ===");
console.log(JSON.stringify(inds.slice(0, 3), null, 1).slice(0, 1200));
