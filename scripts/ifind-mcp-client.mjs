import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { assessIfindTransport } from "./ifind-transport-policy.mjs";

const DEFAULT_BASE_URL = "http://219.141.246.230:5223/sse";
const REQUIRED_TOOLS = [
  "lookup_field_reference",
  "get_stock_list",
  "THS_HQ",
  "THS_RQ",
  "THS_DR",
  "THS_DateQuery",
];

function withTimeout(promise, timeoutMs, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}超时（${timeoutMs}ms）`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function configuredUrl() {
  const apiKey = String(process.env.IFIND_API_KEY || "").trim();
  if (!apiKey) return null;
  const url = new URL(String(process.env.IFIND_MCP_BASE_URL || DEFAULT_BASE_URL));
  const transportPolicy = assessIfindTransport(url);
  if (transportPolicy.warning) console.warn(`[iFinD transport] ${transportPolicy.warning}`);
  url.searchParams.set("api_key", apiKey);
  return url;
}

function contentText(result) {
  return (result?.content || [])
    .filter(item => item?.type === "text")
    .map(item => String(item.text || ""))
    .join("\n")
    .trim();
}

export function parseIfindResult(result) {
  if (result?.isError) throw new Error(contentText(result) || "iFinD MCP 返回错误");
  if (result?.structuredContent) return result.structuredContent;
  const text = contentText(result);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function connectIfind({ timeoutMs = 15_000 } = {}) {
  const url = configuredUrl();
  if (!url) throw new Error("缺少 IFIND_API_KEY");
  const client = new Client(
    { name: "urmylucky-daily-review", version: "1.0.0" },
    { capabilities: {} },
  );
  const transport = new SSEClientTransport(url);
  await withTimeout(client.connect(transport), timeoutMs, "iFinD MCP 连接");
  return {
    client,
    async listTools() {
      return withTimeout(client.listTools(), timeoutMs, "iFinD 工具列表");
    },
    async callTool(name, args) {
      const result = await withTimeout(
        client.callTool({ name, arguments: args }),
        timeoutMs,
        `iFinD ${name}`,
      );
      return parseIfindResult(result);
    },
    async close() {
      await transport.close().catch(() => {});
    },
  };
}

function latestDate(value) {
  const matches = JSON.stringify(value ?? "").match(/20\d{2}[-/]?(?:0[1-9]|1[0-2])[-/]?(?:0[1-9]|[12]\d|3[01])/g) || [];
  return matches.map(item => {
    const digits = item.replaceAll("/", "").replaceAll("-", "");
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  }).filter(item => {
    const [year, month, day] = item.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }).sort().at(-1) || "";
}

export async function runIfindCompatibilityAudit({ allowMissing = true } = {}) {
  if (!configuredUrl()) {
    if (!allowMissing) throw new Error("缺少 IFIND_API_KEY，无法连接 iFinD MCP");
    return {
      status: "pending-credential",
      compatible: false,
      checkedAt: new Date().toISOString(),
      requiredTools: REQUIRED_TOOLS,
      missingTools: REQUIRED_TOOLS,
      message: "等待配置 IFIND_API_KEY",
    };
  }

  let connection;
  try {
    connection = await connectIfind();
    const listed = await connection.listTools();
    const toolNames = (listed.tools || []).map(tool => tool.name).sort();
    const missingTools = REQUIRED_TOOLS.filter(name => !toolNames.includes(name));
    if (missingTools.length) throw new Error(`缺少工具：${missingTools.join(", ")}`);

    // 手册要求：调用数据函数前先查询字段参考。
    const [rqReference, hqReference] = await Promise.all([
      connection.callTool("lookup_field_reference", { function_name: "THS_RQ" }),
      connection.callTool("lookup_field_reference", { function_name: "THS_HQ" }),
    ]);
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const begin = new Date(`${today}T00:00:00+08:00`);
    begin.setUTCDate(begin.getUTCDate() - 14);
    const beginDate = begin.toISOString().slice(0, 10);
    const [realtimeSample, historySample] = await Promise.all([
      connection.callTool("THS_RQ", {
        thscode: "600519.SH",
        jsonIndicator: "tradeDate;tradeTime;latest;preClose;change;changeRatio;volume;amount",
      }),
      connection.callTool("THS_HQ", {
        thscode: "600519.SH",
        jsonIndicator: "open;high;low;close;volume;amount",
        jsonparam: "CPS:2,Days:Tradedays,Fill:Blank",
        begintime: beginDate,
        endtime: today,
      }),
    ]);
    const realtimeDate = latestDate(realtimeSample);
    const historyDate = latestDate(historySample);
    return {
      status: "ready",
      compatible: true,
      checkedAt: new Date().toISOString(),
      toolCount: toolNames.length,
      requiredTools: REQUIRED_TOOLS,
      missingTools,
      fieldReferenceVerified: Boolean(rqReference && hqReference),
      realtimeSampleDate: realtimeDate,
      historySampleDate: historyDate,
      message: "iFinD MCP 工具、字段参考、实时样本与历史样本均已通过",
    };
  } catch (error) {
    const audit = {
      status: "error",
      compatible: false,
      checkedAt: new Date().toISOString(),
      requiredTools: REQUIRED_TOOLS,
      missingTools: [],
      message: error instanceof Error ? error.message : String(error),
    };
    if (!allowMissing) throw new Error(`iFinD MCP 兼容性校验失败：${audit.message}`);
    return audit;
  } finally {
    await connection?.close();
  }
}
