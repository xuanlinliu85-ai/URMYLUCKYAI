import { connectIfind } from "./ifind-mcp-client.mjs";

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function quoteToIfind(code) {
  const value = String(code || "").trim();
  const specialIndexes = {
    sh000510: "000510.CSI",
    sh000985: "000985.CSI",
    sh000922: "000922.CSI",
  };
  if (specialIndexes[value.toLowerCase()]) return specialIndexes[value.toLowerCase()];
  const mainland = value.match(/^(sh|sz|bj)(\d+)$/i);
  if (mainland) return `${mainland[2]}.${mainland[1].toUpperCase()}`;
  const hk = value.match(/^hk(.+)$/i);
  if (hk) return `${hk[1].toUpperCase()}.HK`;
  const dotted = value.match(/^\d{6}\.(SH|SZ|BJ)$/i);
  return dotted ? value.toUpperCase() : "";
}

function ifindToQuote(code) {
  const match = String(code || "").match(/^(.+)\.(SH|SZ|BJ|HK)$/i);
  if (!match) return "";
  return `${match[2].toLowerCase()}${match[1]}`;
}

function canonicalIfindCode(code) {
  const value = String(code || "").toUpperCase();
  const hk = value.match(/^(\d+)\.HK$/);
  return hk ? `${hk[1].padStart(5, "0")}.HK` : value;
}

function normalizeDate(value) {
  const match = String(value || "").match(/(20\d{2})[-/]?(\d{2})[-/]?(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

function groups(values, size) {
  const output = [];
  for (let index = 0; index < values.length; index += size) output.push(values.slice(index, index + size));
  return output;
}

async function resilientBatches(values, size, concurrency, load, label) {
  const output = [];
  const queue = groups(values, size);
  let completed = 0;
  for (let start = 0; start < queue.length; start += concurrency) {
    const batchGroup = queue.slice(start, start + concurrency);
    const results = await Promise.all(batchGroup.map(async batch => {
      try {
        return await load(batch);
      } catch (error) {
        if (batch.length === 1) throw error;
        const middle = Math.ceil(batch.length / 2);
        return [
          ...await resilientBatches(batch.slice(0, middle), Math.max(1, Math.floor(batch.length / 2)), 1, load, label),
          ...await resilientBatches(batch.slice(middle), Math.max(1, Math.floor(batch.length / 2)), 1, load, label),
        ];
      }
    }));
    output.push(...results.flat());
    completed += batchGroup.reduce((sum, batch) => sum + batch.length, 0);
    if (completed === values.length || completed % Math.max(size * concurrency * 4, 1) === 0) {
      console.warn(`${label} ${Math.min(completed, values.length)}/${values.length}`);
    }
    if (start + concurrency < queue.length) await wait(50);
  }
  return output;
}

export async function createIfindPrimarySource() {
  const connection = await connectIfind({ timeoutMs: 90_000 });
  const aUniverse = await connection.callTool("get_stock_list", { market: "a" });
  const aItems = Array.isArray(aUniverse?.items) ? aUniverse.items : [];
  if (aItems.length < 5_000) throw new Error(`iFinD 全A股票池仅返回 ${aItems.length} 只，拒绝切换主源`);
  const names = new Map(aItems.map(item => [String(item.code || "").toUpperCase(), String(item.name || "")]));
  const quoteCache = new Map();
  const historyCache = new Map();

  async function realtimeByIfindCodes(inputCodes) {
    const codes = [...new Set(inputCodes.map(canonicalIfindCode).filter(Boolean))];
    const missing = codes.filter(code => !quoteCache.has(code));
    if (missing.length) {
      const payloads = await resilientBatches(missing, 250, 4, batch => connection.callTool("THS_RQ", {
        thscode: batch.join(","),
        jsonIndicator: "tradeDate;tradeTime;latest;preClose;open;high;low;change;changeRatio;volume;amount;turnoverRate",
      }), "iFinD 实时行情");
      for (const payload of payloads) {
        for (const row of payload?.data || []) {
          const code = canonicalIfindCode(row.thscode);
          quoteCache.set(code, {
            code: code.replace(/\.(SH|SZ|BJ|HK)$/i, ""),
            quoteCode: ifindToQuote(code),
            ifindCode: code,
            name: names.get(code) || "",
            price: Number(row.latest ?? row.close ?? 0),
            change: Number(row.changeRatio ?? 0),
            turnover: Number(row.amount ?? 0),
            volume: Number(row.volume ?? 0),
            tradeDate: normalizeDate(row.tradeDate || row.time),
            tradeTime: String(row.tradeTime || ""),
            source: "iFinD",
          });
        }
      }
    }
    return new Map(codes.map(code => [code, quoteCache.get(code)]).filter(([, row]) => row));
  }

  async function realtimeByQuoteCodes(quoteCodes) {
    const pairs = quoteCodes.map(code => [String(code).toLowerCase(), quoteToIfind(code)]).filter(([, code]) => code);
    const rows = await realtimeByIfindCodes(pairs.map(([, code]) => code));
    return new Map(pairs.map(([quoteCode, code]) => [quoteCode, rows.get(code)]).filter(([, row]) => row));
  }

  async function allAStocks() {
    const rows = await realtimeByIfindCodes(aItems.map(item => item.code));
    return aItems.map(item => {
      const code = canonicalIfindCode(item.code);
      const quote = rows.get(code);
      return quote ? { ...quote, code: code.slice(0, 6), name: String(item.name || quote.name), market: code.slice(-2).toLowerCase() } : null;
    }).filter(item => item && item.tradeDate && Number.isFinite(item.change));
  }

  async function historiesByQuoteCodes(quoteCodes, beginDate, endDate) {
    const pairs = quoteCodes.map(code => [String(code).toLowerCase(), quoteToIfind(code)]).filter(([, code]) => code);
    const missing = pairs.filter(([, code]) => !historyCache.has(`${code}:${beginDate}:${endDate}`));
    if (missing.length) {
      const codes = missing.map(([, code]) => code);
      // 150 个自然日窗口下，25 个代码/批可稳定覆盖 60 日动量与 20 日信号。
      const payloads = await resilientBatches(codes, 25, 4, batch => connection.callTool("THS_HQ", {
        thscode: batch.join(","),
        jsonIndicator: "open;high;low;close;volume;amount",
        jsonparam: "CPS:2,Days:Tradedays,Fill:Blank",
        begintime: beginDate,
        endtime: endDate,
      }), "iFinD 历史K线");
      const byCode = new Map(codes.map(code => [code, []]));
      for (const payload of payloads) {
        for (const row of payload?.data || []) {
          const code = canonicalIfindCode(row.thscode);
          if (!byCode.has(code)) byCode.set(code, []);
          byCode.get(code).push({
            date: normalizeDate(row.time),
            open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close),
            volume: Number(row.volume ?? 0), amount: Number(row.amount ?? 0),
          });
        }
      }
      for (const code of codes) {
        const rows = (byCode.get(code) || []).filter(row => row.date && [row.open, row.high, row.low, row.close].every(Number.isFinite));
        rows.sort((a, b) => a.date.localeCompare(b.date));
        historyCache.set(`${code}:${beginDate}:${endDate}`, rows);
      }
    }
    return new Map(pairs.map(([quoteCode, code]) => [quoteCode, historyCache.get(`${code}:${beginDate}:${endDate}`) || []]));
  }

  return {
    provider: "iFinD MCP",
    universeCount: aItems.length,
    stocks: aItems.map(item => {
      const ifindCode = canonicalIfindCode(item.code);
      return {
        ifindCode,
        quoteCode: ifindToQuote(ifindCode),
        name: String(item.name || ""),
      };
    }),
    realtimeByQuoteCodes,
    allAStocks,
    historiesByQuoteCodes,
    async close() { await connection.close(); },
  };
}
