import { createHash } from "node:crypto";
import type { ReferenceAnalysis } from "@/adapters/reference-analyzer";
import { STYLE_DIMENSIONS } from "@/lib/types";
import type { DimensionLockState, DimensionSourceWeights, PromptStyleInterpretation, StyleControls, StyleDimension, StyleDna, StyleMixArtifact, StyleSource, StyleSourceWeights } from "@/lib/types";

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function deriveStyleDna(analysis: ReferenceAnalysis): StyleDna {
  const objects = Math.max(1, analysis.positions.length);
  const measurements = analysis.styleMeasurements;
  const measuredDensity = measurements
    ? (measurements.summary.density.meanInformationScore + measurements.summary.density.meanVisualScore) / 2
    : Number.NaN;
  const density = clamp01(Number.isFinite(measuredDensity) ? measuredDensity : (objects / Math.max(1, analysis.slideCount)) / 18);
  const uniqueLayouts = new Set(analysis.layouts.map((item) => item.target).filter(Boolean)).size;
  const colorCount = analysis.colors.filter((color) => color.kind === "rgb").length;
  const idSeed = createHash("sha1").update(JSON.stringify(analysis)).digest("hex").slice(0, 12);
  return {
    styleId: `style_${idSeed}`,
    name: `${analysis.filename} Style DNA`,
    sourceType: "reference",
    version: "1.0.0",
    styleVector: {
      minimalism: clamp01(1 - density),
      modernity: 0.62,
      boldness: clamp01(colorCount / 16),
      density,
      editorial: clamp01(uniqueLayouts / 8),
      financial: clamp01((analysis.charts + 2) / Math.max(3, analysis.slideCount)),
      technology: 0.35,
      visualImpact: clamp01((analysis.images + analysis.charts * 2) / Math.max(3, analysis.slideCount * 2)),
      whitespace: clamp01(1 - density * 0.8),
      asymmetry: 0.5
    },
    typography: {
      families: analysis.fonts.slice(0, 8),
      primary: analysis.fonts[0]?.family ?? "Aptos",
      cjkFallback: ["Microsoft YaHei", "Noto Sans CJK SC", "SimHei"],
      ...(measurements ? { measuredHierarchy: measurements.summary.typography } : {})
    },
    colors: {
      palette: analysis.colors.slice(0, 12),
      primary: analysis.colors.find((color) => color.kind === "rgb")?.value ?? "1F2937",
      background: "FFFFFF"
    },
    grid: {
      aspectRatio: analysis.slideSize.aspectRatio,
      objectCountPerSlide: Number((objects / Math.max(1, analysis.slideCount)).toFixed(2)),
      layoutFamilyCount: uniqueLayouts,
      semanticLayoutFamilyCount: analysis.layoutFamilySummaries?.length ?? 0
    },
    composition: {
      preferred: density > 0.7 ? "dense-grid" : density < 0.35 ? "editorial-airy" : "balanced-grid",
      imageFrequency: Number((analysis.images / Math.max(1, analysis.slideCount)).toFixed(2))
    },
    charts: {
      frequency: analysis.charts,
      style: analysis.charts ? "reference-native" : "minimal-native",
      ...(measurements ? { measuredTreatment: measurements.summary.charts.defaultTreatment } : {})
    },
    visuals: { imageFrequency: analysis.images, route: "native-first" },
    storytelling: { model: "conclusion-first", confidence: 0.55 },
    density: {
      score: density,
      label: density > 0.7 ? "high" : density < 0.35 ? "low" : "medium",
      ...(measurements ? { measured: measurements.summary.density, whitespace: measurements.summary.whitespace } : {})
    },
    ...(measurements ? { measurements } : {}),
    preferredLayouts: [...new Set(analysis.layouts.map((item) => item.target).filter((value): value is string => Boolean(value)))],
    antiPatterns: ["repetitive-three-card", "pill-overload", "default-blue-purple-gradient", "dashboard-everywhere"],
    referenceSlideRoles: analysis.slideRoles ?? [],
    referenceLayoutFamilies: analysis.layoutFamilies ?? [],
    layoutFamilySummaries: analysis.layoutFamilySummaries ?? []
  };
}

export function createBankInternalStyleDna(): StyleDna {
  return {
    styleId: "system_bank_internal_v1",
    name: "银行内部通报 · System Style",
    sourceType: "system",
    version: "1.0.0",
    styleVector: {
      minimalism: 0.78,
      modernity: 0.58,
      boldness: 0.38,
      density: 0.48,
      editorial: 0.64,
      financial: 0.92,
      technology: 0.08,
      visualImpact: 0.52,
      whitespace: 0.72,
      asymmetry: 0.34,
      visualWeight: 0.55,
      bankInternal: 1
    },
    typography: {
      primary: "Microsoft YaHei",
      titleWeight: 700,
      bodyWeight: 400,
      cjkFallback: ["Microsoft YaHei", "DengXian", "Noto Sans CJK SC", "SimHei"]
    },
    colors: {
      primary: "0E2B4F",
      background: "FFFFFF",
      accent: "9B1C31",
      secondary: "B89450",
      neutral: "F4F6F8"
    },
    grid: { aspectRatio: 16 / 9, margin: 64, columns: 12, gutter: 24 },
    composition: { preferred: "answer-first-editorial-grid", imageFrequency: 0.08 },
    charts: { style: "flat-native-financial", gridlines: "restrained", labels: "direct" },
    visuals: { route: "native-first", imagery: "rare-and-evidence-led" },
    storytelling: { model: "conclusion-evidence-action", confidence: 0.9 },
    density: { score: 0.48, label: "medium" },
    preferredLayouts: ["cover", "executive-summary", "hero-chart", "matrix", "action-plan"],
    antiPatterns: ["repetitive-three-card", "pill-overload", "default-blue-purple-gradient", "dashboard-everywhere", "decorative-icon-overload"]
  };
}

export function createAdaptiveProfessionalStyleDna(): StyleDna {
  return {
    styleId: "system_adaptive_professional_v1",
    name: "通用专业报告 · System Style",
    sourceType: "system",
    version: "1.0.0",
    styleVector: {
      minimalism: 0.7,
      modernity: 0.68,
      boldness: 0.48,
      density: 0.5,
      editorial: 0.62,
      financial: 0.5,
      technology: 0.5,
      visualImpact: 0.58,
      whitespace: 0.68,
      asymmetry: 0.46,
      visualWeight: 0.58,
      bankInternal: 0
    },
    typography: {
      primary: "Microsoft YaHei",
      titleWeight: 700,
      bodyWeight: 400,
      cjkFallback: ["Microsoft YaHei", "DengXian", "Noto Sans CJK SC", "SimHei"]
    },
    colors: {
      primary: "243447",
      background: "FFFFFF",
      accent: "C24A2C",
      secondary: "2F6F73",
      neutral: "F5F6F8"
    },
    grid: { aspectRatio: 16 / 9, margin: 64, columns: 12, gutter: 24 },
    composition: { preferred: "adaptive-editorial-grid", imageFrequency: 0.14 },
    charts: { style: "flat-native", gridlines: "restrained", labels: "direct" },
    visuals: { route: "native-first", imagery: "content-led" },
    storytelling: { model: "answer-evidence-action", confidence: 0.88 },
    density: { score: 0.5, label: "medium" },
    preferredLayouts: ["cover", "executive-summary", "hero-chart", "comparison", "strategy", "ending"],
    antiPatterns: ["repetitive-three-card", "pill-overload", "default-blue-purple-gradient", "dashboard-everywhere"]
  };
}

type PromptRule = {
  id: string;
  pattern: RegExp;
  vector: Record<string, number>;
  patch?: Partial<Pick<StyleDna, "typography" | "colors" | "grid" | "composition" | "charts" | "visuals" | "storytelling" | "density">>;
};

const PROMPT_RULES: PromptRule[] = [
  { id: "minimal", pattern: /极简|简洁|克制|minimal|clean|restrained/i, vector: { minimalism: 0.9, density: 0.25, whitespace: 0.86, visualImpact: 0.42 }, patch: { composition: { preferred: "minimal-editorial" }, density: { score: 0.25, label: "low" } } },
  { id: "rich", pattern: /丰富|饱满|信息量大|rich|layered/i, vector: { minimalism: 0.25, density: 0.76, whitespace: 0.3 }, patch: { density: { score: 0.76, label: "high" } } },
  { id: "modern", pattern: /现代|当代|modern|contemporary/i, vector: { modernity: 0.9, asymmetry: 0.64 }, patch: { typography: { primary: "Microsoft YaHei", titleWeight: 700 } } },
  { id: "classic", pattern: /经典|传统|稳重|classic|traditional/i, vector: { modernity: 0.25, asymmetry: 0.25 }, patch: { composition: { preferred: "classic-grid" } } },
  { id: "financial", pattern: /金融|银行|投研|财务|financial|bank|institutional/i, vector: { financial: 0.95, technology: 0.08 }, patch: { colors: { primary: "0E2B4F", background: "FFFFFF", accent: "9B1C31", secondary: "B89450" }, charts: { style: "flat-native-financial", labels: "direct", gridlines: "restrained" } } },
  { id: "technology", pattern: /科技|数字化|终端|tech|technology|digital|terminal/i, vector: { technology: 0.94, financial: 0.2, modernity: 0.88 }, patch: { colors: { primary: "112342", background: "F4F7FB", accent: "275DAD", secondary: "00A083" }, visuals: { route: "native-first", imagery: "technical-and-data-led" } } },
  { id: "editorial", pattern: /编辑部|杂志|叙事|editorial|magazine|narrative/i, vector: { editorial: 0.92, visualWeight: 0.62 }, patch: { composition: { preferred: "answer-first-editorial-grid" }, storytelling: { model: "answer-evidence-action", confidence: 0.9 } } },
  { id: "high-impact", pattern: /高冲击|大胆|醒目|bold|high[ -]?impact|dramatic/i, vector: { boldness: 0.92, visualImpact: 0.94 }, patch: { visuals: { route: "native-first", tone: "high-impact" } } },
  { id: "airy", pattern: /留白|通透|呼吸感|airy|spacious/i, vector: { density: 0.22, whitespace: 0.9, minimalism: 0.82 }, patch: { grid: { margin: 86, columns: 12, gutter: 28 }, density: { score: 0.22, label: "low" } } },
  { id: "dense", pattern: /紧凑|密集|dense|compact/i, vector: { density: 0.82, whitespace: 0.24, minimalism: 0.3 }, patch: { grid: { margin: 46, columns: 12, gutter: 18 }, density: { score: 0.82, label: "high" } } }
];

function mergeRecords(base: Record<string, unknown>, patch: Record<string, unknown> | undefined) {
  return patch ? { ...base, ...patch } : base;
}

export function interpretPromptStyle(input: string): StyleDna {
  const normalizedInput = input.trim().replace(/\s+/g, " ").toLowerCase();
  const matched = PROMPT_RULES.filter((rule) => rule.pattern.test(normalizedInput));
  const proposals = new Map<string, number[]>();
  for (const rule of matched) for (const [key, value] of Object.entries(rule.vector)) proposals.set(key, [...(proposals.get(key) ?? []), value]);
  const vector = Object.fromEntries([...proposals].map(([key, values]) => [key, clamp01(values.reduce((sum, value) => sum + value, 0) / values.length)]));
  const interpretation: PromptStyleInterpretation = {
    schema: "ppt-factory/prompt-style-interpretation/v1",
    input,
    normalizedInput,
    matchedIntents: matched.map((rule) => rule.id),
    neutral: matched.length === 0
  };
  const promptStyle: StyleDna = {
    styleId: `prompt_${createHash("sha1").update(normalizedInput || "neutral").digest("hex").slice(0, 12)}`,
    name: matched.length ? `Prompt Style · ${matched.map((rule) => rule.id).join(" + ")}` : "Prompt Style · Neutral",
    sourceType: "prompt",
    version: "1.0.0",
    styleVector: matched.length ? vector : {},
    typography: {}, colors: {}, grid: {}, composition: {}, charts: {}, visuals: {}, storytelling: {}, density: {},
    preferredLayouts: [], antiPatterns: [], promptInterpretation: interpretation
  };
  for (const rule of matched) {
    promptStyle.typography = mergeRecords(promptStyle.typography, rule.patch?.typography);
    promptStyle.colors = mergeRecords(promptStyle.colors, rule.patch?.colors);
    promptStyle.grid = mergeRecords(promptStyle.grid, rule.patch?.grid);
    promptStyle.composition = mergeRecords(promptStyle.composition, rule.patch?.composition);
    promptStyle.charts = mergeRecords(promptStyle.charts, rule.patch?.charts);
    promptStyle.visuals = mergeRecords(promptStyle.visuals, rule.patch?.visuals);
    promptStyle.storytelling = mergeRecords(promptStyle.storytelling, rule.patch?.storytelling);
    promptStyle.density = mergeRecords(promptStyle.density, rule.patch?.density);
  }
  return promptStyle;
}

const DIMENSION_VECTOR_KEYS: Record<StyleDimension, string[]> = {
  typography: ["modernity"],
  color: ["boldness"],
  layout: ["whitespace", "asymmetry"],
  chart: ["financial"],
  density: ["density", "minimalism"],
  composition: ["editorial", "visualWeight"],
  storytelling: ["storytellingStrength"],
  visualTone: ["visualImpact", "technology"]
};

function legacyLocks(controls: StyleControls): DimensionLockState {
  return {
    typography: controls.locks.typography,
    color: controls.locks.colors,
    layout: controls.locks.layout,
    chart: controls.locks.chart ?? false,
    density: controls.locks.density ?? false,
    composition: controls.locks.composition ?? false,
    storytelling: controls.locks.storytelling ?? false,
    visualTone: controls.locks.visualTone ?? false
  };
}

function defaultWeights(controls: StyleControls, promptActive: boolean): DimensionSourceWeights {
  const reference = Math.max(0, Math.min(100, controls.referenceStrength));
  const row = { reference, system: 100 - reference, prompt: promptActive ? 35 : 0 };
  return Object.fromEntries(STYLE_DIMENSIONS.map((dimension) => [dimension, { ...row }])) as DimensionSourceWeights;
}

function normalizeWeights(weights: StyleSourceWeights, locked: boolean, promptActive: boolean): StyleSourceWeights {
  if (locked) return { reference: 1, system: 0, prompt: 0 };
  const values = {
    reference: Math.max(0, Number(weights.reference) || 0),
    system: Math.max(0, Number(weights.system) || 0),
    prompt: promptActive ? Math.max(0, Number(weights.prompt) || 0) : 0
  };
  const total = values.reference + values.system + values.prompt;
  return total > 0
    ? { reference: values.reference / total, system: values.system / total, prompt: values.prompt / total }
    : { reference: 0, system: 1, prompt: 0 };
}

function ownerOf(weights: StyleSourceWeights): StyleSource {
  return (["reference", "system", "prompt"] as StyleSource[]).reduce((best, source) => weights[source] > weights[best] ? source : best, "reference");
}

function copyDimension(target: StyleDna, source: StyleDna, dimension: StyleDimension) {
  if (dimension === "typography") target.typography = structuredClone(source.typography);
  if (dimension === "color") target.colors = structuredClone(source.colors);
  if (dimension === "layout") { target.grid = structuredClone(source.grid); target.preferredLayouts = structuredClone(source.preferredLayouts); }
  if (dimension === "chart") target.charts = structuredClone(source.charts);
  if (dimension === "density") target.density = structuredClone(source.density);
  if (dimension === "composition") target.composition = structuredClone(source.composition);
  if (dimension === "storytelling") target.storytelling = structuredClone(source.storytelling);
  if (dimension === "visualTone") { target.visuals = structuredClone(source.visuals); target.antiPatterns = structuredClone(source.antiPatterns); }
}

export type MixStyleOptions = {
  systemStyle?: StyleDna;
  promptText?: string;
  promptStyle?: StyleDna;
};

export function resolveStyleMix(reference: StyleDna, controls: StyleControls, options: MixStyleOptions = {}) {
  const system = options.systemStyle ?? createAdaptiveProfessionalStyleDna();
  const prompt = options.promptStyle ?? interpretPromptStyle(options.promptText ?? "");
  const promptActive = prompt.promptInterpretation?.neutral === false;
  const locks = controls.advancedMixer?.locks ?? legacyLocks(controls);
  const requestedWeights = controls.advancedMixer?.weights ?? defaultWeights(controls, promptActive);
  const sources: Record<StyleSource, StyleDna> = { reference, system, prompt };
  const finalStyle = structuredClone(system);
  finalStyle.sourceType = "hybrid";
  finalStyle.name = `${reference.name} · Advanced Mix`;
  finalStyle.styleVector = {};

  const weights = {} as DimensionSourceWeights;
  const resolvedOwnership = {} as StyleMixArtifact["resolvedOwnership"];
  for (const dimension of STYLE_DIMENSIONS) {
    weights[dimension] = normalizeWeights(requestedWeights[dimension], locks[dimension], promptActive);
    const owner = ownerOf(weights[dimension]);
    resolvedOwnership[dimension] = { owner, weights: weights[dimension], locked: locks[dimension] };
    copyDimension(finalStyle, sources[owner], dimension);
    for (const key of DIMENSION_VECTOR_KEYS[dimension]) {
      const fallback = key === "storytellingStrength" ? 0.5 : 0.5;
      finalStyle.styleVector[key] = clamp01(((["reference", "system", "prompt"] as StyleSource[]).reduce((sum, source) => {
        const value = sources[source].styleVector[key];
        return sum + weights[dimension][source] * (typeof value === "number" ? value : fallback);
      }, 0)));
    }
  }

  const overrideInfluence = 1 - clamp01(controls.referenceStrength / 100);
  const applyOverride = (dimension: StyleDimension, key: string, value: number) => {
    if (locks[dimension]) return;
    const current = finalStyle.styleVector[key] ?? 0.5;
    finalStyle.styleVector[key] = clamp01(current * (1 - overrideInfluence) + value * overrideInfluence);
  };
  applyOverride("density", "minimalism", controls.minimalism / 100);
  applyOverride("typography", "modernity", controls.modernity / 100);
  applyOverride("density", "density", 1 - controls.airiness / 100);
  applyOverride("layout", "whitespace", controls.airiness / 100);
  applyOverride("composition", "visualWeight", controls.visualWeight / 100);
  applyOverride("visualTone", "technology", controls.technologyTone / 100);
  applyOverride("visualTone", "visualImpact", controls.visualImpact / 100);
  finalStyle.styleVector.financial = clamp01(finalStyle.styleVector.financial ?? 1 - (finalStyle.styleVector.technology ?? 0.5));
  finalStyle.styleId = `style_${createHash("sha1").update(JSON.stringify({ sources: [reference.styleId, system.styleId, prompt.styleId], controls, weights, locks })).digest("hex").slice(0, 16)}`;
  finalStyle.promptInterpretation = prompt.promptInterpretation;
  return { finalStyle, systemStyle: system, promptStyle: prompt, weights, locks, resolvedOwnership };
}

export function mixStyle(reference: StyleDna, controls: StyleControls, options: MixStyleOptions = {}): StyleDna {
  return resolveStyleMix(reference, controls, options).finalStyle;
}
