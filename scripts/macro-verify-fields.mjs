// iFinD 宏观字段探针 · Phase 3 (verify)
// 对候选 ID 做真实取数验证。EDB 批量一次调用；HQ 逐代码调用。
// Spec §6：只有实测返回数据才允许标记 verified: true。
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { connectIfind } from "./ifind-mcp-client.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const probeDir = resolve(here, "../work/macro-probe");
mkdirSync(probeDir, { recursive: true });

const picks = JSON.parse(readFileSync(resolve(probeDir, "verify-picks.json"), "utf8"));
const BEGIN = process.env.VERIFY_BEGIN || "2024-01-01";
const END = process.env.VERIFY_END || "2026-09-10";

const connection = await connectIfind({ timeoutMs: 180_000 });
const results = { edb: null, hq: [] };

function describe(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return { length: text.length, head: text.slice(0, 700) };
}

try {
  const ids = picks.edb.map(p => p.code);
  if (process.env.VERIFY_SKIP_EDB === "1") {
    console.log("跳过 EDB 批量验证");
    results.edb = { ok: true, skipped: true };
  } else {
  console.log(`EDB 批量验证 ${ids.length} 个指标：${ids.join(";")}`);
  try {
    const raw = await connection.callTool("THS_EDB", {
      indicators: ids.join(";"),
      begintime: BEGIN,
      endtime: END,
    });
    results.edb = { ok: true, request: { indicators: ids.join(";"), begintime: BEGIN, endtime: END }, ...describe(raw), data: raw };
    console.log(`EDB 返回长度 ${results.edb.length}`);
  } catch (error) {
    results.edb = { ok: false, error: error instanceof Error ? error.message : String(error) };
    console.log(`EDB 批量失败：${results.edb.error}`);
  }
  }

  for (const pick of picks.hq) {
    try {
      const raw = await connection.callTool("THS_HQ", {
        thscode: pick.code,
        jsonIndicator: "open;high;low;close;volume;amount",
        jsonparam: "CPS:2,Days:Tradedays,Fill:Blank",
        begintime: "2026-08-01",
        endtime: END,
      });
      const text = typeof raw === "string" ? raw : JSON.stringify(raw);
      const empty = /-4001|无数据|"data"\s*:\s*\[\s*\]/.test(text);
      results.hq.push({ ...pick, ok: !empty, length: text.length, head: text.slice(0, 420) });
      console.log(`${empty ? "EMPTY" : "OK   "} ${pick.id} ${pick.code} ${pick.expect} (${text.length})`);
    } catch (error) {
      results.hq.push({ ...pick, ok: false, error: error instanceof Error ? error.message : String(error) });
      console.log(`ERR   ${pick.id} ${pick.code} → ${results.hq.at(-1).error}`);
    }
  }
} finally {
  await connection.close();
}

writeFileSync(resolve(probeDir, "verify-results.json"), JSON.stringify(results, null, 2), "utf8");
console.log("→ verify-results.json");
