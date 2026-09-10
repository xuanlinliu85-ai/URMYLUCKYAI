import type { Storyline } from "@/lib/types";
import { materialUnits } from "@/lib/material-text";

export function generateStoryline(text: string, audience: string, purpose: string, pageTarget: number): Storyline {
  const source = materialUnits(text);
  if (!source.length) throw new Error("Material does not contain enough readable text");
  const pages = Math.max(5, Math.min(20, pageTarget));
  const thesis = source[0].slice(0, 160);
  const bodyCount = Math.max(1, pages - 3);
  const bodySource = source.slice(1);
  const body = Array.from({ length: bodyCount }, (_, index) => {
    const start = Math.floor(index * bodySource.length / bodyCount);
    const end = Math.floor((index + 1) * bodySource.length / bodyCount);
    const points = bodySource.slice(start, Math.max(start + 1, end));
    const fallbackMessages = ["关键事实与业务影响", "数据口径与验证方式", "风险、约束与反证", "实施路径与资源安排", "治理机制与决策门槛"];
    const message = points[0] ?? fallbackMessages[index % fallbackMessages.length];
    return {
      slideIndex: index + 3,
      role: (index === bodyCount - 1 ? "strategy" : "evidence") as "strategy" | "evidence",
      message: message.slice(0, 120),
      supportingPoints: (points.length ? points : source.slice(-2)).slice(0, 4).map((point) => point.slice(0, 180))
    };
  });

  return {
    thesis,
    audience,
    purpose,
    sourceSummary: source.slice(0, 4).join(" ").slice(0, 500),
    slides: [
      { slideIndex: 1, role: "cover" as const, message: thesis, supportingPoints: [purpose] },
      { slideIndex: 2, role: "executive_summary" as const, message: "核心判断与关键依据", supportingPoints: source.slice(0, 4).map((item) => item.slice(0, 160)) },
      ...body,
      { slideIndex: pages, role: "conclusion" as const, message: "结论与下一步", supportingPoints: source.slice(-3).map((item) => item.slice(0, 160)) }
    ].slice(0, pages)
  };
}
