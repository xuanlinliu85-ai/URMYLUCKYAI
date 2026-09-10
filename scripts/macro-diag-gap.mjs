/**
 * 诊断：主力连续合约的零值空档能否通过参数规避
 * 样本：SH00.CZC（烧碱，最近 6 天无值）、PF00.CZC（短纤）
 */
import { connectIfind } from "./ifind-mcp-client.mjs";

function findSeries(p) {
  const seen = new WeakSet();
  const stack = [p];
  while (stack.length) {
    const n = stack.shift();
    if (!n || typeof n !== "object" || seen.has(n)) continue;
    seen.add(n);
    if (Array.isArray(n)) {
      const f = n.find(x => x && typeof x === "object");
      if (f && "time" in f) return n;
      for (const x of n) if (x && typeof x === "object") stack.push(x);
      continue;
    }
    for (const v of Object.values(n)) if (v && typeof v === "object") stack.push(v);
  }
  return null;
}
const asObj = r => (typeof r === "string" ? (() => { try { return JSON.parse(r); } catch { return null; } })() : r);

const connection = await connectIfind({ timeoutMs: 120000 });
const cases = [
  { code: "SH601.CZC", param: "" },
  { code: "SH605.CZC", param: "" },
  { code: "SH609.CZC", param: "" },
  { code: "SH701.CZC", param: "" },
  { code: "TA601.CZC", param: "" },
  { code: "SH00.CZC", param: "CPS:1,Days:All" },
  { code: "FG00.CZC", param: "CPS:1,Days:Tradedays,Fill:Blank" },
  { code: "SH00.CZC", param: "CPS:1,Days:Tradedays,Fill:Previous" },
];
for (const c of cases) {
  const args = {
    thscode: c.code,
    jsonIndicator: "close;volume;openInterest",
    begintime: "2026-08-20",
    endtime: new Date().toISOString().slice(0, 10),
  };
  if (c.param) args.jsonparam = c.param;
  try {
    const raw = await connection.callTool("THS_HQ", args);
    const rows = findSeries(asObj(raw)) || [];
    const tail = rows.slice(-8).map(r => `${String(r.time).slice(5, 10)}=${r.close}${r.openInterest != null ? "/oi" + r.openInterest : ""}`);
    console.log(`OK    ${c.code.padEnd(13)} [${(c.param || "无").slice(0, 34).padEnd(34)}] ${rows.length} 行`);
    console.log(`      ${tail.join("  ") || "(无数据)"}`);
  } catch (e) {
    console.log(`FAIL  ${c.code.padEnd(13)} [${(c.param || "无").slice(0, 34).padEnd(34)}] ${String(e?.message || e).replace(/\s+/g, " ").slice(0, 80)}`);
  }
}
await connection.close();
