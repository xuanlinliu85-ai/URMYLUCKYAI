export type ReferenceSlideRole =
  | "cover"
  | "agenda_section"
  | "summary"
  | "evidence_data"
  | "comparison"
  | "process_timeline"
  | "closing"
  | "other";

export type RenderedPageEvidence = {
  width: number;
  height: number;
  meanLuminance: number;
  lightPixelRatio: number;
  entropy: number;
};

export type ReferenceSlideRoleInput = {
  slide: number;
  slideCount: number;
  texts: string[];
  shapeCount: number;
  chartCount: number;
  imageCount: number;
  tableCount: number;
  connectorCount: number;
  renderedPage?: RenderedPageEvidence;
};

export type ReferenceSlideRoleInference = {
  slide: number;
  role: ReferenceSlideRole;
  confidence: number;
  evidence: string[];
  signals: {
    title: string;
    textCharacters: number;
    textBlocks: number;
    numericTokens: number;
    shapeCount: number;
    chartCount: number;
    imageCount: number;
    tableCount: number;
    connectorCount: number;
    renderedPage: RenderedPageEvidence | null;
  };
};

const keywordGroups: Record<Exclude<ReferenceSlideRole, "cover" | "other">, RegExp> = {
  agenda_section: /(?:目录|议程|章节|第[一二三四五六七八九十\d]+[章节部分]|\bagenda\b|\bcontents?\b|\bsection\b)/i,
  summary: /(?:摘要|概览|要点|核心观点|结论先行|执行摘要|小结|summary|overview|key\s*(?:takeaways?|findings?|messages?))/i,
  evidence_data: /(?:数据|指标|趋势|同比|环比|占比|规模|增速|预测|测算|evidence|data|metrics?|trend|forecast|growth|revenue|volume)/i,
  comparison: /(?:对比|比较|差异|竞品|优劣|\bversus\b|\bvs\.?\b|comparison|benchmark)/i,
  process_timeline: /(?:流程|路径|阶段|步骤|时间轴|里程碑|进度|路线图|process|timeline|roadmap|milestone|step\s*\d)/i,
  closing: /(?:谢谢|感谢|问答|交流讨论|敬请指正|thank\s*you|questions?|q\s*&\s*a|discussion)/i
};

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function keywordEvidence(role: keyof typeof keywordGroups, text: string, scores: Record<ReferenceSlideRole, number>, evidence: Record<ReferenceSlideRole, string[]>) {
  if (!keywordGroups[role].test(text)) return;
  scores[role] += role === "summary" || role === "closing" ? 4 : 3;
  evidence[role].push(`xml:text-keyword:${role}`);
}

export function inferReferenceSlideRole(input: ReferenceSlideRoleInput): ReferenceSlideRoleInference {
  const texts = input.texts.map((text) => text.trim()).filter(Boolean);
  const combined = texts.join(" ").replace(/\s+/g, " ");
  const title = texts[0] ?? "";
  const numericTokens = combined.match(/(?:\d[\d,.]*\s*%?|[一二三四五六七八九十]+(?:亿|万|%))/g)?.length ?? 0;
  const roles: ReferenceSlideRole[] = ["cover", "agenda_section", "summary", "evidence_data", "comparison", "process_timeline", "closing", "other"];
  const scores = Object.fromEntries(roles.map((role) => [role, role === "other" ? 0.9 : 0])) as Record<ReferenceSlideRole, number>;
  const evidence = Object.fromEntries(roles.map((role) => [role, [] as string[]])) as Record<ReferenceSlideRole, string[]>;

  if (input.slide === 1) {
    scores.cover += 4.5;
    evidence.cover.push("deck-position:first-slide");
  }
  if (combined.length > 0 && combined.length <= 100 && texts.length <= 5) {
    scores.cover += 1;
    evidence.cover.push("xml:sparse-title-page");
  }
  if (title.length > 0 && title.length <= 48) {
    scores.cover += 0.25;
    evidence.cover.push("xml:short-leading-title");
  }

  for (const role of Object.keys(keywordGroups) as Array<keyof typeof keywordGroups>) {
    keywordEvidence(role, combined, scores, evidence);
  }

  if (input.chartCount > 0 || input.tableCount > 0) {
    scores.evidence_data += 2.2 + Math.min(1.2, input.chartCount * 0.4 + input.tableCount * 0.35);
    evidence.evidence_data.push(`xml:native-data-objects=${input.chartCount + input.tableCount}`);
  }
  if (numericTokens >= 3) {
    scores.evidence_data += Math.min(1.5, numericTokens / 5);
    evidence.evidence_data.push(`xml:numeric-tokens=${numericTokens}`);
  }
  if (/(?:^|\s)(?:vs\.?|versus)(?:\s|$)/i.test(` ${combined} `) || /(?:高|低|优|劣).{0,12}(?:高|低|优|劣)/.test(combined)) {
    scores.comparison += 1;
    evidence.comparison.push("xml:paired-comparison-language");
  }
  if (input.connectorCount >= 2 || input.shapeCount >= 6) {
    scores.process_timeline += input.connectorCount >= 2 ? 1.2 : 0.4;
    evidence.process_timeline.push(`xml:diagram-structure=shapes:${input.shapeCount},connectors:${input.connectorCount}`);
  }
  if (input.slide === input.slideCount && combined.length <= 120) {
    scores.closing += 1.5;
    evidence.closing.push("deck-position:last-sparse-slide");
  }
  if (texts.length >= 3 && texts.length <= 10 && input.slide <= Math.max(3, Math.ceil(input.slideCount * 0.25))) {
    scores.summary += 0.35;
    evidence.summary.push("deck-position:early-multi-point-slide");
  }

  if (input.renderedPage) {
    const rendered = input.renderedPage;
    const renderToken = `render:light=${round(rendered.lightPixelRatio)},entropy=${round(rendered.entropy)}`;
    if (rendered.entropy < 1 && combined.length <= 120 && input.slide !== 1) {
      scores.agenda_section += 4;
      evidence.agenda_section.push(renderToken, "render:low-entropy-section-divider");
    } else if (rendered.lightPixelRatio < 0.55 && combined.length <= 120) {
      scores.cover += 0.8;
      evidence.cover.push(renderToken);
    } else if (rendered.lightPixelRatio > 0.82 && combined.length > 300) {
      scores.summary += 0.15;
      evidence.summary.push(renderToken);
    } else {
      evidence.other.push(renderToken);
    }
  } else {
    evidence.other.push("render:unavailable");
  }

  const ranked = roles.map((role) => ({ role, score: scores[role] })).sort((a, b) => b.score - a.score || roles.indexOf(a.role) - roles.indexOf(b.role));
  let selected = ranked[0];
  const runnerUp = ranked[1];
  const hasStrongSemanticSignal = selected.score >= 2.5 && evidence[selected.role].some((item) => item.includes("keyword") || item.includes("native-data"));
  if (selected.role !== "other" && selected.score < 1.5) selected = { role: "other", score: scores.other };
  if (selected.role !== "other" && selected.score - runnerUp.score < 0.2 && !hasStrongSemanticSignal) selected = { role: "other", score: scores.other };

  const selectedRunnerUp = ranked.find((item) => item.role !== selected.role)?.score ?? 0;
  const margin = Math.max(0, selected.score - selectedRunnerUp);
  const confidence = selected.role === "other"
    ? Math.min(0.55, 0.34 + margin * 0.08)
    : Math.min(0.98, 0.4 + (selected.score / (selected.score + 3)) * 0.35 + (margin / (selected.score + 1)) * 0.25);
  const selectedEvidence = evidence[selected.role].length ? evidence[selected.role] : evidence.other;

  return {
    slide: input.slide,
    role: selected.role,
    confidence: round(confidence),
    evidence: [...selectedEvidence].sort(),
    signals: {
      title,
      textCharacters: combined.length,
      textBlocks: texts.length,
      numericTokens,
      shapeCount: input.shapeCount,
      chartCount: input.chartCount,
      imageCount: input.imageCount,
      tableCount: input.tableCount,
      connectorCount: input.connectorCount,
      renderedPage: input.renderedPage ?? null
    }
  };
}
