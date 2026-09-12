import { readFile } from "node:fs/promises";

const requiredTopLevel = [
  "schema_version", "artifact_id", "artifact_type", "title", "as_of", "generated_at",
  "subject", "request", "facts", "conclusions", "sources", "quality", "provenance",
];

function duplicateIds(items, key) {
  const seen = new Set();
  return items.map((item) => item?.[key]).filter((id) => id && (seen.has(id) || !seen.add(id)));
}

export function validateResearchArtifact(value) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) return ["artifact must be a JSON object"];
  for (const key of requiredTopLevel) if (!(key in value)) errors.push(`missing ${key}`);
  if (value.schema_version !== "1.0.0") errors.push("schema_version must equal 1.0.0");
  for (const key of ["artifact_id", "artifact_type", "title", "as_of", "generated_at"]) {
    if (typeof value[key] !== "string" || value[key].length === 0) errors.push(`${key} must be a non-empty string`);
  }
  for (const key of ["facts", "conclusions", "sources"]) if (!Array.isArray(value[key])) errors.push(`${key} must be an array`);
  if (!value.subject || typeof value.subject.kind !== "string" || typeof value.subject.name !== "string") errors.push("subject requires kind and name");
  if (!value.request || !Array.isArray(value.request.requested_outputs) || !Array.isArray(value.request.constraints)) errors.push("request requires requested_outputs and constraints arrays");
  if (!value.quality || !Array.isArray(value.quality.unresolved_conflicts) || !Array.isArray(value.quality.warnings)) errors.push("quality requires unresolved_conflicts and warnings arrays");
  const provenanceArrays = ["project_owners", "capabilities_used", "skills_used", "tools_used", "knowledge_refs"];
  if (!value.provenance || provenanceArrays.some((key) => !Array.isArray(value.provenance?.[key]))) errors.push(`provenance requires arrays: ${provenanceArrays.join(", ")}`);
  if (value.provenance?.orchestration_mode === "direct_research_os" && value.provenance?.orchestrator !== null) errors.push("direct_research_os requires orchestrator = null");

  const facts = Array.isArray(value.facts) ? value.facts : [];
  const conclusions = Array.isArray(value.conclusions) ? value.conclusions : [];
  const sources = Array.isArray(value.sources) ? value.sources : [];
  const factIds = new Set(facts.map((item) => item?.fact_id).filter(Boolean));
  const sourceIds = new Set(sources.map((item) => item?.source_id).filter(Boolean));
  for (const id of duplicateIds(facts, "fact_id")) errors.push(`duplicate fact_id ${id}`);
  for (const id of duplicateIds(conclusions, "conclusion_id")) errors.push(`duplicate conclusion_id ${id}`);
  for (const id of duplicateIds(sources, "source_id")) errors.push(`duplicate source_id ${id}`);
  for (const fact of facts) {
    if (!fact?.fact_id || !fact?.statement || !Array.isArray(fact?.source_ids)) errors.push("each fact requires fact_id, statement and source_ids");
    for (const sourceId of fact?.source_ids || []) if (!sourceIds.has(sourceId)) errors.push(`fact ${fact.fact_id} references unknown source ${sourceId}`);
  }
  for (const conclusion of conclusions) {
    if (!conclusion?.conclusion_id || !conclusion?.statement || !Array.isArray(conclusion?.fact_ids) || !Array.isArray(conclusion?.source_ids)) errors.push("each conclusion requires id, statement, fact_ids and source_ids");
    if (typeof conclusion?.confidence !== "number" || conclusion.confidence < 0 || conclusion.confidence > 1) errors.push(`conclusion ${conclusion?.conclusion_id || "unknown"} has invalid confidence`);
    for (const factId of conclusion?.fact_ids || []) if (!factIds.has(factId)) errors.push(`conclusion ${conclusion.conclusion_id} references unknown fact ${factId}`);
    for (const sourceId of conclusion?.source_ids || []) if (!sourceIds.has(sourceId)) errors.push(`conclusion ${conclusion.conclusion_id} references unknown source ${sourceId}`);
  }
  return errors;
}

export function assertResearchArtifact(value) {
  const errors = validateResearchArtifact(value);
  if (errors.length) throw new Error(`Research Artifact contract failed:\n- ${errors.join("\n- ")}`);
  return value;
}

export async function readResearchArtifact(file) {
  return assertResearchArtifact(JSON.parse(await readFile(file, "utf8")));
}
