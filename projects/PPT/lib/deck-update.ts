import path from "node:path";
import type { ArtifactStage } from "@/storage/local-store";

export type DeckUpdateSource = {
  projectId?: string;
  stage: Extract<ArtifactStage, "input" | "output">;
  name: string;
  versionId: string;
};

export function validateVersionId(value: string, label = "versionId") {
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) throw new Error(`${label} must contain only letters, numbers, underscore or hyphen`);
  return value;
}

export function validateArtifactName(value: string) {
  if (typeof value !== "string" || !value.toLowerCase().endsWith(".pptx") || path.isAbsolute(value)) throw new Error("Source name must be a relative .pptx path");
  const normalized = path.normalize(value);
  if (normalized === ".." || normalized.startsWith(`..${path.sep}`)) throw new Error("Source name must stay inside the selected project stage");
  return normalized;
}
