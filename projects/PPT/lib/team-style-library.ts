import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { GoldenSlideCandidate } from "@/lib/types";
import type { StylePackVersion } from "@/lib/style-packs";
import { validateBrandPolicyVersion, type BrandPolicyVersion } from "./brand-policy.ts";

export const TEAM_LIBRARY_SCHEMA = "ppt-factory/team-style-library/v1" as const;
export const TEAM_ARTIFACT_SCHEMA = "ppt-factory/team-style-artifact-version/v1" as const;
export const TEAM_GOLDEN_SNAPSHOT_SCHEMA = "ppt-factory/team-golden-slide-snapshot/v1" as const;
export const LOCAL_TEAM_LIBRARY_IDENTITY_FLAG = "PPT_FACTORY_TEAM_LIBRARY_ALLOW_LOCAL_IDENTITY" as const;

export function isTrustedLocalTeamLibraryIdentityEnabled(environment: Record<string, string | undefined> = process.env) {
  return environment[LOCAL_TEAM_LIBRARY_IDENTITY_FLAG] === "true";
}

export type TeamRole = "owner" | "editor" | "viewer";
export type TeamArtifactType = "style_pack" | "golden_slide" | "brand_policy";
export type TeamArtifactState = "published" | "archived";

export type TeamLibraryScope = {
  tenantId: string;
  teamId: string;
};

export type TeamLibraryActor = TeamLibraryScope & {
  userId: string;
};

export type TeamMember = {
  userId: string;
  role: TeamRole;
  addedBy: string;
  addedAt: string;
  updatedBy: string;
  updatedAt: string;
};

export type TeamGoldenSlideSnapshot = {
  schema: typeof TEAM_GOLDEN_SNAPSHOT_SCHEMA;
  referenceStyleId: string;
  sourceFile: string;
  candidate: GoldenSlideCandidate;
};

export type TeamArtifactContent = StylePackVersion | TeamGoldenSlideSnapshot | BrandPolicyVersion;

export type TeamArtifactProvenance = {
  sourceProjectId?: string;
  sourceArtifactId: string;
  sourceVersion?: string;
  sourceContentHash?: string;
  parentVersion: string | null;
  parentContentHash: string | null;
  publishedBy: string;
  publishedAt: string;
};

export type TeamArtifactVersion = {
  schema: typeof TEAM_ARTIFACT_SCHEMA;
  tenantId: string;
  teamId: string;
  artifactType: TeamArtifactType;
  artifactId: string;
  version: string;
  name: string;
  state: TeamArtifactState;
  contentHash: string;
  content: TeamArtifactContent;
  provenance: TeamArtifactProvenance;
  archivedBy?: string;
  archivedAt?: string;
};

export type TeamStyleLibrary = TeamLibraryScope & {
  schema: typeof TEAM_LIBRARY_SCHEMA;
  name: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  members: TeamMember[];
  artifacts: TeamArtifactVersion[];
};

export interface TeamStyleLibraryRepository {
  read(scope: TeamLibraryScope): Promise<TeamStyleLibrary | undefined>;
  create(library: TeamStyleLibrary): Promise<void>;
  write(library: TeamStyleLibrary, expectedRevision: number): Promise<void>;
}

const localScopeLocks = new Map<string, Promise<void>>();

export class LocalTeamStyleLibraryRepository implements TeamStyleLibraryRepository {
  private readonly root: string;

  constructor(root = path.join(process.cwd(), "generated", "team-style-library")) {
    this.root = root;
  }

  async read(scope: TeamLibraryScope) {
    return this.withScopeLock(scope, () => this.readUnlocked(scope));
  }

  async create(library: TeamStyleLibrary) {
    return this.withScopeLock(library, async () => {
      const existing = await this.readUnlocked(library);
      if (existing) throw new TeamLibraryError("Team Style Library already exists", "CONFLICT");
      await this.atomicWrite(validateTeamStyleLibrary(library));
    });
  }

  async write(library: TeamStyleLibrary, expectedRevision: number) {
    return this.withScopeLock(library, async () => {
      const existing = await this.readUnlocked(library);
      if (!existing) throw new TeamLibraryError("Team Style Library not found", "NOT_FOUND");
      if (existing.revision !== expectedRevision) throw new TeamLibraryError("Team Style Library revision conflict", "CONFLICT");
      if (library.revision !== expectedRevision + 1) throw new TeamLibraryError("Team Style Library revision must increment by one", "INVALID");
      const next = validateTeamStyleLibrary(library);
      for (const prior of existing.artifacts) {
        const current = next.artifacts.find((artifact) => artifactKey(artifact) === artifactKey(prior));
        if (!current || current.contentHash !== prior.contentHash) {
          throw new TeamLibraryError(`Immutable artifact version cannot be removed or replaced: ${artifactKey(prior)}`, "CONFLICT");
        }
        if (JSON.stringify(canonicalize(current.provenance)) !== JSON.stringify(canonicalize(prior.provenance))) {
          throw new TeamLibraryError(`Artifact publication provenance is immutable: ${artifactKey(prior)}`, "CONFLICT");
        }
        if (prior.state === "archived" && current.state !== "archived") {
          throw new TeamLibraryError(`Archived artifact version cannot be republished: ${artifactKey(prior)}`, "CONFLICT");
        }
        if (prior.state === "archived" && (current.archivedBy !== prior.archivedBy || current.archivedAt !== prior.archivedAt)) {
          throw new TeamLibraryError(`Artifact archive provenance is immutable: ${artifactKey(prior)}`, "CONFLICT");
        }
      }
      await this.atomicWrite(next);
    });
  }

  private async readUnlocked(scope: TeamLibraryScope) {
    const file = this.file(scope);
    try {
      return validateTeamStyleLibrary(JSON.parse(await readFile(file, "utf8")) as TeamStyleLibrary);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }

  private async withScopeLock<T>(scope: TeamLibraryScope, operation: () => Promise<T>) {
    const key = `${path.resolve(this.root)}\u0000${scope.tenantId}\u0000${scope.teamId}`;
    const previous = localScopeLocks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const tail = previous.then(() => gate);
    localScopeLocks.set(key, tail);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (localScopeLocks.get(key) === tail) localScopeLocks.delete(key);
    }
  }

  private file(scope: TeamLibraryScope) {
    assertTeamId(scope.tenantId, "tenantId");
    assertTeamId(scope.teamId, "teamId");
    return path.join(this.root, scope.tenantId, scope.teamId, "TEAM_STYLE_LIBRARY.json");
  }

  private async atomicWrite(library: TeamStyleLibrary) {
    const file = this.file(library);
    await mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify(library, null, 2)}\n`, "utf8");
      await rename(temporary, file);
    } finally {
      await rm(temporary, { force: true });
    }
  }
}

export class TeamLibraryError extends Error {
  readonly code: "INVALID" | "NOT_FOUND" | "FORBIDDEN" | "CONFLICT";

  constructor(message: string, code: "INVALID" | "NOT_FOUND" | "FORBIDDEN" | "CONFLICT") {
    super(message);
    this.code = code;
  }
}

const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const ARTIFACT_ID_PATTERN = /^[a-zA-Z0-9_\-\u3400-\u9fff]+$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const normalizeText = (value: string) => value.normalize("NFKC").trim().replace(/\s+/g, " ");

export function assertTeamId(value: string, label: string) {
  if (typeof value !== "string" || value.length > 80 || !ID_PATTERN.test(value)) {
    throw new TeamLibraryError(`${label} contains unsupported characters`, "INVALID");
  }
}

function assertArtifactId(value: string, label: string) {
  if (typeof value !== "string" || value.length > 120 || !ARTIFACT_ID_PATTERN.test(value)) {
    throw new TeamLibraryError(`${label} contains unsupported characters`, "INVALID");
  }
}

export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([key, item]) => [key, canonicalize(item)]));
  }
  return value;
}

export function teamArtifactDigest(value: Pick<TeamArtifactVersion,
  "tenantId" | "teamId" | "artifactType" | "artifactId" | "version" | "name" | "content" | "provenance"
>) {
  const immutable = {
    tenantId: value.tenantId,
    teamId: value.teamId,
    artifactType: value.artifactType,
    artifactId: value.artifactId,
    version: value.version,
    name: value.name,
    content: value.content,
    provenance: {
      sourceProjectId: value.provenance.sourceProjectId,
      sourceArtifactId: value.provenance.sourceArtifactId,
      sourceVersion: value.provenance.sourceVersion,
      sourceContentHash: value.provenance.sourceContentHash,
      parentVersion: value.provenance.parentVersion,
      parentContentHash: value.provenance.parentContentHash
    }
  };
  return createHash("sha256").update(JSON.stringify(canonicalize(immutable))).digest("hex");
}

function artifactKey(value: Pick<TeamArtifactVersion, "artifactType" | "artifactId" | "version">) {
  return `${value.artifactType}:${value.artifactId}@${value.version}`;
}

function compareVersions(left: string, right: string) {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) if (a[index] !== b[index]) return a[index] - b[index];
  return 0;
}

function sortLibrary(library: TeamStyleLibrary): TeamStyleLibrary {
  return {
    ...library,
    members: [...library.members].sort((a, b) => a.userId.localeCompare(b.userId, "en")),
    artifacts: [...library.artifacts].sort((a, b) => a.artifactType.localeCompare(b.artifactType, "en")
      || a.artifactId.localeCompare(b.artifactId, "en")
      || compareVersions(b.version, a.version))
  };
}

function assertVersion(version: string) {
  if (typeof version !== "string" || !VERSION_PATTERN.test(version)) throw new TeamLibraryError(`Invalid semantic version: ${version}`, "INVALID");
}

function assertTimestamp(value: string, label: string) {
  if (typeof value !== "string" || !value || !Number.isFinite(Date.parse(value))) {
    throw new TeamLibraryError(`${label} must be a valid timestamp`, "INVALID");
  }
}

function assertArtifactType(artifactType: string): asserts artifactType is TeamArtifactType {
  if (artifactType !== "style_pack" && artifactType !== "golden_slide" && artifactType !== "brand_policy") {
    throw new TeamLibraryError("Invalid team artifact type", "INVALID");
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

const STYLE_DIMENSIONS = ["typography", "color", "layout", "chart", "density", "composition", "storytelling", "visualTone"] as const;
const GOLDEN_ROLES = new Set(["cover", "agenda_section", "summary", "evidence_data", "comparison", "process_timeline", "closing", "other"]);
const GOLDEN_LAYOUTS = new Set(["COVER", "SECTION", "EXEC_SUMMARY", "DATA_LEFT_TEXT_RIGHT", "TEXT_LEFT_DATA_RIGHT", "FULL_CHART", "FULL_TABLE", "BIG_NUMBER", "TWO_COLUMN", "HERO_IMAGE", "COMPARISON", "PROCESS_TIMELINE", "OTHER"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertOnlyKeys(value: Record<string, unknown>, keys: string[], label: string) {
  const allowed = new Set(keys);
  if (Object.keys(value).some((key) => !allowed.has(key))) throw new TeamLibraryError(`${label} contains unsupported fields`, "INVALID");
}

function assertStringArray(value: unknown, label: string) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new TeamLibraryError(`${label} must be a string array`, "INVALID");
}

function assertObject(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw new TeamLibraryError(`${label} must be an object`, "INVALID");
}

function assertSourceWeights(value: unknown, label: string) {
  assertObject(value, label);
  assertOnlyKeys(value, ["reference", "system", "prompt"], label);
  for (const source of ["reference", "system", "prompt"]) {
    const weight = value[source];
    if (typeof weight !== "number" || !Number.isFinite(weight) || weight < 0 || weight > 100) {
      throw new TeamLibraryError(`${label}.${source} must be between 0 and 100`, "INVALID");
    }
  }
}

function assertMixerContracts(weights: unknown, locks: unknown, ownership: unknown, label: string) {
  assertObject(weights, `${label}.weights`);
  assertObject(locks, `${label}.locks`);
  assertObject(ownership, `${label}.resolvedOwnership`);
  assertOnlyKeys(weights, [...STYLE_DIMENSIONS], `${label}.weights`);
  assertOnlyKeys(locks, [...STYLE_DIMENSIONS], `${label}.locks`);
  assertOnlyKeys(ownership, [...STYLE_DIMENSIONS], `${label}.resolvedOwnership`);
  for (const dimension of STYLE_DIMENSIONS) {
    assertSourceWeights(weights[dimension], `${label}.weights.${dimension}`);
    if (typeof locks[dimension] !== "boolean") throw new TeamLibraryError(`${label}.locks.${dimension} must be boolean`, "INVALID");
    const resolution = ownership[dimension];
    assertObject(resolution, `${label}.resolvedOwnership.${dimension}`);
    assertOnlyKeys(resolution, ["owner", "weights", "locked"], `${label}.resolvedOwnership.${dimension}`);
    if (!["reference", "system", "prompt"].includes(String(resolution.owner)) || typeof resolution.locked !== "boolean") {
      throw new TeamLibraryError(`${label}.resolvedOwnership.${dimension} is invalid`, "INVALID");
    }
    assertSourceWeights(resolution.weights, `${label}.resolvedOwnership.${dimension}.weights`);
  }
}

function assertStyleDna(value: unknown) {
  assertObject(value, "Style Pack style");
  assertOnlyKeys(value, ["styleId", "name", "sourceType", "version", "styleVector", "typography", "colors", "grid",
    "composition", "charts", "visuals", "storytelling", "density", "measurements", "preferredLayouts", "antiPatterns",
    "referenceSlideRoles", "referenceLayoutFamilies", "layoutFamilySummaries", "promptInterpretation"], "Style Pack style");
  if (typeof value.styleId !== "string" || typeof value.name !== "string" || typeof value.version !== "string"
    || !["reference", "system", "prompt", "hybrid"].includes(String(value.sourceType))) {
    throw new TeamLibraryError("Style Pack Style DNA identity is invalid", "INVALID");
  }
  for (const field of ["typography", "colors", "grid", "composition", "charts", "visuals", "storytelling", "density"]) {
    assertObject(value[field], `Style Pack style.${field}`);
  }
  assertObject(value.styleVector, "Style Pack style.styleVector");
  if (Object.values(value.styleVector).some((item) => typeof item !== "number" || !Number.isFinite(item) || item < 0 || item > 1)) {
    throw new TeamLibraryError("Style Pack style vector must contain ratios", "INVALID");
  }
  assertStringArray(value.preferredLayouts, "Style Pack style.preferredLayouts");
  assertStringArray(value.antiPatterns, "Style Pack style.antiPatterns");
}

function assertStyleMix(value: unknown) {
  assertObject(value, "Style Pack styleMix");
  assertOnlyKeys(value, ["previewSet", "sources", "controls", "weights", "locks", "resolvedOwnership", "finalStyleId",
    "finalStyle", "promptInterpretation", "generatedAt"], "Style Pack styleMix");
  if (typeof value.previewSet !== "string" || typeof value.finalStyleId !== "string" || typeof value.generatedAt !== "string") {
    throw new TeamLibraryError("Style Pack Style Mix identity is invalid", "INVALID");
  }
  assertObject(value.sources, "Style Pack styleMix.sources");
  assertOnlyKeys(value.sources, ["referenceStyleId", "systemStyleId", "promptStyleId", "promptText"], "Style Pack styleMix.sources");
  if (typeof value.sources.referenceStyleId !== "string" || typeof value.sources.systemStyleId !== "string") {
    throw new TeamLibraryError("Style Pack Style Mix sources are incomplete", "INVALID");
  }
  for (const optionalSource of ["promptStyleId", "promptText"]) {
    if (value.sources[optionalSource] !== undefined && typeof value.sources[optionalSource] !== "string") {
      throw new TeamLibraryError(`Style Pack Style Mix source ${optionalSource} is invalid`, "INVALID");
    }
  }
  assertObject(value.controls, "Style Pack styleMix.controls");
  assertOnlyKeys(value.controls, ["referenceStrength", "minimalism", "modernity", "airiness", "visualWeight", "technologyTone",
    "visualImpact", "locks", "advancedMixer"], "Style Pack styleMix.controls");
  for (const control of ["referenceStrength", "minimalism", "modernity", "airiness", "visualWeight", "technologyTone", "visualImpact"]) {
    const setting = value.controls[control];
    if (typeof setting !== "number" || !Number.isInteger(setting) || setting < 0 || setting > 100) throw new TeamLibraryError(`Style Pack control ${control} is invalid`, "INVALID");
  }
  assertObject(value.controls.locks, "Style Pack styleMix.controls.locks");
  assertOnlyKeys(value.controls.locks, ["typography", "colors", "layout", "chart", "density", "composition", "storytelling", "visualTone"], "Style Pack styleMix.controls.locks");
  for (const legacyLock of ["typography", "colors", "layout"]) {
    if (typeof value.controls.locks[legacyLock] !== "boolean") throw new TeamLibraryError(`Style Pack legacy lock ${legacyLock} is invalid`, "INVALID");
  }
  if (value.controls.advancedMixer !== undefined) {
    assertObject(value.controls.advancedMixer, "Style Pack styleMix.controls.advancedMixer");
    assertOnlyKeys(value.controls.advancedMixer, ["weights", "locks"], "Style Pack styleMix.controls.advancedMixer");
    assertObject(value.controls.advancedMixer.weights, "Style Pack styleMix.controls.advancedMixer.weights");
    assertObject(value.controls.advancedMixer.locks, "Style Pack styleMix.controls.advancedMixer.locks");
    assertOnlyKeys(value.controls.advancedMixer.weights, [...STYLE_DIMENSIONS], "Style Pack styleMix.controls.advancedMixer.weights");
    assertOnlyKeys(value.controls.advancedMixer.locks, [...STYLE_DIMENSIONS], "Style Pack styleMix.controls.advancedMixer.locks");
    for (const dimension of STYLE_DIMENSIONS) {
      assertSourceWeights(value.controls.advancedMixer.weights[dimension], `Style Pack styleMix.controls.advancedMixer.weights.${dimension}`);
      if (typeof value.controls.advancedMixer.locks[dimension] !== "boolean") throw new TeamLibraryError(`Style Pack advanced lock ${dimension} is invalid`, "INVALID");
    }
  }
  assertMixerContracts(value.weights, value.locks, value.resolvedOwnership, "Style Pack styleMix");
  assertStyleDna(value.finalStyle);
  if ((value.finalStyle as Record<string, unknown>).styleId !== value.finalStyleId) throw new TeamLibraryError("Style Mix finalStyleId mismatch", "INVALID");
}

function assertImmutableStylePack(pack: StylePackVersion) {
  if (!pack || typeof pack !== "object") throw new TeamLibraryError("A complete immutable Style Pack version is required", "INVALID");
  assertOnlyKeys(pack as unknown as Record<string, unknown>, ["schema", "id", "version", "name", "styleId", "contentHash", "tags",
    "roles", "layoutFamilies", "densities", "hasCharts", "chartTypes", "audienceTags", "active", "previews",
    "preferredLayouts", "chartRules", "typography", "imageDirection", "antiPatterns", "examplePrompts", "provenance",
    "styleMix", "style"], "Style Pack version");
  const requiredArrays = [pack.tags, pack.roles, pack.layoutFamilies, pack.densities, pack.chartTypes,
    pack.audienceTags, pack.preferredLayouts, pack.antiPatterns, pack.examplePrompts];
  if (pack.schema !== "ppt-factory/style-pack/v1" || typeof pack.id !== "string" || typeof pack.version !== "string"
    || typeof pack.name !== "string" || typeof pack.styleId !== "string" || !pack.id || !pack.version || !pack.name || !pack.styleId
    || !pack.previews || !pack.provenance || !pack.styleMix || !pack.style || requiredArrays.some((item) => !Array.isArray(item))) {
    throw new TeamLibraryError("A complete immutable Style Pack version is required", "INVALID");
  }
  assertArtifactId(pack.id, "Style Pack id");
  assertVersion(pack.version);
  for (const [label, values] of [["tags", pack.tags], ["roles", pack.roles], ["layoutFamilies", pack.layoutFamilies],
    ["chartTypes", pack.chartTypes], ["audienceTags", pack.audienceTags], ["preferredLayouts", pack.preferredLayouts],
    ["antiPatterns", pack.antiPatterns], ["examplePrompts", pack.examplePrompts]] as const) assertStringArray(values, `Style Pack ${label}`);
  if (pack.densities.some((density) => !["sparse", "balanced", "dense"].includes(density))) throw new TeamLibraryError("Style Pack density is invalid", "INVALID");
  if (typeof pack.hasCharts !== "boolean" || typeof pack.active !== "boolean") throw new TeamLibraryError("Style Pack flags are invalid", "INVALID");
  assertObject(pack.previews, "Style Pack previews");
  assertOnlyKeys(pack.previews, ["cover", "executiveSummary", "dataSlide"], "Style Pack previews");
  if ([pack.previews.cover, pack.previews.executiveSummary, pack.previews.dataSlide].some((item) => typeof item !== "string")) {
    throw new TeamLibraryError("Style Pack previews are invalid", "INVALID");
  }
  for (const [label, value] of [["chartRules", pack.chartRules], ["typography", pack.typography], ["imageDirection", pack.imageDirection]] as const) {
    assertObject(value, `Style Pack ${label}`);
  }
  assertObject(pack.provenance, "Style Pack provenance");
  assertOnlyKeys(pack.provenance, ["previewSet", "sources", "weights", "locks", "resolvedOwnership", "promptInterpretation"], "Style Pack provenance");
  if (typeof pack.provenance.previewSet !== "string") throw new TeamLibraryError("Style Pack provenance preview set is invalid", "INVALID");
  assertObject(pack.provenance.sources, "Style Pack provenance sources");
  assertMixerContracts(pack.provenance.weights, pack.provenance.locks, pack.provenance.resolvedOwnership, "Style Pack provenance");
  assertStyleMix(pack.styleMix);
  assertStyleDna(pack.style);
  if (pack.styleId !== pack.style.styleId || pack.styleMix.finalStyleId !== pack.styleId
    || JSON.stringify(canonicalize(pack.style)) !== JSON.stringify(canonicalize(pack.styleMix.finalStyle))
    || pack.provenance.previewSet !== pack.styleMix.previewSet
    || JSON.stringify(canonicalize(pack.provenance.sources)) !== JSON.stringify(canonicalize(pack.styleMix.sources))
    || JSON.stringify(canonicalize(pack.provenance.weights)) !== JSON.stringify(canonicalize(pack.styleMix.weights))
    || JSON.stringify(canonicalize(pack.provenance.locks)) !== JSON.stringify(canonicalize(pack.styleMix.locks))
    || JSON.stringify(canonicalize(pack.provenance.resolvedOwnership)) !== JSON.stringify(canonicalize(pack.styleMix.resolvedOwnership))
    || JSON.stringify(canonicalize(pack.provenance.promptInterpretation)) !== JSON.stringify(canonicalize(pack.styleMix.promptInterpretation))
    || JSON.stringify(canonicalize(pack.preferredLayouts)) !== JSON.stringify(canonicalize(pack.style.preferredLayouts))
    || JSON.stringify(canonicalize(pack.chartRules)) !== JSON.stringify(canonicalize(pack.style.charts))
    || JSON.stringify(canonicalize(pack.typography)) !== JSON.stringify(canonicalize(pack.style.typography))
    || JSON.stringify(canonicalize(pack.imageDirection)) !== JSON.stringify(canonicalize(pack.style.visuals))
    || JSON.stringify(canonicalize(pack.antiPatterns)) !== JSON.stringify(canonicalize(pack.style.antiPatterns))) {
    throw new TeamLibraryError("Style Pack snapshot contracts do not agree", "INVALID");
  }
  const { contentHash, ...payload } = pack;
  const expected = createHash("sha256").update(JSON.stringify(canonicalize(payload))).digest("hex");
  if (!contentHash || expected !== contentHash) {
    throw new TeamLibraryError("Style Pack content hash is missing or invalid", "INVALID");
  }
}

function assertGoldenSnapshot(snapshot: TeamGoldenSlideSnapshot) {
  if (!snapshot || typeof snapshot !== "object") throw new TeamLibraryError("An eligible Golden Slide snapshot is required", "INVALID");
  const rawSnapshot = snapshot as unknown as Record<string, unknown>;
  assertOnlyKeys(rawSnapshot, ["schema", "referenceStyleId", "sourceFile", "candidate"], "Golden Slide snapshot");
  if (snapshot.schema !== TEAM_GOLDEN_SNAPSHOT_SCHEMA || typeof snapshot.referenceStyleId !== "string" || !snapshot.referenceStyleId
    || typeof snapshot.sourceFile !== "string" || !snapshot.sourceFile || !snapshot.candidate || typeof snapshot.candidate !== "object") {
    throw new TeamLibraryError("An eligible Golden Slide snapshot is required", "INVALID");
  }
  const candidate = snapshot.candidate as unknown as Record<string, unknown>;
  assertOnlyKeys(candidate, ["id", "sourceSlide", "role", "layoutFamily", "density", "hasChart", "score", "candidateThreshold", "eligible", "dimensionScores", "evidence"], "Golden Slide candidate");
  assertArtifactId(candidate.id as string, "Golden Slide id");
  if (typeof candidate.sourceSlide !== "number" || !Number.isInteger(candidate.sourceSlide) || candidate.sourceSlide < 1
    || !GOLDEN_ROLES.has(String(candidate.role)) || !GOLDEN_LAYOUTS.has(String(candidate.layoutFamily))
    || !["sparse", "balanced", "dense"].includes(String(candidate.density)) || typeof candidate.hasChart !== "boolean" || candidate.eligible !== true) {
    throw new TeamLibraryError("Golden Slide candidate shape is invalid", "INVALID");
  }
  for (const field of ["score", "candidateThreshold"]) {
    const score = candidate[field];
    if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 100) throw new TeamLibraryError(`Golden Slide ${field} is invalid`, "INVALID");
  }
  assertObject(candidate.dimensionScores, "Golden Slide dimensionScores");
  assertOnlyKeys(candidate.dimensionScores, ["layoutQuality", "clarity", "reusability", "styleRepresentativeness", "hierarchy", "balance"], "Golden Slide dimensionScores");
  for (const field of ["layoutQuality", "clarity", "reusability", "styleRepresentativeness", "hierarchy", "balance"]) {
    const score = candidate.dimensionScores[field];
    if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 100) throw new TeamLibraryError(`Golden Slide dimension ${field} is invalid`, "INVALID");
  }
  assertStringArray(candidate.evidence, "Golden Slide evidence");
}

export function validateTeamStyleLibrary(value: TeamStyleLibrary) {
  if (!value || typeof value !== "object" || value.schema !== TEAM_LIBRARY_SCHEMA || !Array.isArray(value.members) || !Array.isArray(value.artifacts)) {
    throw new TeamLibraryError("Unsupported Team Style Library schema", "INVALID");
  }
  assertOnlyKeys(value as unknown as Record<string, unknown>, ["schema", "tenantId", "teamId", "name", "revision", "createdAt", "updatedAt", "members", "artifacts"], "Team Style Library");
  assertTeamId(value.tenantId, "tenantId");
  assertTeamId(value.teamId, "teamId");
  if (typeof value.name !== "string" || !normalizeText(value.name) || !Number.isInteger(value.revision) || value.revision < 1) {
    throw new TeamLibraryError("Invalid team library metadata", "INVALID");
  }
  assertTimestamp(value.createdAt, "createdAt");
  assertTimestamp(value.updatedAt, "updatedAt");
  const memberIds = new Set<string>();
  for (const member of value.members) {
    if (!member || typeof member !== "object") throw new TeamLibraryError("Invalid team member", "INVALID");
    assertOnlyKeys(member as unknown as Record<string, unknown>, ["userId", "role", "addedBy", "addedAt", "updatedBy", "updatedAt"], "Team member");
    assertTeamId(member.userId, "userId");
    assertTeamId(member.addedBy, "addedBy");
    assertTeamId(member.updatedBy, "updatedBy");
    assertTimestamp(member.addedAt, "member.addedAt");
    assertTimestamp(member.updatedAt, "member.updatedAt");
    if (!(["owner", "editor", "viewer"] as TeamRole[]).includes(member.role)) throw new TeamLibraryError("Invalid team role", "INVALID");
    if (memberIds.has(member.userId)) throw new TeamLibraryError(`Duplicate member: ${member.userId}`, "INVALID");
    memberIds.add(member.userId);
  }
  if (!value.members.some((member) => member.role === "owner")) throw new TeamLibraryError("Team must retain at least one owner", "INVALID");
  const keys = new Set<string>();
  for (const artifact of value.artifacts) {
    if (!artifact || typeof artifact !== "object") throw new TeamLibraryError("Invalid team artifact version", "INVALID");
    assertOnlyKeys(artifact as unknown as Record<string, unknown>, ["schema", "tenantId", "teamId", "artifactType", "artifactId", "version", "name", "state",
      "contentHash", "content", "provenance", "archivedBy", "archivedAt"], "Team artifact version");
    if (artifact.schema !== TEAM_ARTIFACT_SCHEMA || artifact.tenantId !== value.tenantId || artifact.teamId !== value.teamId) {
      throw new TeamLibraryError("Artifact scope or schema does not match its team library", "INVALID");
    }
    assertArtifactType(artifact.artifactType);
    assertArtifactId(artifact.artifactId, "artifactId");
    assertVersion(artifact.version);
    if (typeof artifact.name !== "string" || !normalizeText(artifact.name)) throw new TeamLibraryError("Artifact name is required", "INVALID");
    if (artifact.state !== "published" && artifact.state !== "archived") throw new TeamLibraryError("Invalid artifact state", "INVALID");
    if (artifact.state === "archived" && (!artifact.archivedBy || !artifact.archivedAt)) throw new TeamLibraryError("Archived artifact is missing archive provenance", "INVALID");
    if (artifact.state === "published" && (artifact.archivedBy !== undefined || artifact.archivedAt !== undefined)) {
      throw new TeamLibraryError("Published artifact cannot contain archive provenance", "INVALID");
    }
    if (!artifact.provenance?.sourceArtifactId || !artifact.provenance.publishedBy || !artifact.provenance.publishedAt) {
      throw new TeamLibraryError("Artifact is missing publication provenance", "INVALID");
    }
    assertOnlyKeys(artifact.provenance as unknown as Record<string, unknown>, ["sourceProjectId", "sourceArtifactId", "sourceVersion", "sourceContentHash",
      "parentVersion", "parentContentHash", "publishedBy", "publishedAt"], "Team artifact provenance");
    assertArtifactId(artifact.provenance.sourceArtifactId, "sourceArtifactId");
    assertTeamId(artifact.provenance.publishedBy, "publishedBy");
    assertTimestamp(artifact.provenance.publishedAt, "publishedAt");
    if (artifact.provenance.sourceVersion) assertVersion(artifact.provenance.sourceVersion);
    if (artifact.provenance.sourceContentHash && !HASH_PATTERN.test(artifact.provenance.sourceContentHash)) {
      throw new TeamLibraryError("Invalid source content hash", "INVALID");
    }
    if ((artifact.provenance.parentVersion === null) !== (artifact.provenance.parentContentHash === null)) {
      throw new TeamLibraryError("Artifact parent version and hash must both be null or both be present", "INVALID");
    }
    if (artifact.provenance.parentVersion !== null) assertVersion(artifact.provenance.parentVersion);
    if (artifact.provenance.parentContentHash !== null && !HASH_PATTERN.test(artifact.provenance.parentContentHash)) {
      throw new TeamLibraryError("Invalid parent content hash", "INVALID");
    }
    if (artifact.state === "archived") {
      assertTeamId(artifact.archivedBy as string, "archivedBy");
      assertTimestamp(artifact.archivedAt as string, "archivedAt");
    }
    if (artifact.artifactType === "style_pack") {
      const pack = artifact.content as StylePackVersion;
      assertImmutableStylePack(pack);
      if (pack.id !== artifact.artifactId || pack.version !== artifact.version
        || artifact.provenance.sourceArtifactId !== pack.id || artifact.provenance.sourceVersion !== pack.version
        || artifact.provenance.sourceContentHash !== pack.contentHash) {
        throw new TeamLibraryError("Style Pack content or provenance does not match its team artifact version", "INVALID");
      }
    }
    if (artifact.artifactType === "golden_slide") {
      const snapshot = artifact.content as TeamGoldenSlideSnapshot;
      assertGoldenSnapshot(snapshot);
      if (snapshot.candidate.id !== artifact.artifactId || artifact.provenance.sourceArtifactId !== snapshot.candidate.id) {
        throw new TeamLibraryError("Golden Slide content does not match its team artifact version", "INVALID");
      }
    }
    if (artifact.artifactType === "brand_policy") {
      const policy = validateBrandPolicyVersion(artifact.content as BrandPolicyVersion);
      if (policy.policyId !== artifact.artifactId || policy.version !== artifact.version
        || policy.tenantId !== artifact.tenantId || policy.teamId !== artifact.teamId
        || artifact.provenance.sourceArtifactId !== policy.policyId || artifact.provenance.sourceVersion !== policy.version
        || artifact.provenance.sourceContentHash !== policy.contentHash) {
        throw new TeamLibraryError("Brand Policy content or provenance does not match its team artifact version", "INVALID");
      }
    }
    const key = artifactKey(artifact);
    if (keys.has(key)) throw new TeamLibraryError(`Duplicate artifact version: ${key}`, "INVALID");
    keys.add(key);
    if (teamArtifactDigest(artifact) !== artifact.contentHash) throw new TeamLibraryError(`Artifact content hash mismatch: ${key}`, "INVALID");
  }
  const chains = new Map<string, TeamArtifactVersion[]>();
  for (const artifact of value.artifacts) {
    const key = `${artifact.artifactType}:${artifact.artifactId}`;
    chains.set(key, [...(chains.get(key) ?? []), artifact]);
  }
  for (const [key, chain] of chains) {
    chain.sort((left, right) => compareVersions(left.version, right.version));
    for (let index = 0; index < chain.length; index += 1) {
      const artifact = chain[index];
      const parent = chain[index - 1];
      if (!parent && (artifact.provenance.parentVersion !== null || artifact.provenance.parentContentHash !== null)) {
        throw new TeamLibraryError(`Artifact chain has a missing first parent: ${key}`, "INVALID");
      }
      if (parent && (artifact.provenance.parentVersion !== parent.version || artifact.provenance.parentContentHash !== parent.contentHash)) {
        throw new TeamLibraryError(`Artifact chain lineage mismatch: ${artifactKey(artifact)}`, "INVALID");
      }
      if (artifact.artifactType === "brand_policy") {
        const policy = artifact.content as BrandPolicyVersion;
        const parentPolicy = parent?.content as BrandPolicyVersion | undefined;
        if (!parentPolicy && (policy.provenance.parentVersion !== null || policy.provenance.parentContentHash !== null)) {
          throw new TeamLibraryError(`Brand Policy chain has a missing first parent: ${key}`, "INVALID");
        }
        if (parentPolicy && (policy.provenance.parentVersion !== parentPolicy.version
          || policy.provenance.parentContentHash !== parentPolicy.contentHash)) {
          throw new TeamLibraryError(`Brand Policy content lineage mismatch: ${artifactKey(artifact)}`, "INVALID");
        }
      }
    }
  }
  return sortLibrary(clone(value));
}

type PublishCommon = {
  name?: string;
  sourceProjectId?: string;
};

export class TeamStyleLibraryService {
  private readonly repository: TeamStyleLibraryRepository;
  private readonly now: () => string;

  constructor(
    repository: TeamStyleLibraryRepository,
    now: () => string = () => new Date().toISOString()
  ) {
    this.repository = repository;
    this.now = now;
  }

  async createTeam(actor: TeamLibraryActor, name: string) {
    this.assertActor(actor);
    if (typeof name !== "string") throw new TeamLibraryError("Team name is required", "INVALID");
    const normalizedName = normalizeText(name);
    if (!normalizedName) throw new TeamLibraryError("Team name is required", "INVALID");
    const timestamp = this.now();
    const library: TeamStyleLibrary = {
      schema: TEAM_LIBRARY_SCHEMA,
      tenantId: actor.tenantId,
      teamId: actor.teamId,
      name: normalizedName,
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      members: [{ userId: actor.userId, role: "owner", addedBy: actor.userId, addedAt: timestamp, updatedBy: actor.userId, updatedAt: timestamp }],
      artifacts: []
    };
    await this.repository.create(library);
    return clone(library);
  }

  async getLibrary(actor: TeamLibraryActor) {
    const library = await this.authorized(actor, ["owner", "editor", "viewer"]);
    return clone(library);
  }

  async requireRole(actor: TeamLibraryActor, roles: TeamRole[]) {
    await this.authorized(actor, roles);
  }

  async setMember(actor: TeamLibraryActor, userId: string, role: TeamRole) {
    const library = await this.authorized(actor, ["owner"]);
    assertTeamId(userId, "userId");
    if (!(["owner", "editor", "viewer"] as TeamRole[]).includes(role)) throw new TeamLibraryError("Invalid team role", "INVALID");
    const timestamp = this.now();
    const existing = library.members.find((member) => member.userId === userId);
    if (existing?.role === "owner" && role !== "owner" && library.members.filter((member) => member.role === "owner").length === 1) {
      throw new TeamLibraryError("Team must retain at least one owner", "CONFLICT");
    }
    const members = existing
      ? library.members.map((member) => member.userId === userId ? { ...member, role, updatedBy: actor.userId, updatedAt: timestamp } : member)
      : [...library.members, { userId, role, addedBy: actor.userId, addedAt: timestamp, updatedBy: actor.userId, updatedAt: timestamp }];
    return this.persist(library, { ...library, members, updatedAt: timestamp });
  }

  async publishStylePack(actor: TeamLibraryActor, pack: StylePackVersion, input: PublishCommon = {}) {
    assertImmutableStylePack(pack);
    return this.publish(actor, {
      artifactType: "style_pack",
      artifactId: pack.id,
      version: pack.version,
      name: input.name ?? pack.name,
      content: clone(pack),
      sourceProjectId: input.sourceProjectId,
      sourceArtifactId: pack.id,
      sourceVersion: pack.version,
      sourceContentHash: pack.contentHash
    });
  }

  async publishGoldenSlide(actor: TeamLibraryActor, snapshot: TeamGoldenSlideSnapshot, version = "1.0.0", input: PublishCommon = {}) {
    assertGoldenSnapshot(snapshot);
    return this.publish(actor, {
      artifactType: "golden_slide",
      artifactId: snapshot.candidate.id,
      version,
      name: input.name ?? `${snapshot.candidate.role} · ${snapshot.candidate.layoutFamily}`,
      content: clone(snapshot),
      sourceProjectId: input.sourceProjectId,
      sourceArtifactId: snapshot.candidate.id
    });
  }

  async publishBrandPolicy(actor: TeamLibraryActor, policy: BrandPolicyVersion, input: PublishCommon = {}) {
    validateBrandPolicyVersion(policy);
    if (policy.tenantId !== actor.tenantId || policy.teamId !== actor.teamId) {
      throw new TeamLibraryError("Brand Policy scope does not match the publishing actor", "FORBIDDEN");
    }
    return this.publish(actor, {
      artifactType: "brand_policy",
      artifactId: policy.policyId,
      version: policy.version,
      name: input.name ?? policy.name,
      content: clone(policy),
      sourceProjectId: input.sourceProjectId ?? policy.provenance.sourceProjectId,
      sourceArtifactId: policy.policyId,
      sourceVersion: policy.version,
      sourceContentHash: policy.contentHash
    });
  }

  async listArtifacts(actor: TeamLibraryActor, options: { artifactType?: TeamArtifactType; state?: TeamArtifactState | "all" } = {}) {
    if (options.artifactType) assertArtifactType(options.artifactType);
    if (options.state && !["published", "archived", "all"].includes(options.state)) throw new TeamLibraryError("Invalid artifact state", "INVALID");
    const library = await this.authorized(actor, ["owner", "editor", "viewer"]);
    const state = options.state ?? "published";
    return clone(library.artifacts.filter((artifact) => (!options.artifactType || artifact.artifactType === options.artifactType)
      && (state === "all" || artifact.state === state)));
  }

  async getArtifact(actor: TeamLibraryActor, artifactType: TeamArtifactType, artifactId: string, version?: string) {
    assertArtifactType(artifactType);
    assertArtifactId(artifactId, "artifactId");
    if (version) assertVersion(version);
    const library = await this.authorized(actor, ["owner", "editor", "viewer"]);
    const matches = library.artifacts.filter((artifact) => artifact.artifactType === artifactType && artifact.artifactId === artifactId);
    const artifact = version ? matches.find((item) => item.version === version) : matches.sort((a, b) => compareVersions(b.version, a.version))[0];
    if (!artifact) throw new TeamLibraryError("Team artifact version not found", "NOT_FOUND");
    return clone(artifact);
  }

  async archiveArtifact(actor: TeamLibraryActor, artifactType: TeamArtifactType, artifactId: string, version: string) {
    assertArtifactType(artifactType);
    assertArtifactId(artifactId, "artifactId");
    assertVersion(version);
    const library = await this.authorized(actor, ["owner"]);
    const index = library.artifacts.findIndex((artifact) => artifact.artifactType === artifactType
      && artifact.artifactId === artifactId && artifact.version === version);
    if (index < 0) throw new TeamLibraryError("Team artifact version not found", "NOT_FOUND");
    const existing = library.artifacts[index];
    if (existing.state === "archived") return clone(existing);
    const timestamp = this.now();
    const archived = { ...existing, state: "archived" as const, archivedBy: actor.userId, archivedAt: timestamp };
    const artifacts = [...library.artifacts];
    artifacts[index] = archived;
    await this.persist(library, { ...library, artifacts, updatedAt: timestamp });
    return clone(archived);
  }

  private async publish(actor: TeamLibraryActor, input: {
    artifactType: TeamArtifactType;
    artifactId: string;
    version: string;
    name: string;
    content: TeamArtifactContent;
    sourceProjectId?: string;
    sourceArtifactId: string;
    sourceVersion?: string;
    sourceContentHash?: string;
  }) {
    const library = await this.authorized(actor, ["owner", "editor"]);
    assertArtifactId(input.artifactId, "artifactId");
    assertVersion(input.version);
    if (typeof input.name !== "string") throw new TeamLibraryError("Artifact name is required", "INVALID");
    const versions = library.artifacts.filter((artifact) => artifact.artifactType === input.artifactType && artifact.artifactId === input.artifactId);
    const existing = versions.find((artifact) => artifact.version === input.version);
    const latest = [...versions].sort((left, right) => compareVersions(right.version, left.version))[0];
    if (!existing && latest && compareVersions(input.version, latest.version) <= 0) {
      throw new TeamLibraryError(`Artifact version must increase monotonically after ${latest.version}`, "CONFLICT");
    }
    const parentVersion = existing ? existing.provenance.parentVersion : latest?.version ?? null;
    const parentContentHash = existing ? existing.provenance.parentContentHash : latest?.contentHash ?? null;
    const timestamp = this.now();
    const base = {
      schema: TEAM_ARTIFACT_SCHEMA,
      tenantId: actor.tenantId,
      teamId: actor.teamId,
      artifactType: input.artifactType,
      artifactId: input.artifactId,
      version: input.version,
      name: normalizeText(input.name),
      state: "published" as const,
      content: input.content,
      provenance: {
        ...(input.sourceProjectId ? { sourceProjectId: input.sourceProjectId } : {}),
        sourceArtifactId: input.sourceArtifactId,
        ...(input.sourceVersion ? { sourceVersion: input.sourceVersion } : {}),
        ...(input.sourceContentHash ? { sourceContentHash: input.sourceContentHash } : {}),
        parentVersion,
        parentContentHash,
        publishedBy: actor.userId,
        publishedAt: timestamp
      }
    };
    if (!base.name) throw new TeamLibraryError("Artifact name is required", "INVALID");
    const artifact: TeamArtifactVersion = { ...base, contentHash: teamArtifactDigest(base) };
    if (existing) {
      if (existing.contentHash === artifact.contentHash) return clone(existing);
      throw new TeamLibraryError(`Immutable artifact version already exists: ${artifactKey(artifact)}`, "CONFLICT");
    }
    await this.persist(library, { ...library, artifacts: [...library.artifacts, artifact], updatedAt: timestamp });
    return clone(artifact);
  }

  private assertActor(actor: TeamLibraryActor) {
    assertTeamId(actor.tenantId, "tenantId");
    assertTeamId(actor.teamId, "teamId");
    assertTeamId(actor.userId, "userId");
  }

  private async authorized(actor: TeamLibraryActor, roles: TeamRole[]) {
    this.assertActor(actor);
    const library = await this.repository.read(actor);
    if (!library) throw new TeamLibraryError("Team Style Library not found", "NOT_FOUND");
    if (library.tenantId !== actor.tenantId || library.teamId !== actor.teamId) throw new TeamLibraryError("Team scope mismatch", "FORBIDDEN");
    const member = library.members.find((item) => item.userId === actor.userId);
    if (!member || !roles.includes(member.role)) throw new TeamLibraryError("Actor is not permitted for this team operation", "FORBIDDEN");
    return validateTeamStyleLibrary(library);
  }

  private async persist(previous: TeamStyleLibrary, next: TeamStyleLibrary) {
    const updated = validateTeamStyleLibrary({ ...next, revision: previous.revision + 1 });
    await this.repository.write(updated, previous.revision);
    return clone(updated);
  }
}
