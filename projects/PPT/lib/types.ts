import type { ReferenceSlideRoleInference } from "@/adapters/reference-analyzer";
import type { ReferenceLayoutFamilyInference, ReferenceLayoutFamilySummary } from "@/adapters/reference-analyzer";

export type LockState = {
  typography: boolean;
  colors: boolean;
  layout: boolean;
  chart?: boolean;
  density?: boolean;
  composition?: boolean;
  storytelling?: boolean;
  visualTone?: boolean;
};

export const STYLE_DIMENSIONS = ["typography", "color", "layout", "chart", "density", "composition", "storytelling", "visualTone"] as const;
export type StyleDimension = typeof STYLE_DIMENSIONS[number];
export type StyleSource = "reference" | "system" | "prompt";
export type StyleSourceWeights = Record<StyleSource, number>;
export type DimensionSourceWeights = Record<StyleDimension, StyleSourceWeights>;
export type DimensionLockState = Record<StyleDimension, boolean>;

export type AdvancedMixerConfig = {
  weights: DimensionSourceWeights;
  locks: DimensionLockState;
};

export type StyleControls = {
  referenceStrength: number;
  minimalism: number;
  modernity: number;
  airiness: number;
  visualWeight: number;
  technologyTone: number;
  visualImpact: number;
  locks: LockState;
  advancedMixer?: AdvancedMixerConfig;
};

export type StyleDna = {
  styleId: string;
  name: string;
  sourceType: "reference" | "system" | "prompt" | "hybrid";
  version: string;
  styleVector: Record<string, number>;
  typography: Record<string, unknown>;
  colors: Record<string, unknown>;
  grid: Record<string, unknown>;
  composition: Record<string, unknown>;
  charts: Record<string, unknown>;
  visuals: Record<string, unknown>;
  storytelling: Record<string, unknown>;
  density: Record<string, unknown>;
  measurements?: ReferenceStyleMeasurements;
  preferredLayouts: string[];
  antiPatterns: string[];
  referenceSlideRoles?: ReferenceSlideRoleInference[];
  referenceLayoutFamilies?: ReferenceLayoutFamilyInference[];
  layoutFamilySummaries?: ReferenceLayoutFamilySummary[];
  promptInterpretation?: PromptStyleInterpretation;
};

export type PromptStyleInterpretation = {
  schema: "ppt-factory/prompt-style-interpretation/v1";
  input: string;
  normalizedInput: string;
  matchedIntents: string[];
  neutral: boolean;
};

export type TypographyRoleMeasurement = {
  count: number;
  fontSizePt: { count: number; min: number; max: number; mean: number; median: number; p25: number; p75: number };
  families: Array<{ family: string; count: number }>;
  cjkRuns: number;
};

export type ChartTreatmentMeasurement = {
  type: string;
  styleId: string;
  dataLabels: string;
  legend: string;
  gridlines: "major" | "none";
  seriesColorMode: "explicit" | "theme";
  explicitSeriesColors: string[];
};

export type ReferenceStyleMeasurements = {
  schema: "ppt-factory/reference-style-measurements/v1";
  method: "deterministic-ooxml";
  summary: {
    typography: Record<"title" | "body" | "caption" | "kpi", TypographyRoleMeasurement> & {
      cjkRuns: number;
      hierarchy: { titleToBodyRatio: number };
    };
    density: { meanInformationScore: number; meanVisualScore: number; sparseSlides: number; balancedSlides: number; denseSlides: number };
    whitespace: { meanOccupiedAreaRatio: number; meanWhitespaceRatio: number; method: "ooxml-bounded-union" };
    charts: {
      count: number;
      slidesWithCharts: number;
      defaultTreatment: Pick<ChartTreatmentMeasurement, "type" | "dataLabels" | "legend" | "gridlines" | "seriesColorMode">;
    };
  };
  slides: Array<{
    slide: number;
    typography: Record<"title" | "body" | "caption" | "kpi", TypographyRoleMeasurement> & { cjkRuns: number };
    density: { informationScore: number; visualScore: number; label: "sparse" | "balanced" | "dense"; textCharacters: number; objectCount: number; imageCount: number; chartCount: number };
    whitespace: { occupiedAreaRatio: number; whitespaceRatio: number; method: "ooxml-bounded-union" };
    charts: { count: number; treatments: ChartTreatmentMeasurement[] };
  }>;
};

export type StorylineSlide = {
  slideIndex: number;
  role: "cover" | "executive_summary" | "evidence" | "comparison" | "strategy" | "conclusion" | "ending";
  message: string;
  supportingPoints: string[];
};

export type Storyline = {
  thesis: string;
  audience: string;
  purpose: string;
  sourceSummary: string;
  slides: StorylineSlide[];
};

export type ContentAnalysis = {
  thesis: string;
  conclusions: string[];
  evidence: string[];
  dataPoints: BusinessMetric[];
  risks: string[];
  recommendations: string[];
  sources: Array<{ type: "text" | "pdf"; name: string }>;
  bindingSources?: BindingSourceProvenance[];
};

export type BusinessMetric = {
  label: string;
  value: string;
  numericValue: number;
  unit: string;
  sourceText: string;
};

export type SlidePlan = {
  slideIndex: number;
  role: StorylineSlide["role"];
  message: string;
  importance: "low" | "medium" | "high" | "critical";
  density: "low" | "medium_low" | "medium" | "medium_high" | "high";
  layoutSource: "golden_slide" | "system_layout" | "reference_layout" | "generative_layout";
  visualPriority: "text" | "chart" | "image" | "balanced" | "diagram";
  components: string[];
  renderRoutes: Record<string, "native" | "svg" | "image" | "html_preview">;
  editableLevel: "native" | "hybrid" | "image-heavy";
  content: string[];
  metrics: BusinessMetric[];
  goldenMatch?: GoldenSlideRetrievalDecision;
  bindingTargets?: SlidePlanBindingTarget[];
  resolvedBindings?: ResolvedBindingTarget[];
  chartPackRef?: string;
};

export type GoldenSlideDimensionScores = {
  layoutQuality: number;
  clarity: number;
  reusability: number;
  styleRepresentativeness: number;
  hierarchy: number;
  balance: number;
};

export type GoldenSlideCandidate = {
  id: string;
  sourceSlide: number;
  role: ReferenceSlideRoleInference["role"];
  layoutFamily: ReferenceLayoutFamilyInference["family"];
  density: "sparse" | "balanced" | "dense";
  hasChart: boolean;
  score: number;
  candidateThreshold: number;
  eligible: boolean;
  dimensionScores: GoldenSlideDimensionScores;
  evidence: string[];
};

export type GoldenSlideLibrary = {
  schema: "ppt-factory/golden-slides/v1";
  referenceStyleId: string;
  sourceFile: string;
  usage: { mode: "learn-style" | "compatibility-only"; retrievalEligible: boolean };
  thresholds: { candidate: number; retrieval: number };
  candidates: GoldenSlideCandidate[];
};

export type GoldenSlideRetrievalDecision = {
  status: "selected" | "fallback";
  layoutSource: "golden_slide" | "generative_layout";
  candidateId?: string;
  sourceSlide?: number;
  score: number;
  threshold: number;
  evidence: string[];
};

export type BindingInput = {
  format: "json" | "csv";
  name: string;
  content?: string;
  data?: unknown;
};

export type BindingSourceProvenance = {
  format: "json" | "csv";
  name: string;
  inputHash: string;
  rows?: number;
};

export type SlidePlanBindingTarget = {
  id: string;
  kind: "text";
  objectName: string;
  template: string;
} | {
  id: string;
  kind: "chart";
  objectName: string;
  categoriesTemplate: string;
  series: Array<{ nameTemplate: string; valuesTemplate: string }>;
};

export type ResolvedBindingTarget = {
  id: string;
  kind: "text";
  objectName: string;
  value: string;
} | {
  id: string;
  kind: "chart";
  objectName: string;
  chart: { categories: string[]; series: Array<{ name: string; values: number[] }> };
};

export type BindingManifestTarget = {
  id: string;
  slideIndex: number;
  objectName: string;
  kind: "text" | "chart";
  keys: string[];
  status: "resolved" | "unresolved";
  unresolvedKeys?: string[];
  resolved?: unknown;
};

export type BindingManifest = {
  schema: "ppt-factory/binding-manifest/v1";
  source: BindingSourceProvenance;
  status: "resolved" | "error";
  resolvedKeys: string[];
  unresolvedKeys: string[];
  targets: BindingManifestTarget[];
  resolutionHash: string;
};

export type StyleMixArtifact = {
  previewSet: string;
  sources: { referenceStyleId: string; systemStyleId: string; promptStyleId?: string; promptText?: string };
  controls: StyleControls;
  weights: DimensionSourceWeights;
  locks: DimensionLockState;
  resolvedOwnership: Record<StyleDimension, { owner: StyleSource; weights: StyleSourceWeights; locked: boolean }>;
  finalStyleId: string;
  finalStyle: StyleDna;
  promptInterpretation?: PromptStyleInterpretation;
  generatedAt: string;
};

export type QaIssue = {
  id: string;
  severity: "critical" | "warning" | "info";
  category: string;
  slide?: number;
  message: string;
  autoFixable: boolean;
  dimension?: "typography" | "color" | "layout" | "chartStyle" | "density" | "composition" | "storytelling" | "visualTone" | "contrast" | "fontFallback" | "imageDistortion" | "chartLabelCollision";
  objectNames?: string[];
  adjustments?: {
    fontScale?: number;
    foregroundColor?: string;
    backgroundColor?: string;
    contrastRatio?: number;
    contrastTarget?: number;
    requestedTypeface?: string;
    resolvedTypeface?: string;
    replacementTypeface?: string;
    imageFit?: "contain" | "cover";
    imageCrop?: { left: number; top: number; right: number; bottom: number };
    imagePosition?: { left: number; top: number; width: number; height: number };
    chartLabelPosition?: "outEnd" | "inEnd" | "center";
    chartLabelFontSize?: number;
    chartLabelDisplayStrategy?: "all" | "none";
  };
};

export type ImageDistortionFinding = {
  slide: number;
  objectName: string;
  reason: "invalid_asset" | "missing_asset" | "invalid_geometry" | "stretched_aspect_ratio" | "out_of_bounds";
  severity: "critical" | "warning";
  sourceAspectRatio?: number;
  displayAspectRatio?: number;
  ratioDelta?: number;
  fit?: "contain" | "cover" | "stretch" | "unknown";
  passed: false;
  recommendedFit?: "contain" | "cover";
  recommendedCrop?: { left: number; top: number; right: number; bottom: number };
  recommendedPosition?: { left: number; top: number; width: number; height: number };
  evidence: Array<"native-image-metadata" | "layout" | "inspect">;
};

export type ImageDistortionReport = {
  score: number;
  target: number;
  passed: boolean;
  checkedObjects: number;
  failingObjects: number;
  findings: ImageDistortionFinding[];
};

export type ChartLabelCollisionFinding = {
  slide: number;
  objectName: string;
  label: string;
  bbox: [number, number, number, number];
  chartBbox: [number, number, number, number];
  defects: Array<"label-collision" | "chart-bounds">;
  collidedWith: string[];
  passed: boolean;
  recommended: {
    chartLabelPosition: "outEnd" | "inEnd";
    chartLabelFontSize: number;
    chartLabelDisplayStrategy: "all";
  };
  evidence: "layout-chart-metadata";
};

export type ChartLabelCollisionReport = {
  score: number;
  target: number;
  passed: boolean;
  checkedCharts: number;
  checkedLabels: number;
  failingLabels: number;
  findings: ChartLabelCollisionFinding[];
};

export type ContrastFinding = {
  slide: number;
  objectName: string;
  foregroundColor: string;
  backgroundColor: string;
  ratio: number;
  target: number;
  passed: boolean;
  recommendedForeground?: string;
  evidence: "rendered-pixel-sample";
};

export type ContrastReport = {
  score: number;
  target: number;
  passed: boolean;
  checkedObjects: number;
  failingObjects: number;
  findings: ContrastFinding[];
};

export type FontFallbackFinding = {
  slide: number;
  objectName: string;
  textPreview: string;
  requestedTypeface: string;
  appliedTypeface: string;
  resolvedTypeface: string;
  risk: "requested-resolved-mismatch" | "unsafe-cjk-typeface" | "replacement-glyph" | "none";
  passed: boolean;
  recommendedTypeface?: string;
  evidence: Array<"renderer-request" | "layout-resolved" | "inspect-object">;
};

export type FontFallbackReport = {
  score: number;
  target: number;
  passed: boolean;
  checkedObjects: number;
  failingObjects: number;
  findings: FontFallbackFinding[];
};

export type FidelityDimension = {
  score: number;
  target: number;
  weight: number;
  passed: boolean;
  locked: boolean;
  evidence: string;
  repairHint?: { fontScale?: number };
};

export type FidelityReport = {
  mode: "measured" | "unavailable";
  overall: number;
  target: number;
  passed: boolean;
  referenceSlides: number;
  outputSlides: number;
  dimensions: Record<"typography" | "color" | "layout" | "chartStyle" | "density" | "composition" | "storytelling" | "visualTone", FidelityDimension>;
};

export type QaReport = {
  status: "PASS" | "REVIEW" | "FAIL";
  overall: number;
  readability: number;
  hierarchy: number;
  alignment: number;
  whitespace: number;
  dataVisualization: number;
  styleConsistency: number;
  referenceFidelity: number;
  fidelity: FidelityReport;
  technical: { contrast: ContrastReport; fontFallback: FontFallbackReport; imageDistortion: ImageDistortionReport; chartLabelCollision: ChartLabelCollisionReport };
  aiLookScore: number;
  issues: QaIssue[];
  repairPass: number;
};

export type RepairPlan = {
  pass: number;
  status: "planned" | "applied" | "rolled_back";
  targets: Array<{
    issueId: string;
    slide?: number;
    category: string;
    dimension?: QaIssue["dimension"];
    objectNames?: string[];
    adjustments?: QaIssue["adjustments"];
    action: string;
  }>;
  createdAt: string;
};
