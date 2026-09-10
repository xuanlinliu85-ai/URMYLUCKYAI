export interface ResearchArtifact {
  schema_version: "1.0.0";
  artifact_id: string;
  artifact_type: string;
  title: string;
  as_of: string;
  facts: Array<{ fact_id: string; statement: string; value?: string | number | boolean | null; unit?: string | null }>;
  conclusions: Array<{ conclusion_id: string; statement: string; confidence: number }>;
  risks?: string[];
  watchpoints?: string[];
  sources: Array<{ source_id: string; title: string; provider?: string | null }>;
  quality: Record<string, unknown>;
  provenance: { orchestrator: "deerflow"; [key: string]: unknown };
}
export function assertResearchArtifact(value: unknown): ResearchArtifact;
export function artifactToPresentationText(input: unknown): string;
