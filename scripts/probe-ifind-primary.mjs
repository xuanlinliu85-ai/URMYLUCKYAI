import { connectIfind } from "./ifind-mcp-client.mjs";

function summary(value) {
  const text = JSON.stringify(value ?? "");
  const dates = [...new Set(text.match(/20\d{2}[-/]?\d{2}[-/]?\d{2}/g) || [])].sort();
  const aCodes = [...new Set(text.match(/\b\d{6}\.(?:SH|SZ|BJ)\b/g) || [])];
  const hkCodes = [...new Set(text.match(/\b\d{5}\.HK\b/g) || [])];
  return { bytes: Buffer.byteLength(text), dates: dates.slice(-5), aCodes: aCodes.length, hkCodes: hkCodes.length };
}

function shape(value, depth = 0) {
  if (depth > 4) return typeof value;
  if (Array.isArray(value)) return { type: "array", length: value.length, first: value.length ? shape(value[0], depth + 1) : null };
  if (value && typeof value === "object") return {
    type: "object",
    keys: Object.keys(value),
    fields: Object.fromEntries(Object.entries(value).slice(0, 12).map(([key, item]) => [key, shape(item, depth + 1)])),
  };
  return { type: typeof value, sample: typeof value === "string" ? value.slice(0, 80) : value };
}

const connection = await connectIfind({ timeoutMs: 45_000 });
try {
  const listed = await connection.listTools();
  const wanted = new Set(["THS_RQ", "THS_HQ", "THS_DR", "THS_DateQuery", "get_stock_list"]);
  const schemas = Object.fromEntries((listed.tools || [])
    .filter(tool => wanted.has(tool.name))
    .map(tool => [tool.name, tool.inputSchema]));
  const [aStocks, hkStocks, realtime, history] = await Promise.all([
    connection.callTool("get_stock_list", { market: "a" }),
    connection.callTool("get_stock_list", { market: "hk" }),
    connection.callTool("THS_RQ", {
      thscode: "600519.SH,000300.SH,399006.SZ,00700.HK,HSI.HK",
      jsonIndicator: "tradeDate;tradeTime;latest;preClose;change;changeRatio;volume;amount",
    }),
    connection.callTool("THS_HQ", {
      thscode: "600519.SH,000001.SZ,300750.SZ",
      jsonIndicator: "open;high;low;close;volume;amount",
      jsonparam: "CPS:2,Days:Tradedays,Fill:Blank",
      begintime: "2026-07-01",
      endtime: "2026-07-30",
    }),
  ]);
  console.log(JSON.stringify({
    toolCount: listed.tools?.length || 0,
    schemas,
    aStockList: summary(aStocks),
    hkStockList: summary(hkStocks),
    realtimeBatch: summary(realtime),
    shapes: {
      aStocks: shape(aStocks),
      hkStocks: shape(hkStocks),
      realtime: shape(realtime),
      history: shape(history),
    },
  }, null, 2));
} finally {
  await connection.close();
}
