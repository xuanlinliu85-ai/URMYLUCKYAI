import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const cli = process.env.TCB_CLI_BIN;
const envId = process.env.TCB_TARGET_ENV_ID;
if (!cli || !envId) throw new Error("Missing TCB_CLI_BIN or TCB_TARGET_ENV_ID");

const variables = Object.fromEntries(readFileSync(".env.local", "utf8")
  .split(/\r?\n/)
  .filter((line) => line && !line.startsWith("#"))
  .map((line) => {
    const split = line.indexOf("=");
    return [line.slice(0, split), line.slice(split + 1)];
  }));
const encoded = Object.entries(variables)
  .map(([key, value]) => `${key}=${value.replaceAll("&", "%26").replaceAll("=", "%3D")}`)
  .join("&");

const result = spawnSync(process.execPath, [cli, "run", "service:config", "--env-id", envId, "--serviceName", "friends-table", "--envParams", encoded], { encoding: "utf8" });
let output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
for (const value of Object.values(variables)) {
  output = output.replaceAll(value, "[REDACTED]")
    .replaceAll(value.replaceAll("&", "%26").replaceAll("=", "%3D"), "[REDACTED]");
}
process.stdout.write(output);
process.exit(result.status ?? 1);
