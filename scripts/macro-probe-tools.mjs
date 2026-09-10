// 一次性工具：拉取 iFinD MCP 全部工具的输入 schema。
// 目的：杜绝猜测参数名（Spec §6 / RULE 6）。
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { connectIfind } from "./ifind-mcp-client.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, "../work/macro-probe");
mkdirSync(outDir, { recursive: true });

const connection = await connectIfind({ timeoutMs: 60_000 });
try {
  const listed = await connection.listTools();
  const tools = (listed.tools || []).map(tool => ({
    name: tool.name,
    description: String(tool.description || "").replace(/\s+/g, " ").slice(0, 800),
    inputSchema: tool.inputSchema ?? null,
  }));
  tools.sort((a, b) => a.name.localeCompare(b.name));
  writeFileSync(resolve(outDir, "tool-schemas.json"), JSON.stringify(tools, null, 2), "utf8");
  console.log(`工具数：${tools.length}`);
  console.log(tools.map(tool => tool.name).join("\n"));
} finally {
  await connection.close();
}
