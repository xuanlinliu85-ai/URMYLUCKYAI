import { NextResponse } from "next/server";
import type { DeckUpdateManifest } from "@/adapters/native-pptx/update-existing-deck.mjs";
import { buildDesignMemory, DesignMemoryError, type DesignMemoryInput } from "@/lib/design-memory";
import { classifyDesignMemoryHttpError, parseDesignMemoryPostRequest } from "@/lib/design-memory-api";
import { loadPreferenceEventState } from "@/lib/preference-event-migration";
import { preferenceDecisionSnapshotName, preferenceLearningSnapshotName, preflightStyleEditInputShape, validatePreferenceUserKey, type StyleEditInput, type StyleEditJournal } from "@/lib/preference-learning";
import { ingestTrustedPreferenceLearningArtifacts } from "@/lib/preference-learning-ingestion";
import { withPreferenceScopeLock } from "@/lib/preference-lock";
import type { StylePackLibrary } from "@/lib/style-packs";
import type { GoldenSlideLibrary } from "@/lib/types";
import { readDesignMemory, writeDesignMemory } from "@/storage/design-memory-store";
import { readJson } from "@/storage/local-store";
import { readDecisionSnapshot, readLearningSnapshot } from "@/storage/preference-store";

export const runtime = "nodejs";
const scope = (projectId: string, userKey: string) => ({ kind: "local-project-user-placeholder" as const, projectId, userKey });
async function optionalArtifact<T>(projectId: string, stage: "analysis" | "style", name: string) {
  try { return await readJson<T>(projectId, stage, name); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; if (error instanceof SyntaxError) throw new DesignMemoryError(`Persisted artifact is corrupt: ${name}`, "INTEGRITY"); throw error; }
}
async function trustedLearningArtifacts(projectId: string, journal: StyleEditJournal, stylePacks: StylePackLibrary) {
  const inputs = journal.events.map(({ schema: _schema, eventId: _eventId, sequence: _sequence, ...input }) => input as StyleEditInput);
  inputs.forEach((input, index) => preflightStyleEditInputShape(input, index));
  const names = [...new Set(inputs.map((input) => {
    if (!/^[a-zA-Z0-9_-]+$/.test(input.after.deck.versionId)) throw new DesignMemoryError("Learning deck version cannot identify a persisted manifest", "INTEGRITY");
    const name = `deck-update-manifest-${input.after.deck.versionId}`;
    if (input.evidence.auditRef !== name) throw new DesignMemoryError("Learning auditRef does not identify its persisted deck-update manifest", "INTEGRITY");
    return name;
  }))];
  const deckUpdates = await Promise.all(names.map(async (artifactName) => {
    const outputManifest = await readJson<DeckUpdateManifest>(projectId, "output", artifactName).catch((error) => { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; if (error instanceof SyntaxError) throw new DesignMemoryError(`Persisted artifact is corrupt: ${artifactName}`, "INTEGRITY"); throw error; });
    if (!outputManifest) throw new DesignMemoryError(`Persisted deck-update manifest not found: ${artifactName}`, "INTEGRITY");
    return { artifactName, manifest: outputManifest };
  }));
  try { return ingestTrustedPreferenceLearningArtifacts(projectId, inputs, { deckUpdates, stylePacks }); }
  catch (error) { throw new DesignMemoryError(error instanceof Error ? error.message : "Trusted learning lineage is invalid", "INTEGRITY"); }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url); const projectId = url.searchParams.get("projectId") ?? "";
    const userKey = validatePreferenceUserKey(url.searchParams.get("userKey") ?? "local-user");
    const profileId = url.searchParams.get("profileId") ?? ""; const recommendationId = url.searchParams.get("recommendationId") ?? "";
    if (!projectId || !profileId || !recommendationId) return NextResponse.json({ error: "projectId, profileId and recommendationId are required" }, { status: 400 });
    const memory = await withPreferenceScopeLock(projectId, userKey, () => readDesignMemory(projectId, userKey, profileId, recommendationId));
    if (!memory) return NextResponse.json({ error: "Design Memory was not found", code: "NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ projectId, userKey, ...memory });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const body = await parseDesignMemoryPostRequest(request);
    const projectId = String(body.projectId ?? ""); const userKey = validatePreferenceUserKey(String(body.userKey ?? "local-user"));
    if (!projectId || !body.query || typeof body.query !== "object") return NextResponse.json({ error: "projectId and query are required" }, { status: 400 });
    const query = body.query;
    return await withPreferenceScopeLock(projectId, userKey, async () => {
      const [stylePacks, goldenSlides, preferenceState, learning, decisions] = await Promise.all([
        optionalArtifact<StylePackLibrary>(projectId, "style", "style-packs"), optionalArtifact<GoldenSlideLibrary>(projectId, "analysis", "golden-slides"),
        loadPreferenceEventState(projectId, userKey), readLearningSnapshot(projectId, userKey, preferenceLearningSnapshotName(userKey)),
        readDecisionSnapshot(projectId, userKey, preferenceDecisionSnapshotName(userKey))
      ]);
      if (!stylePacks) throw new DesignMemoryError("Persisted immutable Style Packs are required", "INVALID");
      const trustedLearning = learning ? await trustedLearningArtifacts(projectId, learning.journal, stylePacks) : undefined;
      const result = buildDesignMemory({ scope: scope(projectId, userKey), stylePacks, goldenSlides,
        preferenceJournal: preferenceState.snapshot.journal, preferenceProfile: preferenceState.snapshot.profile,
        ...(learning ? { learning: { journal: learning.journal, profile: learning.profile, proposal: learning.proposal, trustedArtifacts: trustedLearning!, ...(decisions ? { decisions: decisions.journal } : {}) } } : {}),
        sourceSnapshots: { preference: { revision: preferenceState.snapshot.revision, snapshotHash: preferenceState.snapshot.snapshotHash },
          ...(learning ? { learning: { revision: learning.revision, snapshotHash: learning.snapshotHash } } : {}),
          ...(decisions ? { decisions: { revision: decisions.revision, snapshotHash: decisions.snapshotHash } } : {}) }, query });
      const persisted = await writeDesignMemory(projectId, userKey, result.profile, result.recommendation);
      return NextResponse.json({ projectId, userKey, written: persisted.written, mutated: false, profile: persisted.profile, recommendation: persisted.recommendation }, { status: persisted.written ? 201 : 200 });
    });
  } catch (error) { return failure(error); }
}

function failure(error: unknown) {
  const classified = classifyDesignMemoryHttpError(error); return NextResponse.json(classified.body, { status: classified.status });
}
