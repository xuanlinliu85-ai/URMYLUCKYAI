import type { GoldenSlideLibrary } from "@/lib/types";

export type SearchArtifactType = "golden_slide" | "style_pack";
export type SearchDensity = "sparse" | "balanced" | "dense";

export type StylePackSearchEntry = {
  id: string;
  version: string;
  name: string;
  styleId: string;
  tags: string[];
  roles: string[];
  layoutFamilies: string[];
  densities: SearchDensity[];
  hasCharts: boolean;
  chartTypes: string[];
  audienceTags: string[];
  active: boolean;
};

export type StylePackSearchLibrary = {
  schema: "ppt-factory/style-pack-search-library/v1";
  packs: StylePackSearchEntry[];
};

export type SemanticSearchDocument = {
  id: string;
  artifactType: SearchArtifactType;
  title: string;
  tags: string[];
  roles: string[];
  layoutFamilies: string[];
  densities: SearchDensity[];
  hasChart: boolean;
  chartTypes: string[];
  styleIds: string[];
  audienceTags: string[];
  qualityScore: number;
  source: {
    candidateId?: string;
    sourceSlide?: number;
    stylePackId?: string;
    version?: string;
  };
};

export type SemanticSearchIndex = {
  schema: "ppt-factory/semantic-search-index/v1";
  projectId: string;
  method: "deterministic-structured-metadata";
  sources: {
    goldenSlides: { available: boolean; searchable: boolean; count: number };
    stylePacks: { available: boolean; count: number };
  };
  documents: SemanticSearchDocument[];
};

export type SemanticSearchQuery = {
  text?: string;
  artifactTypes?: SearchArtifactType[];
  roles?: string[];
  layoutFamilies?: string[];
  densities?: SearchDensity[];
  chart?: "required" | "excluded" | "any";
  styleIds?: string[];
  audienceTags?: string[];
  limit?: number;
  minScore?: number;
  preferenceRanking?: "neutral" | "explicit";
};

export type SemanticPreferenceRankingSignals = Record<string, { signal: number; evidence: string[] }>;

export type SemanticSearchMatch = {
  id: string;
  artifactType: SearchArtifactType;
  title: string;
  score: number;
  dimensions: {
    semantic: number;
    role: number;
    layout: number;
    density: number;
    chart: number;
    style: number;
    audience: number;
    quality: number;
    preference?: number;
  };
  evidence: string[];
  source: SemanticSearchDocument["source"];
};

export type SemanticSearchResult = {
  schema: "ppt-factory/semantic-search-result/v1";
  query: Required<Pick<SemanticSearchQuery, "chart" | "limit" | "minScore" | "preferenceRanking">> & Omit<SemanticSearchQuery, "chart" | "limit" | "minScore" | "preferenceRanking">;
  status: "matched" | "fallback";
  fallback: "none" | "no_candidate_above_threshold";
  totalDocuments: number;
  matches: SemanticSearchMatch[];
};

const round = (value: number) => Number(value.toFixed(2));
const clamp = (value: number) => Math.max(0, Math.min(100, value));
const clampPreference = (value: number) => Math.max(-100, Math.min(100, value));
const unique = (values: string[]) => [...new Set(values.map(normalize).filter(Boolean))].sort();
const normalize = (value: string) => value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");

const roleAliases: Record<string, string[]> = {
  cover: ["cover", "封面"], agenda_section: ["agenda", "section", "目录", "章节"],
  summary: ["summary", "executive summary", "摘要", "总结"], evidence_data: ["evidence", "data", "数据", "证据"],
  comparison: ["comparison", "对比", "比较"], process_timeline: ["process", "timeline", "流程", "时间线"],
  closing: ["closing", "结束", "结尾"], other: ["other", "其他"]
};

function textTokens(value: string) {
  const normalized = normalize(value);
  if (!normalized) return [];
  return unique(normalized.match(/[a-z0-9_+-]+|[\u3400-\u9fff]+/g) ?? []);
}
function overlapScore(wanted: string[] | undefined, actual: string[]) {
  if (!wanted?.length) return 50;
  const wantedSet = new Set(unique(wanted));
  const actualSet = new Set(unique(actual));
  const hits = [...wantedSet].filter((item) => actualSet.has(item)).length;
  return round((hits / wantedSet.size) * 100);
}

function semanticScore(text: string | undefined, document: SemanticSearchDocument) {
  const wanted = textTokens(text ?? "");
  if (!wanted.length) return 50;
  const searchable = normalize([
    document.title, ...document.tags, ...document.roles.flatMap((role) => roleAliases[role] ?? [role]),
    ...document.layoutFamilies, ...document.densities, ...document.chartTypes,
    ...document.styleIds, ...document.audienceTags
  ].join(" "));
  const hits = wanted.filter((token) => searchable.includes(token)).length;
  return round((hits / wanted.length) * 100);
}

function chartScore(chart: SemanticSearchQuery["chart"], hasChart: boolean) {
  if (!chart || chart === "any") return 50;
  return chart === "required" ? (hasChart ? 100 : 0) : (hasChart ? 0 : 100);
}

function goldenDocuments(library?: GoldenSlideLibrary): SemanticSearchDocument[] {
  if (!library || library.usage.mode !== "learn-style" || !library.usage.retrievalEligible) return [];
  return library.candidates.filter((candidate) => candidate.eligible).map((candidate) => ({
    id: `golden:${candidate.id}`,
    artifactType: "golden_slide",
    title: `${candidate.role} · ${candidate.layoutFamily} · slide ${candidate.sourceSlide}`,
    tags: unique([
      ...candidate.evidence, candidate.role, candidate.layoutFamily, candidate.density,
      ...(roleAliases[candidate.role] ?? []), candidate.hasChart ? "chart" : "no-chart",
      candidate.hasChart ? "图表" : "无图表"
    ]),
    roles: [normalize(candidate.role)], layoutFamilies: [normalize(candidate.layoutFamily)],
    densities: [candidate.density], hasChart: candidate.hasChart,
    chartTypes: candidate.hasChart ? ["standard-chart"] : [],
    styleIds: [normalize(library.referenceStyleId)], audienceTags: [], qualityScore: candidate.score,
    source: { candidateId: candidate.id, sourceSlide: candidate.sourceSlide }
  }));
}

function stylePackDocuments(library?: StylePackSearchLibrary): SemanticSearchDocument[] {
  if (!library || library.schema !== "ppt-factory/style-pack-search-library/v1") return [];
  return library.packs.filter((pack) => pack.active).map((pack) => ({
    id: `style-pack:${pack.id}@${pack.version}`,
    artifactType: "style_pack", title: pack.name,
    tags: unique([...pack.tags, pack.name]), roles: unique(pack.roles),
    layoutFamilies: unique(pack.layoutFamilies), densities: unique(pack.densities) as SearchDensity[],
    hasChart: pack.hasCharts, chartTypes: unique(pack.chartTypes), styleIds: unique([pack.styleId]),
    audienceTags: unique(pack.audienceTags), qualityScore: 100,
    source: { stylePackId: pack.id, version: pack.version }
  }));
}

export function buildSemanticSearchIndex(input: {
  projectId: string;
  goldenSlides?: GoldenSlideLibrary;
  stylePacks?: StylePackSearchLibrary;
}): SemanticSearchIndex {
  const golden = goldenDocuments(input.goldenSlides);
  const packs = stylePackDocuments(input.stylePacks);
  return {
    schema: "ppt-factory/semantic-search-index/v1", projectId: input.projectId,
    method: "deterministic-structured-metadata",
    sources: {
      goldenSlides: {
        available: Boolean(input.goldenSlides),
        searchable: Boolean(input.goldenSlides?.usage.retrievalEligible && input.goldenSlides.usage.mode === "learn-style"),
        count: golden.length
      },
      stylePacks: { available: Boolean(input.stylePacks), count: packs.length }
    },
    documents: [...golden, ...packs].sort((a, b) => a.id.localeCompare(b.id, "en"))
  };
}

export function searchSemanticIndex(index: SemanticSearchIndex, rawQuery: SemanticSearchQuery, options: {
  preferenceSignals?: SemanticPreferenceRankingSignals;
} = {}): SemanticSearchResult {
  const query = {
    ...rawQuery,
    text: rawQuery.text?.trim() || undefined,
    artifactTypes: rawQuery.artifactTypes ? [...new Set(rawQuery.artifactTypes)] : undefined,
    roles: rawQuery.roles ? unique(rawQuery.roles) : undefined,
    layoutFamilies: rawQuery.layoutFamilies ? unique(rawQuery.layoutFamilies) : undefined,
    densities: rawQuery.densities ? [...new Set(rawQuery.densities)].sort() : undefined,
    styleIds: rawQuery.styleIds ? unique(rawQuery.styleIds) : undefined,
    audienceTags: rawQuery.audienceTags ? unique(rawQuery.audienceTags) : undefined,
    chart: rawQuery.chart ?? "any" as const,
    preferenceRanking: rawQuery.preferenceRanking ?? "neutral" as const,
    limit: Math.max(1, Math.min(20, Math.trunc(rawQuery.limit ?? 8))),
    minScore: clamp(rawQuery.minScore ?? 55)
  };
  const allowedTypes = new Set(query.artifactTypes ?? ["golden_slide", "style_pack"]);
  const ranked = index.documents.filter((document) => allowedTypes.has(document.artifactType)).map((document) => {
    const dimensions = {
      semantic: semanticScore(query.text, document), role: overlapScore(query.roles, document.roles),
      layout: overlapScore(query.layoutFamilies, document.layoutFamilies), density: overlapScore(query.densities, document.densities),
      chart: chartScore(query.chart, document.hasChart), style: overlapScore(query.styleIds, document.styleIds),
      audience: overlapScore(query.audienceTags, document.audienceTags), quality: round(clamp(document.qualityScore))
    };
    const baseScore = round(dimensions.semantic * .2 + dimensions.role * .15 + dimensions.layout * .13
      + dimensions.density * .1 + dimensions.chart * .1 + dimensions.style * .1
      + dimensions.audience * .1 + dimensions.quality * .12);
    const preference = query.preferenceRanking === "explicit" ? options.preferenceSignals?.[document.id] : undefined;
    const score = preference ? round(clamp(baseScore + clampPreference(preference.signal) * .1)) : baseScore;
    const rankedDimensions = preference
      ? { ...dimensions, preference: round(50 + clampPreference(preference.signal) / 2) }
      : dimensions;
    const evidence = [
      ...Object.entries(rankedDimensions).map(([name, value]) => `${name}:${value}`),
      ...(preference ? [`preference-adjustment:${round(score - baseScore)}`, ...preference.evidence.map((item) => `preference:${item}`)] : [])
    ];
    return { id: document.id, artifactType: document.artifactType, title: document.title, score, dimensions: rankedDimensions, evidence, source: document.source };
  }).sort((a, b) => b.score - a.score || b.dimensions.quality - a.dimensions.quality || a.id.localeCompare(b.id, "en"));
  const matches = ranked.filter((item) => item.score >= query.minScore).slice(0, query.limit);
  return {
    schema: "ppt-factory/semantic-search-result/v1", query,
    status: matches.length ? "matched" : "fallback",
    fallback: matches.length ? "none" : "no_candidate_above_threshold",
    totalDocuments: index.documents.length, matches
  };
}
