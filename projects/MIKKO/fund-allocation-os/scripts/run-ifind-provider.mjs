import { IfindFundProvider } from "../packages/providers/ifind/src/fund-provider.mjs";

function positiveInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

async function main() {
  if (!IfindFundProvider.configured()) throw new Error("缺少 IFIND_API_KEY");
  const [action, ...args] = process.argv.slice(2);
  const provider = await IfindFundProvider.connect({ timeoutMs: 60_000 });
  try {
    if (action === "universe") {
      const limit = positiveInteger(args[0]);
      const rows = await provider.listFundUniverse();
      return {
        status: "ready",
        source: "iFinD MCP",
        asOf: new Date().toISOString(),
        totalRows: rows.length,
        rows: limit ? rows.slice(0, limit) : rows,
      };
    }
    if (action === "snapshots") {
      const codes = String(args[0] || "").split(",").filter(Boolean);
      return {
        status: "ready",
        source: "iFinD MCP",
        asOf: new Date().toISOString(),
        rows: await provider.getFundSnapshots(codes),
      };
    }
    if (action === "nav") {
      const [codesArg, beginDate, endDate] = args;
      const codes = String(codesArg || "").split(",").filter(Boolean);
      const nav = await provider.getAdjustedNav(codes, beginDate, endDate);
      return {
        status: "ready",
        source: "iFinD MCP",
        asOf: new Date().toISOString(),
        series: Object.fromEntries(nav),
      };
    }
    throw new Error("action 必须是 universe、snapshots 或 nav");
  } finally {
    await provider.close();
  }
}

try {
  console.log(JSON.stringify(await main()));
} catch (error) {
  console.error(JSON.stringify({
    status: "error",
    source: "iFinD MCP",
    message: error instanceof Error ? error.message : String(error),
  }));
  process.exitCode = 1;
}

