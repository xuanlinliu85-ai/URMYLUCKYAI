import type { BusinessMetric, ContentAnalysis, SlidePlan, Storyline } from "@/lib/types";
import type { GoldenSlideLibrary } from "@/lib/types";
import { retrieveGoldenSlide } from "@/lib/golden-slides";

function metricPriority(metric: BusinessMetric) {
  if (metric.unit === "%" || metric.unit === "个百分点") return 4;
  if (["小时", "天", "周", "分钟"].includes(metric.unit)) return 4;
  if (["万元", "亿元", "万", "亿"].includes(metric.unit)) return 2;
  return 1;
}

export function buildSlidePlans(storyline: Storyline, analysis?: ContentAnalysis, goldenLibrary?: GoldenSlideLibrary): SlidePlan[] {
  return storyline.slides.map((slide) => {
    const matched = (analysis?.dataPoints ?? []).filter((metric) =>
      slide.supportingPoints.some((point) => point.includes(metric.sourceText) || metric.sourceText.includes(point))
      || slide.message.includes(metric.sourceText)
      || metric.sourceText.includes(slide.message)
    );
    const metricPool = slide.role === "executive_summary" && analysis ? analysis.dataPoints : matched;
    const metrics = [...metricPool].sort((a, b) => metricPriority(b) - metricPriority(a)).filter((metric, index, values) =>
      values.findIndex((candidate) => candidate.value === metric.value && candidate.sourceText === metric.sourceText) === index
    ).slice(0, 4);
    const hasMetrics = metrics.length > 0;
    const isTimeline = /阶段|\d+\s*周|打通|推进/.test(slide.message);
    const component = slide.role === "cover" ? "cover_statement"
      : slide.role === "executive_summary" ? "answer_first_summary"
      : slide.role === "strategy" ? "decision_gate"
      : slide.role === "conclusion" || slide.role === "ending" ? "action_summary"
      : isTimeline ? "native_timeline"
      : hasMetrics ? "business_metric_spread"
      : "evidence_editorial";
    const basePlan: SlidePlan = {
    slideIndex: slide.slideIndex,
    role: slide.role,
    message: slide.message,
    importance: slide.slideIndex <= 2 ? "critical" as const : "high" as const,
    density: slide.supportingPoints.length > 3 ? "medium_high" as const : "medium" as const,
    layoutSource: "generative_layout" as const,
    visualPriority: hasMetrics ? "chart" as const : slide.role === "cover" ? "text" as const : isTimeline ? "diagram" as const : "balanced" as const,
    components: ["title", component, "footer"],
    renderRoutes: { title: "native" as const, body: "native" as const, chart: "native" as const, footer: "native" as const },
    editableLevel: "native" as const,
    content: slide.supportingPoints,
    metrics
    };
    const goldenMatch = retrieveGoldenSlide(goldenLibrary, basePlan);
    return { ...basePlan, layoutSource: goldenMatch.layoutSource, goldenMatch };
  });
}
