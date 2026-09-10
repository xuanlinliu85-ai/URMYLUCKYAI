import { spawn } from "node:child_process";
import path from "node:path";

export async function runArtifactScript(scriptName: string, args: string[]) {
  const node = process.env.RUNTIME_NODE || process.execPath;
  const script = path.join(process.cwd(), "adapters", "native-pptx", scriptName);
  return new Promise<string>((resolve, reject) => {
    const child = spawn(node, [script, ...args], {
      cwd: process.cwd(),
      env: process.env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr || `Artifact script exited ${code}`)));
  });
}

export function parseArtifactJson<T>(stdout: string): T {
  const line = stdout.split(/\r?\n/).reverse().find((value) => value.trim().startsWith("{"));
  if (!line) throw new Error(`Artifact script did not emit JSON: ${stdout.slice(-500)}`);
  return JSON.parse(line) as T;
}
