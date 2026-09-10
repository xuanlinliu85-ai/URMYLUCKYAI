import { runIfindCompatibilityAudit } from "./ifind-mcp-client.mjs";

const audit = await runIfindCompatibilityAudit({ allowMissing: true });
console.log(JSON.stringify(audit, null, 2));
if (audit.status === "error") process.exitCode = 1;
