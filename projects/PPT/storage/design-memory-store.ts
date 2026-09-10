import { randomUUID } from "node:crypto";
import { link, mkdir, open, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { DesignMemoryError, designMemoryHash, validateDesignMemoryProfile, validateDesignMemoryRecommendation, type DesignMemoryProfile, type DesignMemoryRecommendation } from "../lib/design-memory.ts";
import { projectPath } from "./local-store.ts";

const localLocks = new Map<string, Promise<void>>();
const safeId = (value: string, label: string) => {
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) throw new DesignMemoryError(`${label} is invalid`, "INVALID");
  return value;
};
const memoryRoot = (projectId: string, userKey: string) => projectPath(projectId, "analysis", "design-memory", safeId(userKey, "userKey"));
const profileFile = (projectId: string, userKey: string, profileId: string) => path.join(memoryRoot(projectId, userKey), safeId(profileId, "profileId"), "DESIGN_MEMORY_PROFILE.json");
const recommendationFile = (projectId: string, userKey: string, profileId: string, recommendationId: string) =>
  path.join(memoryRoot(projectId, userKey), safeId(profileId, "profileId"), "recommendations", safeId(recommendationId, "recommendationId"), "DESIGN_MEMORY_RECOMMENDATION.json");

async function readJson<T>(file: string) {
  try { return JSON.parse(await readFile(file, "utf8")) as T; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    if (error instanceof SyntaxError) throw new DesignMemoryError(`Design Memory artifact is corrupt: ${path.basename(file)}`, "INTEGRITY");
    throw error;
  }
}
function validateProfile(value: DesignMemoryProfile, projectId: string, userKey: string, profileId: string) {
  return validateDesignMemoryProfile(value, { projectId, userKey, profileId });
}
function validateRecommendation(value: DesignMemoryRecommendation, profile: DesignMemoryProfile, recommendationId: string) {
  return validateDesignMemoryRecommendation(value, profile, recommendationId);
}
async function createOnce(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${randomUUID()}.tmp`);
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(temporary, "wx"); await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8"); await handle.sync(); await handle.close(); handle = undefined;
    try { await link(temporary, file); return true; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const stored = await readJson<unknown>(file);
      if (designMemoryHash(stored) !== designMemoryHash(value)) throw new DesignMemoryError(`Immutable Design Memory identity conflict: ${path.basename(file)}`, "CONFLICT");
      return false;
    }
  } finally { await handle?.close(); await rm(temporary, { force: true }); }
}
async function withPhysicalLock<T>(projectId: string, userKey: string, operation: () => Promise<T>) {
  const root = memoryRoot(projectId, userKey); const key = path.resolve(root); const previous = localLocks.get(key) ?? Promise.resolve(); let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; }); const tail = previous.then(() => gate); localLocks.set(key, tail); await previous;
  const lockFile = path.join(root, "DESIGN_MEMORY.lock"); let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    await mkdir(root, { recursive: true });
    for (let attempt = 0; attempt < 500; attempt += 1) {
      try { handle = await open(lockFile, "wx"); break; }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        let age: number; try { age = Date.now() - (await stat(lockFile)).mtimeMs; } catch (statError) { if ((statError as NodeJS.ErrnoException).code === "ENOENT") continue; throw statError; }
        if (age > 30_000) { await rm(lockFile, { force: true }); continue; }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
    if (!handle) throw new DesignMemoryError("Design Memory repository lock timeout", "CONFLICT");
    return await operation();
  } finally { await handle?.close(); if (handle) await rm(lockFile, { force: true }); release(); if (localLocks.get(key) === tail) localLocks.delete(key); }
}

async function readUnlocked(projectId: string, userKey: string, profileId: string, recommendationId: string) {
  const rawProfile = await readJson<DesignMemoryProfile>(profileFile(projectId, userKey, profileId));
  if (!rawProfile) return undefined;
  const profile = validateProfile(rawProfile, projectId, userKey, profileId);
  const rawRecommendation = await readJson<DesignMemoryRecommendation>(recommendationFile(projectId, userKey, profileId, recommendationId));
  if (!rawRecommendation) throw new DesignMemoryError("Persisted Design Memory recommendation is missing", "INTEGRITY");
  return { profile, recommendation: validateRecommendation(rawRecommendation, profile, recommendationId) };
}
export async function readDesignMemory(projectId: string, userKey: string, profileId: string, recommendationId: string) {
  return withPhysicalLock(projectId, userKey, () => readUnlocked(projectId, userKey, profileId, recommendationId));
}
export async function writeDesignMemory(projectId: string, userKey: string, profile: DesignMemoryProfile, recommendation: DesignMemoryRecommendation) {
  validateProfile(profile, projectId, userKey, profile.profileId); validateRecommendation(recommendation, profile, recommendation.recommendationId);
  return withPhysicalLock(projectId, userKey, async () => {
    const profileCreated = await createOnce(profileFile(projectId, userKey, profile.profileId), profile);
    const recommendationCreated = await createOnce(recommendationFile(projectId, userKey, profile.profileId, recommendation.recommendationId), recommendation);
    return { profile, recommendation, written: profileCreated || recommendationCreated };
  });
}
