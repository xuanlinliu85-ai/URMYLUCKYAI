import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

const apiKey = process.env.IFIND_API_KEY;
if (!apiKey) {
  throw new Error("IFIND_API_KEY is not available");
}

const endpoint = new URL("http://219.141.246.230:5223/sse");
endpoint.searchParams.set("api_key", apiKey);

const client = new Client(
  { name: "codex-ifind-analysis", version: "1.0.0" },
  { capabilities: {} },
);

try {
  await client.connect(new SSEClientTransport(endpoint));
  const result = await client.listTools();
  console.log(JSON.stringify(result.tools, null, 2));
} finally {
  await client.close();
}
