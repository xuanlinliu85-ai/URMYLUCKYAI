import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = async (relative) => JSON.parse(await readFile(path.join(root, relative), "utf8"));
const registry = await readJson("PROJECT_REGISTRY.json");
const manifest = await readJson("projects/SNAPSHOT_MANIFEST.json");
const schema = await readJson("contracts/research-artifact/research-artifact.schema.json");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(registry.system === "URMYLUCKY Research OS", "Registry system name is invalid");
assert(registry.orchestration?.production_mode === "direct_research_os", "Production mode must be direct_research_os");
assert(registry.orchestration?.production_orchestrator === null, "Production orchestrator must be null");
const deerflow = registry.orchestration?.optional_future_orchestrators?.find((item) => item.id === "deerflow");
assert(deerflow?.status === "deferred", "DeerFlow must be deferred");
const byId = new Map(registry.projects.map((item) => [item.id, item]));
const manifestById = new Map(manifest.projects.map((item) => [item.id, item]));
const gitManagedProjectIds = [
  "daily-review",
  "analyst-dream-team",
  "earnings-analysis",
  "fund-manager",
  "matt",
  "mikko-kevin",
  "ppt-factory",
];

for (const projectId of gitManagedProjectIds) {
  const project = manifestById.get(projectId);
  assert(project?.sync_mode === "git_managed", `${projectId} must be git_managed`);
  assert(project?.canonical === true, `${projectId} must be canonical`);
}

assert(manifestById.get("aa20")?.sync_mode === "frozen_snapshot", "AA20 must remain a frozen snapshot");
assert(manifestById.get("fund-manager")?.status === "prototype", "Fund Manager manifest status must remain prototype");
assert(manifestById.get("aa20")?.status === "isolated_frozen", "AA20 manifest status must remain isolated_frozen");
assert(byId.get("aa20")?.status === "isolated_frozen", "AA20 must be isolated_frozen");
assert(byId.get("fund-manager")?.status === "prototype", "Fund Manager must remain prototype");
assert(!/[A-Za-z]:[\\/](?:Users|Documents)[\\/]/.test(JSON.stringify(registry)), "Registry contains an absolute Windows path");
assert(!/[A-Za-z]:[\\/](?:Users|Documents)[\\/]/.test(JSON.stringify(manifest)), "Snapshot manifest contains an absolute Windows path");
assert(schema.$schema === "https://json-schema.org/draft/2020-12/schema", "Canonical schema draft is invalid");
assert(schema.properties?.schema_version?.const === "1.0.0", "Canonical schema version is invalid");
assert(!existsSync(path.join(root, "pnpm-workspace.yaml")) && !existsSync(path.join(root, "pnpm-lock.yaml")), "Root package manager must remain npm-only");

for (const project of registry.projects) {
  const target = path.resolve(root, project.path);
  assert(target === root || target.startsWith(`${root}${path.sep}`), `Project path escapes repository: ${project.path}`);
  assert((await stat(target)).isDirectory(), `Project path is missing: ${project.path}`);
}

const skillRoots = [
  "projects/analyst-research/.agents/skills",
  "projects/earnings-images/.agents/skills",
];
const activeSkills = [];
for (const relative of skillRoots) {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true });
  activeSkills.push(...entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name));
}
const duplicates = activeSkills.filter((name, index) => activeSkills.indexOf(name) !== index);
assert(duplicates.length === 0, `Duplicate active Skills: ${[...new Set(duplicates)].join(", ")}`);
assert(activeSkills.filter((name) => name !== "earnings-analysis").length === 8, "Analyst Dream Team must expose exactly 8 active Skills");
assert(!activeSkills.some((name) => /deerflow/i.test(name)), "DeerFlow cannot appear in active Skill discovery");

const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
const trackedPrivateEnv = tracked.filter((name) => /(^|\/)\.env($|\.)/.test(name) && !name.endsWith(".env.example"));
assert(trackedPrivateEnv.length === 0, `Tracked private env files: ${trackedPrivateEnv.join(", ")}`);
assert(tracked.every((name) => !name.startsWith("projects/AA20/") || byId.get("aa20")?.status === "isolated_frozen"), "AA20 registry boundary is invalid");

console.log(`Governance: PASS (${registry.projects.length} projects, ${activeSkills.length} active Skills)`);
