import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

const command = process.argv[2];
if (!new Set(["dev", "build", "start"]).has(command)) {
  throw new Error("Usage: node scripts/run-vinext.mjs <dev|build|start>");
}

const cli = path.resolve("node_modules", "vinext", "dist", "cli.js");
const child = spawn(process.execPath, [cli, command], {
  cwd: process.cwd(),
  env: { ...process.env, WRANGLER_LOG_PATH: ".wrangler/wrangler.log" },
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  if (signal) console.error(`vinext terminated by ${signal}`);
  process.exitCode = code ?? 1;
});
