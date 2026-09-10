import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.join(process.cwd(), "generated", "projects");

export type ArtifactStage =
  | "input"
  | "analysis"
  | "style"
  | "storyline"
  | "slide-plans"
  | "render"
  | "qa"
  | "output";

export async function ensureProject(projectId: string) {
  for (const stage of [
    "input",
    "analysis",
    "style",
    "storyline",
    "slide-plans",
    "render",
    "qa",
    "output"
  ] satisfies ArtifactStage[]) {
    await mkdir(path.join(ROOT, projectId, stage), { recursive: true });
  }
  return projectPath(projectId);
}

export function projectPath(projectId: string, ...parts: string[]) {
  if (!/^[a-zA-Z0-9_-]+$/.test(projectId)) throw new Error("Invalid project id");
  return path.join(ROOT, projectId, ...parts);
}

export async function writeJson(projectId: string, stage: ArtifactStage, name: string, value: unknown) {
  await ensureProject(projectId);
  const file = projectPath(projectId, stage, `${name}.json`);
  await writeFile(file, JSON.stringify(value, null, 2), "utf8");
  return file;
}

export async function readJson<T>(projectId: string, stage: ArtifactStage, name: string): Promise<T> {
  return JSON.parse(await readFile(projectPath(projectId, stage, `${name}.json`), "utf8")) as T;
}

export async function saveUpload(projectId: string, filename: string, bytes: Uint8Array) {
  await ensureProject(projectId);
  const safeName = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, "_");
  const target = projectPath(projectId, "input", safeName);
  await writeFile(target, bytes);
  return target;
}
