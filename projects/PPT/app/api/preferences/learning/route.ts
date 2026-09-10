import { NextResponse } from "next/server";
import type { DeckUpdateManifest } from "@/adapters/native-pptx/update-existing-deck.mjs";
import { loadPreferenceEventState } from "@/lib/preference-event-migration";
import {
  appendPreferenceDecision, preferenceDecisionSnapshotName, preferenceLearningSnapshotName,
  PreferenceLearningError, preflightStyleEditInputShape, recommendFromEditHistory,
  validatePreferenceUserKey, type StyleEditInput
} from "@/lib/preference-learning";
import { ingestTrustedPreferenceLearningArtifacts } from "@/lib/preference-learning-ingestion";
import { withPreferenceScopeLock } from "@/lib/preference-lock";
import type { StylePackLibrary } from "@/lib/style-packs";
import type { ArtifactStage } from "@/storage/local-store";
import { readJson } from "@/storage/local-store";
import {
  decisionSnapshot, learningSnapshot, readDecisionSnapshot, readLearningSnapshot,
  writeDecisionSnapshot, writeLearningSnapshot
} from "@/storage/preference-store";

export const runtime = "nodejs";

async function optionalArtifact<T>(projectId: string, stage: ArtifactStage, name: string) {
  try { return await readJson<T>(projectId, stage, name); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
}

async function trustedArtifacts(projectId: string, editHistory: StyleEditInput[]) {
  editHistory.forEach((event, index) => preflightStyleEditInputShape(event, index));
  const artifactNames = [...new Set(editHistory.map((event) => {
    const versionId = event.after.deck.versionId;
    if (!/^[a-zA-Z0-9_-]+$/.test(versionId)) throw new PreferenceLearningError("after.deck.versionId cannot identify a persisted deck-update manifest");
    const artifactName = `deck-update-manifest-${versionId}`;
    if (event.evidence.auditRef !== artifactName) throw new PreferenceLearningError("auditRef must name the persisted immutable deck-update manifest");
    return artifactName;
  }))];
  const deckUpdates = await Promise.all(artifactNames.map(async (artifactName) => {
    const manifest = await optionalArtifact<DeckUpdateManifest>(projectId, "output", artifactName);
    if (!manifest) throw new PreferenceLearningError(`Persisted deck-update manifest not found: ${artifactName}`, "NOT_FOUND");
    return { artifactName, manifest };
  }));
  const stylePacks = await optionalArtifact<StylePackLibrary>(projectId, "style", "style-packs");
  if (!stylePacks) throw new PreferenceLearningError("Persisted immutable Style Packs are required", "NOT_FOUND");
  return ingestTrustedPreferenceLearningArtifacts(projectId, editHistory, { deckUpdates, stylePacks });
}

const scope = (projectId: string, userKey: string) => ({ kind: "local-project-user-placeholder" as const, projectId, userKey });

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      projectId?: string; userKey?: string; operation?: "recommend" | "propose" | "decide";
      explicitOptIn?: boolean; editHistory?: StyleEditInput[]; decision?: "accept" | "reject";
      decisionKey?: string; proposalId?: string;
    };
    const projectId = String(body.projectId ?? "");
    const userKey = validatePreferenceUserKey(String(body.userKey ?? "local-user"));
    const operation = body.operation ?? "recommend";
    if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    if (operation !== "decide") {
      if (!Array.isArray(body.editHistory)) return NextResponse.json({ error: "editHistory is required" }, { status: 400 });
      body.editHistory.forEach((event, index) => preflightStyleEditInputShape(event, index));
    }
    if (operation === "propose" && body.explicitOptIn !== true) throw new PreferenceLearningError("An explicit opt-in is required to persist a preference proposal");
    return await withPreferenceScopeLock(projectId, userKey, async () => {
      const localScope = scope(projectId, userKey);
      const learningName = preferenceLearningSnapshotName(userKey);
      if (operation === "decide") {
        const learning = await readLearningSnapshot(projectId, userKey, learningName);
        const proposal = learning?.proposal;
        if (!proposal) throw new PreferenceLearningError("No persisted preference proposal was found", "NOT_FOUND");
        if (!body.proposalId || body.proposalId !== proposal.proposalId) throw new PreferenceLearningError("The requested proposal is unknown or stale", "NOT_FOUND");
        const decisionName = preferenceDecisionSnapshotName(userKey);
        const current = await readDecisionSnapshot(projectId, userKey, decisionName);
        const result = appendPreferenceDecision(current?.journal, proposal, {
          decision: body.decision as "accept" | "reject", decisionKey: String(body.decisionKey ?? ""), explicitOptIn: body.explicitOptIn
        });
        let revision = current?.revision ?? 0;
        if (result.appended) {
          const next = decisionSnapshot(localScope, revision + 1, result.journal);
          await writeDecisionSnapshot(projectId, decisionName, revision, next);
          revision = next.revision;
        }
        return NextResponse.json({ projectId, revision, appended: result.appended, decision: result.decision, mutated: false }, { status: result.appended ? 201 : 200 });
      }
      const editHistory = body.editHistory as StyleEditInput[];
      const [preferenceState, current] = await Promise.all([
        loadPreferenceEventState(projectId, userKey, { persistMigration: operation === "propose" }),
        readLearningSnapshot(projectId, userKey, learningName)
      ]);
      const existingInputs = (current?.journal.events ?? []).map(({ schema: _schema, eventId: _eventId, sequence: _sequence, ...input }) => input);
      const trusted = await trustedArtifacts(projectId, [...existingInputs, ...editHistory]);
      const result = recommendFromEditHistory(localScope, editHistory, {
        preferenceJournal: preferenceState.snapshot.journal, existingJournal: current?.journal, trustedArtifacts: trusted
      });
      if (operation === "recommend") {
        return NextResponse.json({ projectId, revision: current?.revision ?? 0, dryRun: true, persisted: false, mutated: false, profile: result.profile, proposal: result.proposal });
      }
      if (operation !== "propose") throw new PreferenceLearningError("Unsupported preference learning operation");
      let revision = current?.revision ?? 0;
      if (result.appended) {
        const next = learningSnapshot(localScope, revision + 1, result.journal, result.profile, result.proposal);
        await writeLearningSnapshot(projectId, learningName, revision, next);
        revision = next.revision;
      }
      return NextResponse.json({ projectId, revision, dryRun: false, persisted: true, appended: result.appended, existing: result.existing, mutated: false, profile: result.profile, proposal: result.proposal }, { status: result.appended ? 201 : 200 });
    });
  } catch (error) {
    if (error instanceof PreferenceLearningError) {
      const status = error.code === "NOT_FOUND" ? 404 : error.code === "CONFLICT" ? 409 : 400;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    if (error instanceof Error && /revision conflict|snapshot is invalid/i.test(error.message)) {
      return NextResponse.json({ error: error.message, code: "CONFLICT" }, { status: 409 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Preference learning failed" }, { status: 500 });
  }
}
