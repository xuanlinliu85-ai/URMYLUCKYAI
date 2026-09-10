import { createHash } from "node:crypto";
import { STYLE_DIMENSIONS } from "./types.ts";
import type { StyleDimension, StyleDna, StyleMixArtifact } from "@/lib/types";
import type { SearchDensity, StylePackSearchEntry, StylePackSearchLibrary } from "@/lib/semantic-search";

export type StylePackPreviewSet = {
  cover: string;
  executiveSummary: string;
  dataSlide: string;
};

export type StylePackMetadata = {
  tags: string[];
  roles: string[];
  layoutFamilies: string[];
  densities: SearchDensity[];
  hasCharts: boolean;
  chartTypes: string[];
  audienceTags: string[];
  examplePrompts: string[];
};

export type StylePackVersion = StylePackSearchEntry & {
  schema: "ppt-factory/style-pack/v1";
  contentHash: string;
  previews: StylePackPreviewSet;
  preferredLayouts: string[];
  chartRules: Record<string, unknown>;
  typography: Record<string, unknown>;
  imageDirection: Record<string, unknown>;
  antiPatterns: string[];
  examplePrompts: string[];
  provenance: {
    previewSet: string;
    sources: StyleMixArtifact["sources"];
    weights: StyleMixArtifact["weights"];
    locks: StyleMixArtifact["locks"];
    resolvedOwnership: StyleMixArtifact["resolvedOwnership"];
    promptInterpretation?: StyleMixArtifact["promptInterpretation"];
  };
  styleMix: StyleMixArtifact;
  style: StyleDna;
};

export type StylePackLibrary = Omit<StylePackSearchLibrary, "packs"> & {
  packs: StylePackVersion[];
};

export type SaveStylePackInput = {
  id?: string;
  version?: string;
  name: string;
  styleMix: StyleMixArtifact;
  metadata?: Partial<StylePackMetadata>;
  previews?: Partial<StylePackPreviewSet>;
  previewDirection?: "A" | "B" | "C";
  active?: boolean;
};

export class StylePackError extends Error {
  readonly code: "INVALID" | "NOT_FOUND" | "CONFLICT";
  constructor(message: string, code: "INVALID" | "NOT_FOUND" | "CONFLICT") { super(message); this.code = code; }
}

const emptyLibrary = (): StylePackLibrary => ({ schema: "ppt-factory/style-pack-search-library/v1", packs: [] });
const normalize = (value: string) => value.normalize("NFKC").trim().replace(/\s+/g, " ");
const unique = (values: string[] = []) => [...new Set(values.map(normalize).filter(Boolean))].sort((a, b) => a.localeCompare(b, "en"));
const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b, "en"))
      .map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}

function digest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

function assertVersion(version: string) {
  if (!VERSION_PATTERN.test(version)) throw new StylePackError(`Invalid semantic version: ${version}`, "INVALID");
}

function compareVersions(a: string, b: string) {
  const av = a.split(".").map(Number);
  const bv = b.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) if (av[index] !== bv[index]) return av[index] - bv[index];
  return 0;
}

function nextPatch(version: string) {
  assertVersion(version);
  const [major, minor, patch] = version.split(".").map(Number);
  return `${major}.${minor}.${patch + 1}`;
}

function assertStyleMix(styleMix: StyleMixArtifact) {
  if (!styleMix?.finalStyle?.styleId || styleMix.finalStyleId !== styleMix.finalStyle.styleId) {
    throw new StylePackError("Style Mix finalStyleId must match finalStyle.styleId", "INVALID");
  }
  for (const dimension of STYLE_DIMENSIONS) {
    if (!styleMix.weights?.[dimension] || typeof styleMix.locks?.[dimension] !== "boolean" || !styleMix.resolvedOwnership?.[dimension]) {
      throw new StylePackError(`Style Mix is missing ${dimension} provenance`, "INVALID");
    }
  }
}

function defaultId(name: string) {
  const normalized = normalize(name).toLowerCase();
  const slug = normalized.replace(/[^a-z0-9\u3400-\u9fff]+/g, "-").replace(/^-|-$/g, "").slice(0, 36) || "style";
  return `pack_${slug}_${digest(normalized).slice(0, 8)}`;
}

function defaultPreviews(styleMix: StyleMixArtifact, direction: "A" | "B" | "C"): StylePackPreviewSet {
  const root = `render/previews/${styleMix.previewSet}/${direction}`;
  return { cover: `${root}/slide-001.png`, executiveSummary: `${root}/slide-002.png`, dataSlide: `${root}/slide-003.png` };
}

function densityMetadata(style: StyleDna): SearchDensity[] {
  const raw = String(style.density.label ?? "").toLowerCase();
  return [raw === "low" ? "sparse" : raw === "high" ? "dense" : "balanced"];
}

function createVersion(input: SaveStylePackInput): StylePackVersion {
  assertStyleMix(input.styleMix);
  const name = normalize(input.name);
  if (!name) throw new StylePackError("Style Pack name is required", "INVALID");
  const id = input.id ? normalize(input.id) : defaultId(name);
  if (!/^[a-zA-Z0-9_\-\u3400-\u9fff]+$/.test(id)) throw new StylePackError("Style Pack id contains unsupported characters", "INVALID");
  const version = input.version ?? "1.0.0";
  assertVersion(version);
  const style = structuredClone(input.styleMix.finalStyle);
  const metadata = input.metadata ?? {};
  const basePreviews = defaultPreviews(input.styleMix, input.previewDirection ?? "B");
  const payload = {
    schema: "ppt-factory/style-pack/v1" as const,
    id, version, name, styleId: style.styleId,
    tags: unique(metadata.tags), roles: unique(metadata.roles),
    layoutFamilies: unique(metadata.layoutFamilies?.length ? metadata.layoutFamilies : style.preferredLayouts),
    densities: unique(metadata.densities?.length ? metadata.densities : densityMetadata(style)) as SearchDensity[],
    hasCharts: metadata.hasCharts ?? Object.keys(style.charts).length > 0,
    chartTypes: unique(metadata.chartTypes), audienceTags: unique(metadata.audienceTags),
    active: input.active ?? true,
    previews: { ...basePreviews, ...input.previews },
    preferredLayouts: unique(style.preferredLayouts),
    chartRules: structuredClone(style.charts), typography: structuredClone(style.typography),
    imageDirection: structuredClone(style.visuals), antiPatterns: unique(style.antiPatterns),
    examplePrompts: unique(metadata.examplePrompts),
    provenance: {
      previewSet: input.styleMix.previewSet,
      sources: structuredClone(input.styleMix.sources), weights: structuredClone(input.styleMix.weights),
      locks: structuredClone(input.styleMix.locks), resolvedOwnership: structuredClone(input.styleMix.resolvedOwnership),
      ...(input.styleMix.promptInterpretation ? { promptInterpretation: structuredClone(input.styleMix.promptInterpretation) } : {})
    },
    styleMix: structuredClone(input.styleMix), style
  };
  return { ...payload, contentHash: digest(payload) };
}

function sorted(library: StylePackLibrary): StylePackLibrary {
  return {
    schema: "ppt-factory/style-pack-search-library/v1",
    packs: [...library.packs].sort((a, b) => a.id.localeCompare(b.id, "en") || compareVersions(b.version, a.version))
  };
}

function verifyStoredVersion(pack: StylePackVersion) {
  const { contentHash, ...payload } = pack;
  if (!contentHash || !pack.styleMix || !pack.style || digest(payload) !== contentHash) {
    throw new StylePackError(`Style Pack snapshot is incomplete or has been modified: ${pack.id}@${pack.version}`, "INVALID");
  }
  assertStyleMix(pack.styleMix);
  if (pack.styleId !== pack.style.styleId || pack.styleMix.finalStyleId !== pack.styleId || digest(pack.styleMix.finalStyle) !== digest(pack.style)) {
    throw new StylePackError(`Style Pack style lineage is inconsistent: ${pack.id}@${pack.version}`, "INVALID");
  }
  return pack;
}

export function normalizeStylePackLibrary(value?: StylePackSearchLibrary): StylePackLibrary {
  if (!value) return emptyLibrary();
  if (value.schema !== "ppt-factory/style-pack-search-library/v1" || !Array.isArray(value.packs)) {
    throw new StylePackError("Unsupported Style Pack library schema", "INVALID");
  }
  return sorted(value as StylePackLibrary);
}

export function verifyStylePackLibrary(value?: StylePackSearchLibrary): StylePackLibrary {
  const library = normalizeStylePackLibrary(value);
  const identities = new Set<string>();
  for (const pack of library.packs) {
    const identity = `${pack.id}@${pack.version}`;
    if (identities.has(identity)) throw new StylePackError(`Duplicate immutable Style Pack identity: ${identity}`, "CONFLICT");
    identities.add(identity);
    verifyStoredVersion(pack);
  }
  return library;
}

export function createStylePack(libraryValue: StylePackLibrary | undefined, input: SaveStylePackInput) {
  const library = normalizeStylePackLibrary(libraryValue);
  const pack = createVersion(input);
  const existing = library.packs.find((item) => item.id === pack.id && item.version === pack.version);
  if (existing) {
    if (existing.contentHash === pack.contentHash) return { library, pack: existing, created: false };
    throw new StylePackError(`Immutable Style Pack ${pack.id}@${pack.version} already exists`, "CONFLICT");
  }
  return { library: sorted({ ...library, packs: [...library.packs, pack] }), pack, created: true };
}

export function listStylePacks(libraryValue?: StylePackLibrary) {
  return normalizeStylePackLibrary(libraryValue).packs.map(({ styleMix: _styleMix, style: _style, ...summary }) => summary);
}

export function getStylePack(libraryValue: StylePackLibrary | undefined, id: string, version?: string) {
  const candidates = normalizeStylePackLibrary(libraryValue).packs.filter((item) => item.id === id);
  const pack = version ? candidates.find((item) => item.version === version) : candidates.sort((a, b) => compareVersions(b.version, a.version))[0];
  if (!pack) throw new StylePackError(`Style Pack not found: ${id}${version ? `@${version}` : ""}`, "NOT_FOUND");
  return verifyStoredVersion(pack);
}

export function updateStylePack(libraryValue: StylePackLibrary | undefined, input: Omit<SaveStylePackInput, "id" | "version" | "name" | "styleMix"> & {
  id: string;
  baseVersion?: string;
  version?: string;
  name?: string;
  styleMix?: StyleMixArtifact;
}) {
  const library = normalizeStylePackLibrary(libraryValue);
  const base = getStylePack(library, input.id, input.baseVersion);
  const version = input.version ?? nextPatch(base.version);
  if (compareVersions(version, base.version) <= 0) throw new StylePackError("Updated version must be newer than its base version", "INVALID");
  return createStylePack(library, {
    id: base.id, version, name: input.name ?? base.name, styleMix: input.styleMix ?? base.styleMix,
    metadata: {
      tags: input.metadata?.tags ?? base.tags, roles: input.metadata?.roles ?? base.roles,
      layoutFamilies: input.metadata?.layoutFamilies ?? base.layoutFamilies,
      densities: input.metadata?.densities ?? base.densities, hasCharts: input.metadata?.hasCharts ?? base.hasCharts,
      chartTypes: input.metadata?.chartTypes ?? base.chartTypes, audienceTags: input.metadata?.audienceTags ?? base.audienceTags,
      examplePrompts: input.metadata?.examplePrompts ?? base.examplePrompts
    },
    previews: input.previews ?? base.previews, active: input.active ?? base.active
  });
}

export type StylePackApplication = {
  schema: "ppt-factory/style-pack-application/v1";
  pack: { id: string; version: string; contentHash: string };
  styleMix: StyleMixArtifact;
  finalStyle: StyleDna;
};

export function applyStylePack(libraryValue: StylePackLibrary | undefined, id: string, version?: string): StylePackApplication {
  const pack = getStylePack(libraryValue, id, version);
  return {
    schema: "ppt-factory/style-pack-application/v1",
    pack: { id: pack.id, version: pack.version, contentHash: pack.contentHash },
    styleMix: structuredClone(pack.styleMix), finalStyle: structuredClone(pack.style)
  };
}
