import fs from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

const [toolName, encodedArgs = "e30=", outputPath] = process.argv.slice(2);
if (!toolName) throw new Error("Usage: call-tool.mjs <tool-name> [json-args]");

const apiKey = process.env.IFIND_API_KEY;
if (!apiKey) throw new Error("IFIND_API_KEY is not available");

const endpoint = new URL("http://219.141.246.230:5223/sse");
endpoint.searchParams.set("api_key", apiKey);

const client = new Client(
  { name: "codex-ifind-analysis", version: "1.0.0" },
  { capabilities: {} },
);

try {
  await client.connect(new SSEClientTransport(endpoint));
  const result = await client.callTool({
    name: toolName,
    arguments: JSON.parse(Buffer.from(encodedArgs, "base64").toString("utf8")),
  });
  for (const item of result.content ?? []) {
    if (
      item.type === "text" &&
      /(?:ä¸|åŸ|æŠ|è‚|ç§|é‡|Ã|Â)/.test(item.text)
    ) {
      item.text = Buffer.from(item.text, "latin1").toString("utf8");
    }
  }
  const output = JSON.stringify(result, null, 2);
  if (outputPath) {
    await fs.writeFile(outputPath, output, "utf8");
    console.log(`Saved MCP result to ${outputPath}`);
  } else {
    console.log(output);
  }
} finally {
  await client.close();
}
