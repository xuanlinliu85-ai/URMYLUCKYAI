export type DeckUpdateTextTarget = { targetId: string; slideIndex: number; kind: "text"; stableId?: string; objectName?: string; value: string };
export type DeckUpdateChartTarget = { targetId: string; slideIndex: number; kind: "chart"; stableId?: string; objectName?: string; chart: { categories: string[]; series: Array<{ name: string; values: number[] }> } };
export type DeckUpdatePlan = { updateId: string; sourceVersionId: string; lockedDimensions?: string[]; targets: Array<DeckUpdateTextTarget | DeckUpdateChartTarget> };
export type DeckUpdateManifest = {
  schema: "ppt-factory/deck-update-manifest/v1";
  updateId: string;
  status: "applied";
  source: { projectId?: string; versionId: string; filename: string; sha256: string; slides: number };
  output: { projectId?: string; versionId: string; filename: string; sha256: string; slides: number };
  planHash: string;
  lockedDimensions: string[];
  changes: Array<{ targetId: string; slideIndex: number; stableId: string; objectId: number; objectName: string; kind: "text" | "chart"; match: "stable-id" | "exact-name"; beforeHash: string; afterHash: string; status: "applied" }>;
  preservation: { untouchedObjects: number; untouchedObjectsStable: boolean; unchangedZipEntries: number; changedParts: string[] };
};
export function normalizeDeckUpdatePlan(plan: DeckUpdatePlan): DeckUpdatePlan & { schema: "ppt-factory/deck-update-plan/v1"; lockedDimensions: string[] };
export function inspectEditableDeck(inputPath: string): Promise<{ schema: string; source: { filename: string; sha256: string; slides: number }; objects: Array<{ slideIndex: number; stableId: string; objectId: number; objectName: string; kind: "text" | "chart" | "other"; containerHash: string }> }>;
export function applyExistingDeckUpdate(input: { sourcePath: string; outputPath: string; plan: DeckUpdatePlan }): Promise<DeckUpdateManifest>;
