import { assertResearchArtifact } from "../../../../contracts/research-artifact/validate.mjs";

export { assertResearchArtifact };

export function artifactToPresentationText(input) {
  const artifact = assertResearchArtifact(input);
  const facts = artifact.facts.map((item) => `事实[${item.fact_id}] ${item.statement}${item.value == null ? "" : `：${item.value}${item.unit || ""}`}`);
  const conclusions = artifact.conclusions.map((item) => `结论[${item.conclusion_id}] ${item.statement}（置信度 ${item.confidence}）`);
  const risks = (artifact.risks || []).map((item) => `风险：${typeof item === "string" ? item : JSON.stringify(item)}`);
  const watchpoints = (artifact.watchpoints || []).map((item) => `观察：${typeof item === "string" ? item : JSON.stringify(item)}`);
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
