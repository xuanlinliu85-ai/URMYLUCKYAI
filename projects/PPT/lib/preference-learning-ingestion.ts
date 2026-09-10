import type { DeckUpdateManifest } from "@/adapters/native-pptx/update-existing-deck.mjs";
import { getStylePack, normalizeStylePackLibrary, type StylePackLibrary } from "@/lib/style-packs";
import { PreferenceLearningError, preflightStyleEditInputShape, type StyleEditInput, type TrustedPreferenceLearningArtifacts } from "@/lib/preference-learning";

export type PersistedPreferenceLearningSources = {
  deckUpdates: Array<{ artifactName: string; manifest: DeckUpdateManifest }>;
  stylePacks: StylePackLibrary;
};

export function ingestTrustedPreferenceLearningArtifacts(
  projectId: string,
  inputs: StyleEditInput[],
  persisted: PersistedPreferenceLearningSources
): TrustedPreferenceLearningArtifacts {
  if (!Array.isArray(inputs) || inputs.length === 0) throw new PreferenceLearningError("A non-empty edit history is required");
  inputs.forEach((input, index) => preflightStyleEditInputShape(input, index));
  if (!/^[a-zA-Z0-9_-]+$/.test(projectId ?? "")) throw new PreferenceLearningError("A valid projectId is required");
  if (!persisted || !Array.isArray(persisted.deckUpdates) || !persisted.stylePacks) {
    throw new PreferenceLearningError("Persisted deck-update manifests and Style Packs are required", "NOT_FOUND");
  }
  const requestedAuditRefs = new Set(inputs.map((item) => item.evidence.auditRef));
  const deckUpdates = persisted.deckUpdates.map(({ artifactName, manifest }) => {
    if (!manifest || manifest.schema !== "ppt-factory/deck-update-manifest/v1" || manifest.status !== "applied"
      || artifactName !== `deck-update-manifest-${manifest.output.versionId}` || manifest.updateId !== manifest.output.versionId
      || manifest.output.projectId !== projectId) {
      throw new PreferenceLearningError(`Persisted deck-update manifest is invalid or not owned by project: ${artifactName}`, "CONFLICT");
    }
    return {
      auditRef: artifactName,
      source: { versionId: manifest.source.versionId, contentHash: manifest.source.sha256, ...(manifest.source.projectId ? { projectId: manifest.source.projectId } : {}) },
      output: { versionId: manifest.output.versionId, contentHash: manifest.output.sha256, projectId }
    };
  });
  if ([...requestedAuditRefs].some((auditRef) => !deckUpdates.some((item) => item.auditRef === auditRef))) {
    throw new PreferenceLearningError("Every edit auditRef must resolve to a persisted immutable deck-update manifest", "NOT_FOUND");
  }
  const library = normalizeStylePackLibrary(persisted.stylePacks);
  const requestedStyleVersions = new Set(inputs.flatMap((item) => [item.before.style.versionId, item.after.style.versionId]));
  for (const [index, input] of inputs.entries()) {
    const beforeSeparator = input.before.style.versionId.lastIndexOf("@");
    const afterSeparator = input.after.style.versionId.lastIndexOf("@");
    if (beforeSeparator <= 0 || afterSeparator <= 0
      || input.before.style.versionId.slice(0, beforeSeparator) !== input.after.style.versionId.slice(0, afterSeparator)) {
      throw new PreferenceLearningError(`Edit event ${index + 1} style versions must belong to the same immutable Style Pack`, "CONFLICT");
    }
  }
  const styleVersions = [...requestedStyleVersions].map((versionId) => {
    const separator = versionId.lastIndexOf("@");
    if (separator <= 0 || separator === versionId.length - 1) {
      throw new PreferenceLearningError(`Style version must use immutable Style Pack identity id@version: ${versionId}`);
    }
    const pack = getStylePack(library, versionId.slice(0, separator), versionId.slice(separator + 1));
    return { versionId, contentHash: pack.contentHash };
  });
  return {
    schema: "ppt-factory/preference-learning-trusted-artifacts/v1",
    source: "persisted-local-artifacts",
    projectId,
    deckUpdates,
    styleVersions: styleVersions.sort((a, b) => a.versionId.localeCompare(b.versionId, "en"))
  };
}
