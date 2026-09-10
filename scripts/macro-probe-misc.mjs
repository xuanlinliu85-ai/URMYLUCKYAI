/**
 * 杂项探针：
 *  A) 广期所（工业硅/碳酸锂/多晶硅）正确后缀 —— 手册未记载，只能实测
 *  B) THS_HQ 是否支持持仓量等扩展字段
 *
 * 用法：node scripts/macro-probe-misc.mjs
 */
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { connectIfind } from "./ifind-mcp-client.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "..");
const probeDir = resolve(projectRoot, "work/macro-probe");
mkdirSync(probeDir, { recursive: true });

const END = new Date().toISOString().slice(0, 10);
const BEGIN = "2026-08-01";

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
function findSeries(p) {
  if (!p) return null;
  if (Array.isArray(p)) return p;
  for (const k of ["data", "tables", "result", "rows", "items"]) {
    const v = p[k];
    if (Array.isArray(v)) {
      if (v.length && typeof v[0] === "object" && Array.isArray(v[0]?.data)) return v[0].data;
      return v;
    }
    if (v && typeof v === "object") { const n = findSeries(v); if (n) return n; }
  }
  return null;
}
function brief(e) { return String(e?.message || e).replace(/\s+/g, " ").slice(0, 110); }

const out = { probedAt: new Date().toISOString(), gfex: [], fields: [], fieldLookup: [] };
const connection = await connectIfind({ timeoutMs: 180_000 });

// ---------- A) 广期所后缀变体 ----------
const suffixVariants = ["GFEX", "GFE", "GF", "GZ", "GFA", "GZFE", "CNGFEX"];
const bases = ["SI00", "LC00", "PS00"];
console.log("════════ A) 广期所后缀变体 ════════");
for (const base of bases) {
  for (const suf of suffixVariants) {
    const code = `${base}.${suf}`;
    let status = "FAIL"; let rows = 0; let last = null; let err = null;
    try {
      const raw = await connection.callTool("THS_HQ", {
        thscode: code, jsonIndicator: "close;volume",
        jsonparam: "CPS:1,Days:Tradedays,Fill:Blank",
        begintime: BEGIN, endtime: END,
      });
      const arr = findSeries(asObject(raw)) || [];
      const valid = arr.filter(r => Number(r.close) > 0);
      rows = valid.length;
      last = valid.length ? `${String(valid.at(-1).time).slice(0, 10)}=${valid.at(-1).close}` : null;
      status = rows ? "OK" : "EMPTY";
    } catch (e) { err = brief(e); }
    out.gfex.push({ code, status, rows, last, error: err });
    console.log(`${status.padEnd(6)} ${code.padEnd(14)} ${String(rows).padStart(3)}行 ${last || ""} ${err ? "← " + err : ""}`);
  }
}

// 另试无后缀与主连变体
console.log("\n--- 其他形态 ---");
for (const code of ["SI.GFEX", "LC.GFEX", "PS.GFEX", "SI00", "SI00.GFEXI", "SI2509.GFEX"]) {
  let status = "FAIL"; let rows = 0; let last = null; let err = null;
  try {
    const raw = await connection.callTool("THS_HQ", {
      thscode: code, jsonIndicator: "close", jsonparam: "CPS:1,Days:Tradedays,Fill:Blank",
      begintime: BEGIN, endtime: END,
    });
    const arr = findSeries(asObject(raw)) || [];
    const valid = arr.filter(r => Number(r.close) > 0);
    rows = valid.length;
    last = valid.length ? `${String(valid.at(-1).time).slice(0, 10)}=${valid.at(-1).close}` : null;
    status = rows ? "OK" : "EMPTY";
  } catch (e) { err = brief(e); }
  out.gfex.push({ code, status, rows, last, error: err });
  console.log(`${status.padEnd(6)} ${code.padEnd(14)} ${String(rows).padStart(3)}行 ${last || ""} ${err ? "← " + err : ""}`);
}

// ---------- B) THS_HQ 扩展字段 ----------
console.log("\n════════ B) THS_HQ 扩展字段（以 RB00.SHF 为样本）════════");
const fieldTries = [
  "close;volume;amount;openInterest",
  "close;volume;amount;position",
  "close;volume;amount;openInterest;settle;preSettle",
  "close;volume;openInterest;changeRatio",
  "close;volume;hold",
];
for (const f of fieldTries) {
  let status = "FAIL"; let sample = null; let err = null;
  try {
    const raw = await connection.callTool("THS_HQ", {
      thscode: "RB00.SHF", jsonIndicator: f, jsonparam: "CPS:1,Days:Tradedays,Fill:Blank",
      begintime: "2026-09-01", endtime: END,
    });
    const arr = findSeries(asObject(raw)) || [];
    sample = arr.length ? arr.at(-1) : null;
    status = arr.length ? "OK" : "EMPTY";
  } catch (e) { err = brief(e); }
  out.fields.push({ fields: f, status, sample, error: err });
  console.log(`${status.padEnd(6)} ${f}`);
  if (sample) console.log(`       返回键: ${Object.keys(sample).join(", ")}`);
  if (err) console.log(`       ← ${err}`);
}

// ---------- C) 用字段字典查持仓量 ----------
console.log("\n════════ C) lookup_field_reference 查期货字段 ════════");
for (const kw of ["期货持仓量", "持仓量", "结算价", "期货成交量"]) {
  let text = null; let err = null;
  try {
    const raw = await connection.callTool("lookup_field_reference", { function_name: "THS_HQ", keyword: kw });
    text = typeof raw === "string" ? raw : JSON.stringify(raw);
  } catch (e) { err = brief(e); }
  out.fieldLookup.push({ keyword: kw, text: text ? text.slice(0, 1500) : null, error: err });
  console.log(`\n--- keyword="${kw}" ---`);
  console.log(err ? "← " + err : text.slice(0, 700));
}

writeFileSync(resolve(probeDir, "misc-probe.json"), JSON.stringify(out, null, 2), "utf8");
await connection.close();
console.log("\n输出: work/macro-probe/misc-probe.json");
