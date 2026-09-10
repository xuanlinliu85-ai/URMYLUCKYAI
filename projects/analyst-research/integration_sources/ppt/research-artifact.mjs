const required = ["schema_version", "artifact_id", "artifact_type", "title", "facts", "conclusions", "sources", "quality", "provenance"];

export function assertResearchArtifact(value) {
  if (!value || typeof value !== "object") throw new Error("Research Artifact must be a JSON object");
  for (const key of required) if (!(key in value)) throw new Error(`Research Artifact missing ${key}`);
  if (value.schema_version !== "1.0.0") throw new Error("Unsupported Research Artifact schema_version");
  if (value.provenance?.orchestrator !== "deerflow") throw new Error("Research Artifact must originate from deerflow");
  if (!Array.isArray(value.facts) || !Array.isArray(value.conclusions)) throw new Error("Research Artifact facts and conclusions must be arrays");
  return value;
}

export function artifactToPresentationText(input) {
  const artifact = assertResearchArtifact(input);
  const facts = artifact.facts.map((item) => `事实[${item.fact_id}] ${item.statement}${item.value == null ? "" : `：${item.value}${item.unit || ""}`}`);
  const conclusions = artifact.conclusions.map((item) => `结论[${item.conclusion_id}] ${item.statement}（置信度 ${item.confidence}）`);
  const risks = (artifact.risks || []).map((item) => `风险：${item}`);
  const watchpoints = (artifact.watchpoints || []).map((item) => `观察：${item}`);
  const sources = artifact.sources.map((item) => `来源[${item.source_id}] ${item.title}${item.provider ? ` / ${item.provider}` : ""}`);
  return [
    `标题：${artifact.title}`,
    `研究截止：${artifact.as_of}`,
    ...conclusions,
    ...facts,
    ...risks,
    ...watchpoints,
    ...sources,
    `研究底稿ID：${artifact.artifact_id}`,
  ].join("\n");
}
