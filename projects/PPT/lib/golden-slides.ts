import { createHash } from "node:crypto";
import type { ReferenceAnalysis } from "@/adapters/reference-analyzer";
import type { ReferenceLayoutFamily } from "@/adapters/reference-analyzer/layout-family";
import type {
  GoldenSlideCandidate,
  GoldenSlideLibrary,
  GoldenSlideRetrievalDecision,
  SlidePlan,
  StorylineSlide,
  StyleDna
} from "@/lib/types";

export const GOLDEN_CANDIDATE_THRESHOLD = 68;
export const GOLDEN_RETRIEVAL_THRESHOLD = 72;

const round = (value: number) => Number(value.toFixed(2));
const clamp = (value: number) => Math.max(0, Math.min(100, value));

function idealBand(value: number, low: number, high: number) {
  if (value >= low && value <= high) return 100;
  return clamp(100 - Math.min(Math.abs(value - low), Math.abs(value - high)) * 180);
}

function stableId(styleId: string, slide: number, family: string) {
  return `golden_${createHash("sha1").update(`${styleId}:${slide}:${family}`).digest("hex").slice(0, 12)}`;
}

export function buildGoldenSlideLibrary(
  analysis: ReferenceAnalysis,
  referenceStyle: StyleDna,
  mode: "learn-style" | "compatibility-only"
): GoldenSlideLibrary {
  const measurements = new Map((analysis.styleMeasurements?.slides ?? []).map((item) => [item.slide, item]));
  const layouts = new Map((analysis.layoutFamilies ?? []).map((item) => [item.slide, item]));
  const summaries = new Map((analysis.layoutFamilySummaries ?? []).map((item) => [item.family, item]));
  const roles = new Map((analysis.slideRoles ?? []).map((item) => [item.slide, item]));
  const candidates: GoldenSlideCandidate[] = [];

  for (let slide = 1; slide <= analysis.slideCount; slide += 1) {
    const role = roles.get(slide);
    const layout = layouts.get(slide);
    const measurement = measurements.get(slide);
    if (!role || !layout || !measurement) continue;
    const familySummary = summaries.get(layout.family);
    const hierarchyRatio = measurement.typography.body.fontSizePt.mean > 0
      ? measurement.typography.title.fontSizePt.mean / measurement.typography.body.fontSizePt.mean
      : measurement.typography.title.fontSizePt.mean > 0 ? 1.8 : 0;
    const layoutQuality = clamp(layout.confidence * 100 - (layout.family === "OTHER" ? 35 : 0));
    const clarity = clamp(role.confidence * 70 + idealBand(measurement.whitespace.whitespaceRatio, 0.22, 0.72) * 0.3);
    const reusability = clamp(92
      - (["other", "closing"].includes(role.role) ? 25 : 0)
      - (layout.family === "HERO_IMAGE" ? 18 : 0)
      - (measurement.density.label === "dense" ? 10 : 0));
    const styleRepresentativeness = clamp((familySummary?.averageConfidence ?? 0.4) * 60
      + Math.min(1, (familySummary?.share ?? 0) * 4) * 40);
    const hierarchy = hierarchyRatio > 0 ? idealBand(hierarchyRatio, 1.35, 2.8) : 45;
    const occupancyDelta = Math.abs(layout.signals.leftOccupancy - layout.signals.rightOccupancy);
    const balance = clamp(idealBand(measurement.whitespace.whitespaceRatio, 0.2, 0.68) * 0.7 + (100 - occupancyDelta * 80) * 0.3);
    const dimensionScores = {
      layoutQuality: round(layoutQuality), clarity: round(clarity), reusability: round(reusability),
      styleRepresentativeness: round(styleRepresentativeness), hierarchy: round(hierarchy), balance: round(balance)
    };
    const score = round(layoutQuality * 0.22 + clarity * 0.2 + reusability * 0.2
      + styleRepresentativeness * 0.14 + hierarchy * 0.14 + balance * 0.1);
    candidates.push({
      id: stableId(referenceStyle.styleId, slide, layout.family), sourceSlide: slide, role: role.role,
      layoutFamily: layout.family, density: measurement.density.label, hasChart: measurement.charts.count > 0,
      score, candidateThreshold: GOLDEN_CANDIDATE_THRESHOLD,
      eligible: mode === "learn-style" && score >= GOLDEN_CANDIDATE_THRESHOLD,
      dimensionScores,
      evidence: [
        `role:${role.role}@${role.confidence}`, `layout:${layout.family}@${layout.confidence}`,
        `density:${measurement.density.label}`, `whitespace:${measurement.whitespace.whitespaceRatio}`,
        `hierarchy-ratio:${round(hierarchyRatio)}`, `chart:${measurement.charts.count > 0 ? "yes" : "no"}`
      ]
    });
  }

  return {
    schema: "ppt-factory/golden-slides/v1", referenceStyleId: referenceStyle.styleId,
    sourceFile: analysis.filename,
    usage: { mode, retrievalEligible: mode === "learn-style" },
    thresholds: { candidate: GOLDEN_CANDIDATE_THRESHOLD, retrieval: GOLDEN_RETRIEVAL_THRESHOLD },
    candidates: candidates.sort((a, b) => b.score - a.score || a.sourceSlide - b.sourceSlide)
  };
}

const roleCompatibility: Record<StorylineSlide["role"], string[]> = {
  cover: ["cover"], executive_summary: ["summary"], evidence: ["evidence_data", "other"],
  comparison: ["comparison", "evidence_data"], strategy: ["process_timeline", "summary", "other"],
  conclusion: ["summary", "closing"], ending: ["closing", "summary"]
};

function targetDensity(density: SlidePlan["density"]): GoldenSlideCandidate["density"] {
  if (density === "low" || density === "medium_low") return "sparse";
  if (density === "high" || density === "medium_high") return "dense";
  return "balanced";
}

function layoutCompatibility(family: ReferenceLayoutFamily, plan: Pick<SlidePlan, "role" | "visualPriority">) {
  if (plan.role === "cover") return family === "COVER" ? 100 : 0;
  if (plan.role === "comparison") return family === "COMPARISON" || family === "TWO_COLUMN" ? 100 : 45;
  if (plan.visualPriority === "chart") return ["FULL_CHART", "DATA_LEFT_TEXT_RIGHT", "TEXT_LEFT_DATA_RIGHT", "BIG_NUMBER"].includes(family) ? 100 : 35;
  if (plan.visualPriority === "diagram") return family === "PROCESS_TIMELINE" ? 100 : 40;
  return family === "OTHER" ? 35 : 80;
}

export function retrieveGoldenSlide(
  library: GoldenSlideLibrary | undefined,
  plan: Pick<SlidePlan, "role" | "density" | "visualPriority" | "metrics">
): GoldenSlideRetrievalDecision {
  const threshold = library?.thresholds.retrieval ?? GOLDEN_RETRIEVAL_THRESHOLD;
  if (!library) return { status: "fallback", layoutSource: "generative_layout", score: 0, threshold, evidence: ["golden-library:unavailable"] };
  if (!library.usage.retrievalEligible || library.usage.mode !== "learn-style") {
    return { status: "fallback", layoutSource: "generative_layout", score: 0, threshold, evidence: ["reference-usage:compatibility-only", "retrieval:blocked"] };
  }
  const desiredDensity = targetDensity(plan.density);
  const wantsChart = plan.visualPriority === "chart" || plan.metrics.length > 0;
  const ranked = library.candidates.filter((item) => item.eligible).map((candidate) => {
    const roleScore = roleCompatibility[plan.role].includes(candidate.role) ? 100 : 0;
    const layoutScore = layoutCompatibility(candidate.layoutFamily, plan);
    const densityScore = candidate.density === desiredDensity ? 100 : candidate.density === "balanced" || desiredDensity === "balanced" ? 65 : 25;
    const chartScore = wantsChart === candidate.hasChart ? 100 : wantsChart ? 0 : 65;
    const score = round(candidate.score * 0.45 + roleScore * 0.25 + layoutScore * 0.12 + densityScore * 0.1 + chartScore * 0.08);
    return { candidate, score, evidence: [`candidate-quality:${candidate.score}`, `role-match:${roleScore}`, `layout-match:${layoutScore}`, `density-match:${densityScore}`, `chart-match:${chartScore}`] };
  }).sort((a, b) => b.score - a.score || a.candidate.sourceSlide - b.candidate.sourceSlide);
  const best = ranked[0];
  if (!best || best.score < threshold) return {
    status: "fallback", layoutSource: "generative_layout", score: best?.score ?? 0, threshold,
    evidence: best ? [...best.evidence, "threshold:not-met"] : ["candidate:none-eligible"]
  };
  return {
    status: "selected", layoutSource: "golden_slide", candidateId: best.candidate.id,
    sourceSlide: best.candidate.sourceSlide, score: best.score, threshold,
    evidence: [...best.evidence, `selected:${best.candidate.id}`]
  };
}
