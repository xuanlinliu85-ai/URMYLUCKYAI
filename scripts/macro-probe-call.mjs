// 通用调用器：从环境变量读取工具名与参数，把结果原样落盘。
// PROBE_TOOL=get_guide
// PROBE_ARGS='{"thscode":"000300.SH",...}'
// PROBE_CALL_OUT=xxx.json
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { connectIfind } from "./ifind-mcp-client.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const probeDir = resolve(here, "../work/macro-probe");
mkdirSync(probeDir, { recursive: true });

const tool = process.env.PROBE_TOOL;
if (!tool) throw new Error("缺少 PROBE_TOOL");
const args = process.env.PROBE_ARGS ? JSON.parse(process.env.PROBE_ARGS) : {};
const outFile = process.env.PROBE_CALL_OUT || `call-${tool}.json`;

const connection = await connectIfind({ timeoutMs: 120_000 });
try {
  const raw = await connection.callTool(tool, args);
  writeFileSync(resolve(probeDir, outFile), JSON.stringify(raw, null, 2), "utf8");
  const text = typeof raw === "string" ? raw : JSON.stringify(raw);
  console.log(`[${tool}] 返回长度 ${text.length} → ${outFile}`);
  console.log(text.slice(0, 2500));
} finally {
  await connection.close();
}
