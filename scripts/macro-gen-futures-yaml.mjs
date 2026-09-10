/**
 * 从 futures-probe.json 的实测结果生成 futures_chains.yaml
 *
 * 人写：产业链分组与上下游分层
 * 机生成：每个品种的元数据（代码、最新值、历史长度等，全部来自实测）
 *
 * 用法：node scripts/macro-gen-futures-yaml.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "..");
const probeDir = resolve(projectRoot, "work/macro-probe");
const SKILL_DIR = process.env.MACRO_SKILL_DIR ||
  "C:/Users/urmylucky/Documents/DeerFlow/skills/custom/macro-high-frequency-monitor";
const OUT = resolve(SKILL_DIR, "references/futures_chains.yaml");
mkdirSync(dirname(OUT), { recursive: true });

/* ---------------- 人工定义：产业链与上下游分层 ---------------- */
const CHAINS = [
  {
    id: "ferrous",
    name_cn: "黑色·煤焦钢",
    desc: "地产与基建的实物需求温度计。铁矿+双焦是成本端，钢材是产成品端，螺纹与地产施工同步性最高。",
    tiers: [
      { name_cn: "上游原料", members: ["FUT_I", "FUT_JM", "FUT_J", "FUT_ZC"] },
      { name_cn: "中游合金", members: ["FUT_SF", "FUT_SM"] },
      { name_cn: "下游钢材", members: ["FUT_RB", "FUT_HC", "FUT_SS"] },
    ],
  },
  {
    id: "nonferrous",
    name_cn: "有色金属",
    desc: "全球定价、金融属性最强的一类。铜是宏观需求的领先指标，铝受能耗与电解成本约束。",
    tiers: [
      { name_cn: "上游原料", members: ["FUT_AO"] },
      { name_cn: "基本金属", members: ["FUT_CU", "FUT_AL", "FUT_ZN", "FUT_PB", "FUT_NI", "FUT_SN", "FUT_BC"] },
    ],
  },
  {
    id: "energy",
    name_cn: "能源",
    desc: "原油是化工与运输成本的源头。燃料油/沥青/低硫燃料油是原油的直接裂解产物。",
    tiers: [
      { name_cn: "上游原油", members: ["FUT_SC"] },
      { name_cn: "下游油品", members: ["FUT_FU", "FUT_LU", "FUT_BU", "FUT_PG"] },
    ],
  },
  {
    id: "chemical",
    name_cn: "化工",
    desc: "三条主链：聚酯（PX→PTA→短纤/瓶片）、烯烃（甲醇/乙二醇→PP/塑料/PVC）、氯碱建材（纯碱→玻璃、烧碱→PVC）。链内价差反映加工利润的分配。",
    tiers: [
      { name_cn: "上游原料", members: ["FUT_PX", "FUT_MA", "FUT_EG", "FUT_SA", "FUT_SH", "FUT_EB", "FUT_RU", "FUT_NR", "FUT_BR", "FUT_SP"] },
      { name_cn: "下游成品", members: ["FUT_TA", "FUT_PF", "FUT_PR", "FUT_PP", "FUT_L", "FUT_V", "FUT_FG", "FUT_UR"] },
    ],
  },
  {
    id: "precious",
    name_cn: "贵金属",
    desc: "实际利率与避险的镜像。金是货币属性，银兼具工业属性，金银比是风险偏好的辅助读数。",
    tiers: [
      { name_cn: "品种", members: ["FUT_AU", "FUT_AG"] },
    ],
  },
  {
    id: "ags",
    name_cn: "农产品",
    desc: "天气与养殖周期驱动。油脂油料看南美/东南亚供给，玉米与豆粕决定养殖成本，生猪是通胀的末端读数。",
    tiers: [
      { name_cn: "上游原料", members: ["FUT_A", "FUT_C", "FUT_P", "FUT_LG"] },
      { name_cn: "下游成品", members: ["FUT_M", "FUT_Y", "FUT_OI", "FUT_RM", "FUT_CS", "FUT_JD", "FUT_LH", "FUT_SR", "FUT_CF", "FUT_AP", "FUT_PK"] },
    ],
  },
  {
    id: "newenergy",
    name_cn: "新能源·航运",
    desc: "广期所新能源金属反映产能周期与需求预期；集运欧线是外需与运力的直接读数。",
    tiers: [
      { name_cn: "新能源金属", members: ["FUT_SI", "FUT_LC", "FUT_PS"] },
      { name_cn: "航运", members: ["FUT_EC"] },
    ],
  },
];

/* 龙头品种：可视化默认聚焦、汇报优先提及 */
const LEADERS = new Set([
  "FUT_RB", "FUT_I", "FUT_JM", "FUT_CU", "FUT_AL", "FUT_SC",
  "FUT_TA", "FUT_MA", "FUT_PP", "FUT_SA", "FUT_FG",
  "FUT_AU", "FUT_AG", "FUT_M", "FUT_P", "FUT_LH",
  "FUT_SI", "FUT_LC", "FUT_EC",
]);

/* 作为宏观维度代理的品种（已在 layer_highfreq/market 中参与六维评分） */
const MACRO_LINKS = {
  FUT_RB: "HF_REBAR", FUT_HC: "HF_HRC", FUT_CU: "HF_COPPER", FUT_AL: "HF_ALUMINUM",
  FUT_I: "HF_IRON_ORE", FUT_JM: "HF_COKING_COAL", FUT_ZC: "HF_THERMAL_COAL",
  FUT_FG: "HF_GLASS", FUT_SC: "HF_BRENT",
};

const probe = JSON.parse(readFileSync(resolve(probeDir, "futures-probe.json"), "utf8"));
const byId = new Map(probe.results.map(r => [r.id, r]));
const memberIds = new Set(CHAINS.flatMap(c => c.tiers.flatMap(t => t.members)));
const unknown = [...memberIds].filter(id => !byId.has(id));
if (unknown.length) throw new Error(`分组引用了探针里不存在的 ID: ${unknown.join(", ")}`);
const ungrouped = probe.results.filter(r => !memberIds.has(r.id) && r.ok).map(r => r.id);
if (ungrouped.length) console.log(`提示：探针里未纳入分组的可用品种: ${ungrouped.join(", ")}`);

function q(s) { return `"${String(s).replace(/"/g, '\\"')}"`; }

const lines = [];
lines.push("# 期货产业链监控 · 配置层");
lines.push("#");
lines.push("# 归属：宏观高频监测 Skill 的第二个配置文件。");
lines.push("# 分工：indicator_registry.yaml 管宏观指标（参与六维评分）；本文件管期货全品种（展示与产业链分析，不参与六维评分）。");
lines.push("#");
lines.push("# 依据 Spec §6 / §17：所有 field_code 均由 scripts/macro-probe-futures.mjs 实测取得，无一处猜测。");
lines.push(`generated_at: ${q(probe.probedAt.slice(0, 10))}`);
lines.push(`window: { begin: ${q(probe.window.begin)}, end: ${q(probe.window.end)} }`);
lines.push("");
lines.push("# 交易所后缀实测更正（手册未记载或有误）");
lines.push("exchange_notes:");
lines.push("  - { exchange: 郑州商品交易所, manual_says: .ZCE, actual: .CZC, note: 手册写错，实测 FG00.ZCE 全部 -4210 }");
lines.push("  - { exchange: 广州期货交易所, manual_says: 未记载, actual: .GFE, note: 实测 GFEX/GF/GZ/GFA 均 -4210，仅 .GFE 通过 }");
lines.push("");
lines.push("# THS_HQ 期货专用字段（经 lookup_field_reference 确认）");
lines.push("hq_fields:");
lines.push("  base: [open, high, low, close, volume, amount]");
lines.push("  futures_specific: [openInterest, positionChange, settlement, preSettlement, change_settlement, chg_settlement]");
lines.push("  default_request: \"close;high;low;open;volume;amount;changeRatio;openInterest\"");
lines.push("  note: 持仓量字段名为 openInterest；position/settle/hold 等猜测名会被静默忽略，不报错但也不返回值");
lines.push("");
lines.push("# ============================================================");
lines.push("# 产业链分组与上下游分层");
lines.push("# ============================================================");
lines.push("futures_chains:");
for (const c of CHAINS) {
  lines.push(`  - id: ${c.id}`);
  lines.push(`    name_cn: ${q(c.name_cn)}`);
  lines.push(`    desc: ${q(c.desc)}`);
  lines.push("    tiers:");
  for (const t of c.tiers) {
    lines.push(`      - { name_cn: ${q(t.name_cn)}, members: [${t.members.join(", ")}] }`);
  }
}
lines.push("");
lines.push("# ============================================================");
lines.push("# 品种明细（全部经实测验证）");
lines.push("# ============================================================");
lines.push("layer_futures:");

const ordered = [];
for (const c of CHAINS) {
  const tierOf = new Map();
  for (const t of c.tiers) for (const m of t.members) tierOf.set(m, t.name_cn);
  for (const t of c.tiers) {
    for (const m of t.members) {
      const r = byId.get(m);
      ordered.push({ ...r, chain: c.id, chain_cn: c.name_cn, chain_tier: tierOf.get(m) });
    }
  }
}

for (const r of ordered) {
  const importance = LEADERS.has(r.id) ? "high" : "medium";
  const discontinued = !r.ok;
  lines.push("");
  lines.push(`  - id: ${r.id}`);
  lines.push(`    name_cn: ${q(r.name_cn)}`);
  lines.push(`    chain: ${r.chain}`);
  lines.push(`    chain_cn: ${q(r.chain_cn)}`);
  lines.push(`    chain_tier: ${q(r.chain_tier)}`);
  lines.push(`    category: futures`);
  lines.push(`    dimension: futures`);
  lines.push(`    scoring: false`);
  lines.push(`    frequency: daily`);
  lines.push(`    unit: ${r.unit || "index"}`);
  if (discontinued) {
    lines.push(`    ifind: { tool: THS_HQ, field_code: ${r.code}, verified: false, status: DISCONTINUED, last_trade: ${q(r.latestDate || "")}, note: ${q(r.error || "无有效数据")} }`);
  } else {
    const meta = [
      `tool: THS_HQ`,
      `field_code: ${r.code}`,
      `verified: true`,
      `history_days: ${r.historyDays}`,
      `latest_obs: ${q(r.latestDate)}`,
      `latest_value: ${r.latestClose}`,
    ];
    lines.push(`    ifind: { ${meta.join(", ")} }`);
  }
  if (MACRO_LINKS[r.id]) lines.push(`    linked_macro_id: ${MACRO_LINKS[r.id]}`);
  lines.push(`    transforms: [level, d1, d5, d20, ma20, zscore_1y, percentile_1y]`);
  lines.push(`    signal: { direction: contextual }`);
  lines.push(`    chart: { type: line, default_window: 1y }`);
  lines.push(`    importance: ${importance}`);
}

writeFileSync(OUT, lines.join("\n") + "\n", "utf8");

const okN = ordered.filter(r => r.ok).length;
console.log(`已生成: ${OUT}`);
console.log(`品种 ${ordered.length} 个（可用 ${okN} / 停更 ${ordered.length - okN}）`);
console.log(`产业链 ${CHAINS.length} 条: ${CHAINS.map(c => `${c.name_cn}(${c.tiers.reduce((a, t) => a + t.members.length, 0)})`).join(", ")}`);
console.log(`龙头品种 ${LEADERS.size} 个 | 与宏观维度挂钩 ${Object.keys(MACRO_LINKS).length} 个`);
