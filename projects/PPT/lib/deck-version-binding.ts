import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { brandArtifactHash } from "./brand-policy.ts";

export const DECK_GENERATION_MANIFEST_SCHEMA = "ppt-factory/deck-generation-manifest/v1" as const;
export const DECK_UPDATE_MANIFEST_SCHEMA = "ppt-factory/deck-update-manifest/v1" as const;
export const DECK_EVIDENCE_MANIFEST_SCHEMA = "ppt-factory/deck-evidence-manifest/v1" as const;
const ID_PATTERN = /^[a-zA-Z0-9_-]{1,120}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;

export type AuthoritativeDeckBinding = {
  projectId: string;
  versionId: string;
  sha256: string;
  slides: number;
  manifestType: "generation" | "update";
  manifestName: string;
  manifestHash: string;
  pptxName: string;
  evidenceManifestName?: string;
  evidenceManifestHash?: string;
};

function assertId(value: unknown, label: string) {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) throw new Error(`${label} is invalid`);
  return value;
}

function assertHash(value: unknown, label: string) {
  if (typeof value !== "string" || !HASH_PATTERN.test(value)) throw new Error(`${label} is invalid`);
  return value;
}

function assertSlides(value: unknown) {
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 500) throw new Error("Deck manifest slide count is invalid");
  return Number(value);
}

function projectDirectory(projectsRoot: string, projectId: string) {
  return path.join(projectsRoot, assertId(projectId, "projectId"));
}

async function readJson(file: string) {
  return JSON.parse(await readFile(file, "utf8")) as unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertOnlyKeys(value: Record<string, unknown>, allowed: string[], label: string) {
  const keys = new Set(allowed);
  if (Object.keys(value).some((key) => !keys.has(key))) throw new Error(`${label} contains unsupported fields`);
}

export async function publishGeneratedDeckVersion(input: {
  projectsRoot: string;
  projectId: string;
  finalPptxPath: string;
  slides: number;
  direction: string;
}) {
  const projectId = assertId(input.projectId, "projectId");
  const bytes = await readFile(input.finalPptxPath);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const versionId = `generated-${sha256.slice(0, 20)}`;
  const pptxName = `versions/${versionId}.pptx`;
  const outputDirectory = path.join(projectDirectory(input.projectsRoot, projectId), "output");
  const versionsDirectory = path.join(outputDirectory, "versions");
  await mkdir(versionsDirectory, { recursive: true });
  const versionPath = path.join(outputDirectory, ...pptxName.split("/"));
  try {
    await copyFile(input.finalPptxPath, versionPath, 1);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const existingHash = createHash("sha256").update(await readFile(versionPath)).digest("hex");
    if (existingHash !== sha256) throw new Error(`Immutable generated deck version conflict: ${versionId}`);
  }
  const manifest = {
    schema: DECK_GENERATION_MANIFEST_SCHEMA,
    status: "published",
    projectId,
    versionId,
    output: { versionId, filename: pptxName, sha256, slides: assertSlides(input.slides) },
    direction: String(input.direction)
  };
  const manifestName = `deck-generation-manifest-${versionId}.json`;
  const manifestPath = path.join(outputDirectory, manifestName);
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
  try {
    await writeFile(manifestPath, serialized, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const existing = await readFile(manifestPath, "utf8");
    if (existing !== serialized) throw new Error(`Immutable generation manifest conflict: ${versionId}`);
  }
  return { manifest, manifestName, manifestHash: brandArtifactHash(manifest), versionPath };
}

export async function resolveAuthoritativeDeckVersion(projectsRoot: string, projectIdValue: string, requestedVersionIdValue: string) {
  const projectId = assertId(projectIdValue, "projectId");
  const requestedVersionId = assertId(requestedVersionIdValue, "deckVersionId");
  const outputDirectory = path.join(projectDirectory(projectsRoot, projectId), "output");
  const candidates = [
    { type: "generation" as const, name: `deck-generation-manifest-${requestedVersionId}.json` },
    { type: "update" as const, name: `deck-update-manifest-${requestedVersionId}.json` }
  ];
  for (const candidate of candidates) {
    const manifestPath = path.join(outputDirectory, candidate.name);
    let manifest: unknown;
    try {
      manifest = await readJson(manifestPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    if (!isRecord(manifest)) throw new Error("Deck version manifest must be an object");
    const allowed = candidate.type === "generation"
      ? ["schema", "status", "projectId", "versionId", "output", "direction"]
      : ["schema", "updateId", "status", "source", "output", "planHash", "lockedDimensions", "changes", "preservation"];
    assertOnlyKeys(manifest, allowed, "Deck version manifest");
    if (candidate.type === "generation" && (manifest.schema !== DECK_GENERATION_MANIFEST_SCHEMA || manifest.status !== "published"
      || manifest.projectId !== projectId || manifest.versionId !== requestedVersionId || typeof manifest.direction !== "string"
      || !manifest.direction.trim())) throw new Error("Generation manifest identity is invalid");
    if (candidate.type === "update" && (manifest.schema !== DECK_UPDATE_MANIFEST_SCHEMA || manifest.status !== "applied"
      || manifest.updateId !== requestedVersionId)) throw new Error("Deck update manifest identity is invalid");
    if (!isRecord(manifest.output)) throw new Error("Deck version manifest output is required");
    const output = manifest.output;
    assertOnlyKeys(output, candidate.type === "generation" ? ["versionId", "filename", "sha256", "slides"]
      : ["versionId", "filename", "sha256", "slides", "projectId"], "Deck version manifest output");
    if (output.versionId !== requestedVersionId) throw new Error("Deck manifest output version does not match the requested version");
    if (candidate.type === "update" && output.projectId !== projectId) throw new Error("Deck update manifest project identity is invalid");
    const sha256 = assertHash(output.sha256, "Deck manifest SHA-256");
    const slides = assertSlides(output.slides);
    if (typeof output.filename !== "string" || path.isAbsolute(output.filename)) throw new Error("Deck manifest filename is invalid");
    const normalized = path.normalize(output.filename);
    if (normalized === ".." || normalized.startsWith(`..${path.sep}`) || !normalized.toLowerCase().endsWith(".pptx")) {
      throw new Error("Deck manifest filename must stay inside output and name a PPTX");
    }
    const pptxPath = path.join(outputDirectory, normalized);
    const bytes = await readFile(pptxPath);
    const actualHash = createHash("sha256").update(bytes).digest("hex");
    if (actualHash !== sha256) throw new Error("Persisted deck bytes do not match the immutable version manifest");
    const binding: AuthoritativeDeckBinding = {
      projectId,
      versionId: requestedVersionId,
      sha256,
      slides,
      manifestType: candidate.type,
      manifestName: candidate.name,
      manifestHash: brandArtifactHash(manifest),
      pptxName: normalized.replaceAll("\\", "/")
    };
    return { binding, bytes: new Uint8Array(bytes), manifest };
  }
  throw new Error("Authoritative deck version manifest was not found");
}

const EVIDENCE_NAMES = ["styleDna", "styleMix", "slidePlans", "inspect", "layouts", "fontEvidence", "imageEvidence", "chartPackManifest", "qaReport"] as const;

export async function publishDeckEvidenceManifest(input: {
  projectsRoot: string;
  deck: AuthoritativeDeckBinding;
  evidenceHashes: Record<(typeof EVIDENCE_NAMES)[number], string>;
  tenantId: string;
  teamId: string;
  publishedBy: string;
  publishedAt: string;
}) {
  assertId(input.tenantId, "tenantId");
  assertId(input.teamId, "teamId");
  assertId(input.publishedBy, "publishedBy");
  if (!Number.isFinite(Date.parse(input.publishedAt))) throw new Error("publishedAt is invalid");
  assertOnlyKeys(input.evidenceHashes, [...EVIDENCE_NAMES], "Deck evidence hashes");
  for (const name of EVIDENCE_NAMES) assertHash(input.evidenceHashes[name], `Deck evidence ${name} hash`);
  const manifest = {
    schema: DECK_EVIDENCE_MANIFEST_SCHEMA,
    status: "published",
    tenantId: input.tenantId,
    teamId: input.teamId,
    projectId: input.deck.projectId,
    deckVersionId: input.deck.versionId,
    deckManifestHash: input.deck.manifestHash,
    deckSha256: input.deck.sha256,
    evidenceHashes: Object.fromEntries(EVIDENCE_NAMES.map((name) => [name, input.evidenceHashes[name]])),
    publishedBy: input.publishedBy,
    publishedAt: input.publishedAt
  };
  const manifestName = `deck-evidence-manifest-${input.deck.versionId}.json`;
  const manifestPath = path.join(projectDirectory(input.projectsRoot, input.deck.projectId), "output", manifestName);
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
  await writeFile(manifestPath, serialized, { encoding: "utf8", flag: "wx" });
  return { manifest, manifestName, manifestHash: brandArtifactHash(manifest) };
}

export async function resolveDeckEvidenceManifest(projectsRoot: string, deck: AuthoritativeDeckBinding,
  scope: { tenantId: string; teamId: string }) {
  const manifestName = `deck-evidence-manifest-${assertId(deck.versionId, "deckVersionId")}.json`;
  const manifest = await readJson(path.join(projectDirectory(projectsRoot, deck.projectId), "output", manifestName));
  if (!isRecord(manifest)) throw new Error("Deck evidence manifest must be an object");
  assertOnlyKeys(manifest, ["schema", "status", "tenantId", "teamId", "projectId", "deckVersionId", "deckManifestHash", "deckSha256", "evidenceHashes", "publishedBy", "publishedAt"], "Deck evidence manifest");
  if (manifest.schema !== DECK_EVIDENCE_MANIFEST_SCHEMA || manifest.status !== "published" || manifest.projectId !== deck.projectId
    || manifest.tenantId !== scope.tenantId || manifest.teamId !== scope.teamId || manifest.deckVersionId !== deck.versionId
    || manifest.deckManifestHash !== deck.manifestHash || manifest.deckSha256 !== deck.sha256) {
    throw new Error("Deck evidence manifest identity is invalid");
  }
  assertId(manifest.publishedBy, "Deck evidence publisher");
  if (typeof manifest.publishedAt !== "string" || !Number.isFinite(Date.parse(manifest.publishedAt))) throw new Error("Deck evidence publication time is invalid");
  if (!isRecord(manifest.evidenceHashes)) throw new Error("Deck evidence hashes are required");
  const evidenceRecord = manifest.evidenceHashes;
  assertOnlyKeys(evidenceRecord, [...EVIDENCE_NAMES], "Deck evidence hashes");
  const evidenceHashes = Object.fromEntries(
    EVIDENCE_NAMES.map((name) => [name, assertHash(evidenceRecord[name], `Deck evidence ${name} hash`)])
  ) as Record<(typeof EVIDENCE_NAMES)[number], string>;
  return { manifest, manifestName, manifestHash: brandArtifactHash(manifest), evidenceHashes };
}
