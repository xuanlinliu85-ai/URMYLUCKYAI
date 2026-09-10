import type { ContentAnalysis } from "@/lib/types";
import { materialUnits } from "@/lib/material-text";

export function analyzeContent(text: string, source: { type: "text" | "pdf"; name: string }): ContentAnalysis {
  const items = materialUnits(text, 6);
  if (!items.length) throw new Error("Material does not contain enough readable text");
  const riskPattern = /风险|挑战|不确定|下滑|下降|波动|约束|不足|延误|损失|如果|暂停|超过/;
  const recommendationPattern = /建议|应当|需要|优先|下一步|行动|推进|建立|实施/;
  // Chinese business copy commonly inserts whitespace between a number and its
  // unit ("11.4 天", "3 个百分点"). Treat that as one metric so the slide
  // planner receives the real operating target instead of a unitless number.
  const numberPattern = /\d+(?:\.\d+)?\s*(?:个百分点|万元|亿元|小时|分钟|个月|%|万|亿|天|周|家|个|项)?/g;
  const dataPoints = items.flatMap((item) => [...item.matchAll(numberPattern)].map((match) => {
    const rawValue = match[0].trim();
    const numericValue = Number.parseFloat(rawValue);
    const unit = rawValue.replace(/^\d+(?:\.\d+)?\s*/, "");
    const value = `${numericValue}${unit}`;
    return {
      label: item.replace(match[0], "").replace(/[，。；：、]/g, " ").replace(/\s+/g, " ").trim().slice(0, 36),
      value,
      numericValue,
      unit,
      sourceText: item.slice(0, 180)
    };
  })).filter((metric) => metric.unit || metric.numericValue >= 20).slice(0, 40);
  const risks = items.filter((item) => riskPattern.test(item)).slice(0, 8);
  const recommendations = items.filter((item) => recommendationPattern.test(item)).slice(0, 8);
  return {
    thesis: items[0].slice(0, 180),
    conclusions: items.slice(0, 4).map((item) => item.slice(0, 180)),
    evidence: items.slice(1, 10).map((item) => item.slice(0, 180)),
    dataPoints,
    risks,
    recommendations,
    sources: [source]
  };
}
