import fs from "node:fs/promises";
import { createIfindPrimarySource } from "./ifind-primary-source.mjs";
import { connectIfind } from "./ifind-mcp-client.mjs";

const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const runDate = process.argv[2] || today;
const forceHistory = process.argv.includes("--history");
if (!/^20\d{2}-\d{2}-\d{2}$/.test(runDate)) {
  throw new Error(`日期格式错误：${runDate}，应为 YYYY-MM-DD`);
}

function calendarDaysBefore(dateText, days) {
  const value = new Date(`${dateText}T00:00:00+08:00`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

function normalizedDates(value) {
  const matches = JSON.stringify(value ?? "").match(/20\d{2}[-/]?\d{2}[-/]?\d{2}/g) || [];
  return matches.map(item => {
    const digits = item.replaceAll("/", "").replaceAll("-", "");
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  });
}

async function isATradingDay(dateText) {
  const connection = await connectIfind({ timeoutMs: 45_000 });
  try {
    const calendar = await connection.callTool("THS_DateQuery", {
      market_code: "SSE",
      param: "dateType:0,period:D,dateFormat:0",
      begintime: dateText,
      endtime: dateText,
    });
    return normalizedDates(calendar).includes(dateText);
  } finally {
    await connection.close();
  }
}

if (!await isATradingDay(runDate)) {
  console.log(JSON.stringify({
    asOf: runDate,
    status: "skipped",
    reason: "non-trading-day",
  }, null, 2));
  process.exit(0);
}

const source = await createIfindPrimarySource();
try {
  let all;
  if (runDate === today && !forceHistory) {
    all = await source.allAStocks();
  } else {
    const beginDate = calendarDaysBefore(runDate, 30);
    const histories = await source.historiesByQuoteCodes(
      source.stocks.map(stock => stock.quoteCode),
      beginDate,
      runDate,
    );
    all = source.stocks.map(stock => {
      const series = histories.get(stock.quoteCode) || [];
      const index = series.findIndex(row => row.date === runDate);
      if (index < 0) return null;
      const row = series[index];
      const previous = index > 0 ? series[index - 1] : null;
      return {
        ifindCode: stock.ifindCode,
        name: stock.name,
        price: row.close,
        change: previous?.close ? (row.close / previous.close - 1) * 100 : 0,
        turnover: row.amount,
        volume: row.volume,
        tradeDate: row.date,
        tradeTime: "15:00:00",
        source: "iFinD",
      };
    }).filter(Boolean);
  }
  const dates = [...new Set(all.map(row => row.tradeDate).filter(Boolean))].sort();
  if (!dates.includes(runDate)) {
    throw new Error(`iFinD 未返回 ${runDate} 行情，实际日期：${dates.slice(-5).join(", ")}`);
  }
  const rows = all
    .filter(row => row.tradeDate === runDate && Number.isFinite(row.turnover) && row.turnover > 0)
    .sort((a, b) => b.turnover - a.turnover)
    .slice(0, 100)
    .map((row, index) => ({
      code: row.ifindCode,
      name: row.name,
      price: row.price,
      pct: row.change,
      amount: row.turnover / 100_000_000,
      rank: index + 1,
      tradeDate: row.tradeDate,
      tradeTime: row.tradeTime,
      source: row.source,
    }));
  if (rows.length !== 100) throw new Error(`成交额榜仅 ${rows.length} 条`);
  await fs.mkdir("analysis", { recursive: true });
  await fs.writeFile("analysis/today_top100.json", JSON.stringify({
    asOf: runDate,
    universeCount: source.universeCount,
    source: source.provider,
    rows,
  }, null, 2));
  console.log(JSON.stringify({
    asOf: runDate,
    universeCount: source.universeCount,
    rowCount: rows.length,
    first: rows[0],
    last: rows.at(-1),
  }, null, 2));
} finally {
  await source.close();
}
