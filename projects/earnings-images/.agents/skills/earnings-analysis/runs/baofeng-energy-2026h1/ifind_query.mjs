import { connectIfind } from "file:///C:/Users/urmylucky/Documents/%E6%AF%8F%E6%97%A5%E5%A4%8D%E7%9B%98%E6%9B%B4%E6%96%B0/scripts/ifind-mcp-client.mjs";

const [toolName, rawArgs = "{}"] = process.argv.slice(2);
if (!toolName) throw new Error("tool name is required");

const connection = await connectIfind({ timeoutMs: 45_000 });
try {
  const result = await connection.callTool(toolName, JSON.parse(rawArgs));
  process.stdout.write(JSON.stringify(result, null, 2));
} finally {
  await connection.close();
}
