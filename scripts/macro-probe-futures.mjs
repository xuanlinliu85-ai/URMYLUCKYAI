/**
 * 期货全品种探针：批量实测主力连续合约代码可用性 + 字段可用性
 *
 * 用法：
 *   node scripts/macro-probe-futures.mjs
 * 环境：
 *   IFIND_API_KEY / IFIND_MCP_BASE_URL（必需）
 *   FUT_PROBE_IN   候选清单，默认 futures-candidates.json
 *   FUT_PROBE_OUT  输出，默认 futures-probe.json
 *
 * 原则（Spec §6）：不猜代码、不猜字段。每一个品种都必须真拉到数据才算 verified。
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { connectIfind } from "./ifind-mcp-client.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "..");
const probeDir = resolve(projectRoot, "work/macro-probe");
mkdirSync(probeDir, { recursive: true });

const IN_FILE = process.env.FUT_PROBE_IN || "futures-candidates.json";
const OUT_FILE = process.env.FUT_PROBE_OUT || "futures-probe.json";
const END = process.env.PROBE_END || new Date().toISOString().slice(0, 10);
// 探针窗口取近 14 个月：足够判断是否有 1 年历史（zscore_1y 前提），又不拖慢
const BEGIN = process.env.PROBE_BEGIN || shiftYear(END, 1.2);
const CONCURRENCY = Number(process.env.FUT_PROBE_CONCURRENCY || 5);
const FIELDS = process.env.FUT_PROBE_FIELDS || "close;high;low;open;volume;amount;changeRatio";

function shiftYear(iso, years) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() - Math.floor(years));
  d.setUTCMonth(d.getUTCMonth() - Math.round((years % 1) * 12));
  return d.toISOString().slice(0, 10);
}

function asObject(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "object") return raw;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return null;
    try { return JSON.parse(t); } catch { return { _text: raw }; }
  }
  return { _value: raw };
}

/** 在返回体里定位时间序列数组 */
function findSeries(payload) {
  if (!payload) return null;
  if (Array.isArray(payload)) return payload;
  const known = ["data", "tables", "result", "rows", "items"];
  for (const key of known) {
    const v = payload[key];
    if (Array.isArray(v)) {
      // 有些结构是 {data:{data:[...]}}
      if (v.length && typeof v[0] === "object" && Array.isArray(v[0]?.data)) return v[0].data;
      return v;
    }
    if (v && typeof v === "object") {
      const nested = findSeries(v);
      if (nested) return nested;
    }
  }
  return null;
}

function num(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function probeOne(connection, item) {
  const started = Date.now();
  const out = {
    id: item.id,
    name_cn: item.name_cn,
    code: item.code,
    unit: item.unit || null,
    chain: item.chain,
    chain_cn: item.chain_cn,
    ok: false,
    error: null,
    rows: 0,
    validRows: 0,
    zeroRows: 0,
    firstDate: null,
    latestDate: null,
    latestClose: null,
    latestVolume: null,
    latestAmount: null,
    hasOpen: false,
    hasAmount: false,
    historyDays: 0,
    elapsedMs: 0,
  };
  try {
    const raw = await connection.callTool("THS_HQ", {
      thscode: item.code,
      jsonIndicator: FIELDS,
      jsonparam: "CPS:1,Days:Tradedays,Fill:Blank",
      begintime: BEGIN,
      endtime: END,
    });
    const rows = findSeries(asObject(raw)) || [];
    const parsed = [];
    for (const row of rows) {
      const d = String(row.time ?? row.date ?? "").slice(0, 10);
      if (!d) continue;
      const c = num(row.close);
      const v = num(row.volume);
      parsed.push({ d, c, v, o: num(row.open), a: num(row.amount) });
    }
    parsed.sort((x, y) => x.d.localeCompare(y.d));
    const withClose = parsed.filter(x => x.c !== null);
    const nonZero = withClose.filter(x => x.c !== 0);
    out.rows = parsed.length;
    out.validRows = nonZero.length;
    out.zeroRows = withClose.length - nonZero.length;
    out.firstDate = nonZero[0]?.d || null;
    const last = nonZero.at(-1) || null;
    out.latestDate = last?.d || null;
    out.latestClose = last?.c ?? null;
    out.latestVolume = last?.v ?? null;
    out.latestAmount = last?.a ?? null;
    out.hasOpen = parsed.some(x => x.o !== null && x.o !== 0);
    out.hasAmount = parsed.some(x => x.a !== null && x.a !== 0);
    out.historyDays = nonZero.length;
    out.ok = nonZero.length > 0;
    if (!out.ok) out.error = parsed.length ? "全部为 0 或空" : "无返回数据";
  } catch (error) {
    out.error = String(error?.message || error).slice(0, 180);
  }
  out.elapsedMs = Date.now() - started;
  return out;
}

async function main() {
  const src = JSON.parse(readFileSync(resolve(probeDir, IN_FILE), "utf8"));
  const queue = [];
  for (const g of src.groups) {
    for (const it of g.items) queue.push({ ...it, chain: g.chain, chain_cn: g.chain_cn });
  }
  console.log(`候选品种 ${queue.length} 个 | 窗口 ${BEGIN} ~ ${END} | 字段 ${FIELDS}`);
  const connection = await connectIfind({ timeoutMs: 180_000 });
  const results = [];
  let cursor = 0;
  let done = 0;
  try {
    async function worker() {
      while (cursor < queue.length) {
        const item = queue[cursor++];
        const r = await probeOne(connection, item);
        results.push(r);
        done += 1;
        const mark = r.ok ? "OK  " : "FAIL";
        console.log(
          `${mark} ${r.chain_cn.padEnd(10)} ${r.name_cn.padEnd(8)} ${r.code.padEnd(11)} ` +
          `${String(r.historyDays).padStart(4)}日 ${r.latestDate || "-"} ${String(r.latestClose ?? "-").padStart(9)}` +
          `${r.ok ? "" : "  ← " + r.error}  (${done}/${queue.length})`
        );
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
  } finally {
    await connection.close();
  }

  // 按产业链汇总
  const byChain = {};
  for (const r of results) {
    byChain[r.chain] = byChain[r.chain] || { chain_cn: r.chain_cn, total: 0, ok: 0, failed: [] };
    byChain[r.chain].total += 1;
    if (r.ok) byChain[r.chain].ok += 1;
    else byChain[r.chain].failed.push(`${r.name_cn}(${r.code})`);
  }

  const okCount = results.filter(r => r.ok).length;
  const terminal = results.filter(r => r.ok && r.zeroRows > 5 && r.latestDate < "2026-08-01");
  const payload = {
    probedAt: new Date().toISOString(),
    window: { begin: BEGIN, end: END },
    fields: FIELDS,
    summary: {
      total: results.length,
      ok: okCount,
      failed: results.length - okCount,
      byChain,
      suspectedDiscontinued: terminal.map(r => `${r.name_cn}(${r.code}) 最后交易日 ${r.latestDate}`),
    },
    results: results.slice().sort((a, b) => (a.chain + a.id).localeCompare(b.chain + b.id)),
  };
  writeFileSync(resolve(probeDir, OUT_FILE), JSON.stringify(payload, null, 2), "utf8");

  console.log("\n════════ 汇总 ════════");
  for (const [k, v] of Object.entries(byChain)) {
    console.log(`${v.chain_cn.padEnd(12)} ${v.ok}/${v.total}${v.failed.length ? "  失败: " + v.failed.join(", ") : ""}`);
  }
  console.log(`\n可用 ${okCount}/${results.length}`);
  if (payload.summary.suspectedDiscontinued.length) {
    console.log(`疑似停更: ${payload.summary.suspectedDiscontinued.join(" | ")}`);
  }
  console.log(`输出: work/macro-probe/${OUT_FILE}`);
}

main().catch(error => {
  console.error("探针失败:", error);
  process.exitCode = 1;
});
