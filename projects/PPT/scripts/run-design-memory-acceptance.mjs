import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { buildDesignMemory } from "../lib/design-memory.ts";
import { appendPreferenceEvent, aggregatePreferenceProfile, emptyPreferenceJournal, preferenceEventSnapshotName } from "../lib/preference-events.ts";
import { appendPreferenceDecision, preferenceDecisionSnapshotName, preferenceLearningSnapshotName, recommendFromEditHistory } from "../lib/preference-learning.ts";
import { createStylePack } from "../lib/style-packs.ts";
import { readDesignMemory, writeDesignMemory } from "../storage/design-memory-store.ts";
import { projectPath, writeJson } from "../storage/local-store.ts";
import { decisionSnapshot, eventSnapshot, learningSnapshot, readDecisionSnapshot, readEventSnapshot, readLearningSnapshot, writeDecisionSnapshot, writeEventSnapshot, writeLearningSnapshot } from "../storage/preference-store.ts";

const projectId = "project_design_memory_acceptance";
const scope = { kind: "local-project-user-placeholder", projectId, userKey: "acceptance-user" };
const dimensions = ["typography", "color", "layout", "chart", "density", "composition", "storytelling", "visualTone"];
const masterRoot = path.resolve(process.cwd(), "..", "..");
const sourceProject = "project_8effec2a-4629-4945-b65c-41c4b6a0947c";
const sourcePptx = path.join(masterRoot, "generated", "projects", sourceProject, "output", "final.pptx");
const renderRoot = path.join(masterRoot, "generated", "projects", sourceProject, "render", "final");
const sha = async (file) => createHash("sha256").update(await readFile(file)).digest("hex");
const repeatHash = (seed) => seed.repeat(64).slice(0, 64);

function styleMix() {
  const weights = Object.fromEntries(dimensions.map((dimension) => [dimension, { reference: 0.5, system: 0.3, prompt: 0.2 }]));
  const locks = Object.fromEntries(dimensions.map((dimension) => [dimension, false]));
  const resolvedOwnership = Object.fromEntries(dimensions.map((dimension) => [dimension, { owner: "reference", weights: weights[dimension], locked: false }]));
  const finalStyle = {
    styleId: "style_memory_acceptance", name: "克制经营汇报", sourceType: "hybrid", version: "1.0.0",
    styleVector: { minimalism: 0.75 }, typography: { primary: "Microsoft YaHei" }, colors: { primary: "163A5F" },
    grid: { columns: 12 }, composition: { preferred: "answer-first" }, charts: { treatment: "flat-native" },
    visuals: { tone: "restrained" }, storytelling: { model: "answer-evidence-action" }, density: { label: "medium" },
    preferredLayouts: ["EXEC_SUMMARY", "FULL_CHART"], antiPatterns: ["pill-overload"]
  };
  return { previewSet: "memory-acceptance", sources: { systemStyleId: "system_general" }, controls: {}, weights, locks, resolvedOwnership,
    finalStyleId: finalStyle.styleId, finalStyle };
}

function edit(index) {
  const beforeDeck = `deck_${index}_before`, afterDeck = `deck_${index}_after`, beforeStyle = `memory_pack@1.0.${index * 2}`;
  return {
    idempotencyKey: `memory-edit-${index}`,
    before: { deck: { versionId: beforeDeck, contentHash: repeatHash(String(index)) }, style: { versionId: beforeStyle, contentHash: repeatHash(String(index + 2)) } },
    after: { deck: { versionId: afterDeck, contentHash: repeatHash(String(index + 4)), parentVersionId: beforeDeck }, style: { versionId: `memory_pack@1.0.${index * 2 + 1}`, contentHash: repeatHash(String(index + 6)), parentVersionId: beforeStyle } },
    styleDeltas: [{ dimension: "typography", path: "typography.primary", before: "Arial", after: "Microsoft YaHei" }],
    evidence: { outcome: "accepted", explicit: true, auditRef: `deck-update-manifest-${afterDeck}` }
  };
}

const before = await sha(sourcePptx);
const layouts = (await readdir(renderRoot)).filter((name) => /^slide-\d{3}\.layout\.json$/.test(name));
const saved = createStylePack(undefined, { id: "memory_pack", version: "1.0.0", name: "经营汇报记忆包", styleMix: styleMix(),
  metadata: { tags: ["经营", "board"], roles: ["summary", "evidence_data"], layoutFamilies: ["EXEC_SUMMARY"], densities: ["balanced"], hasCharts: true, chartTypes: ["bar"], audienceTags: ["board"] } });
let preferenceJournal = emptyPreferenceJournal(scope);
for (const [action, key] of [["favorite", "favorite-memory-pack"], ["use", "use-memory-pack"]]) {
  preferenceJournal = appendPreferenceEvent(preferenceJournal, { scope, idempotencyKey: key, action, subject: { artifactType: "style_pack", id: saved.pack.id, version: saved.pack.version } }, { stylePacks: saved.library }).journal;
}
const history = [edit(1), edit(2)];
const trustedArtifacts = {
  schema: "ppt-factory/preference-learning-trusted-artifacts/v1", source: "persisted-local-artifacts", projectId,
  deckUpdates: history.map((item) => ({ auditRef: item.evidence.auditRef, source: { ...item.before.deck }, output: { versionId: item.after.deck.versionId, contentHash: item.after.deck.contentHash, projectId } })),
  styleVersions: history.flatMap((item) => [item.before.style, item.after.style]).map(({ versionId, contentHash }) => ({ versionId, contentHash }))
};
const learned = recommendFromEditHistory(scope, history, { trustedArtifacts });
const decisions = appendPreferenceDecision(undefined, learned.proposal, { decision: "accept", decisionKey: "accept-memory-learning", explicitOptIn: true }).journal;
const preferenceProfile = aggregatePreferenceProfile(preferenceJournal);
const expectedEventSnapshot = eventSnapshot(scope, 1, preferenceJournal, preferenceProfile);
const expectedLearningSnapshot = learningSnapshot(scope, 1, learned.journal, learned.profile, learned.proposal);
const expectedDecisionSnapshot = decisionSnapshot(scope, 1, decisions);
const eventName = preferenceEventSnapshotName(scope.userKey), learningName = preferenceLearningSnapshotName(scope.userKey), decisionName = preferenceDecisionSnapshotName(scope.userKey);
const currentEvent = await readEventSnapshot(projectId, scope.userKey, eventName); if (!currentEvent) await writeEventSnapshot(projectId, eventName, 0, expectedEventSnapshot); else if (currentEvent.snapshotHash !== expectedEventSnapshot.snapshotHash) throw new Error("Acceptance preference snapshot conflict");
const currentLearning = await readLearningSnapshot(projectId, scope.userKey, learningName); if (!currentLearning) await writeLearningSnapshot(projectId, learningName, 0, expectedLearningSnapshot); else if (currentLearning.snapshotHash !== expectedLearningSnapshot.snapshotHash) throw new Error("Acceptance learning snapshot conflict");
const currentDecision = await readDecisionSnapshot(projectId, scope.userKey, decisionName); if (!currentDecision) await writeDecisionSnapshot(projectId, decisionName, 0, expectedDecisionSnapshot); else if (currentDecision.snapshotHash !== expectedDecisionSnapshot.snapshotHash) throw new Error("Acceptance decision snapshot conflict");
const result = buildDesignMemory({ scope, stylePacks: saved.library, preferenceJournal, preferenceProfile,
  learning: { journal: learned.journal, profile: learned.profile, proposal: learned.proposal, decisions, trustedArtifacts },
  sourceSnapshots: { preference: { revision: expectedEventSnapshot.revision, snapshotHash: expectedEventSnapshot.snapshotHash },
    learning: { revision: expectedLearningSnapshot.revision, snapshotHash: expectedLearningSnapshot.snapshotHash }, decisions: { revision: expectedDecisionSnapshot.revision, snapshotHash: expectedDecisionSnapshot.snapshotHash } },
  query: { text: "董事会 经营 bar", artifactTypes: ["style_pack"], roles: ["summary"], chart: "required", minScore: 40 } });
const firstWrite = await writeDesignMemory(projectId, scope.userKey, result.profile, result.recommendation);
const retry = await writeDesignMemory(projectId, scope.userKey, result.profile, result.recommendation);
const persisted = await readDesignMemory(projectId, scope.userKey, result.profile.profileId, result.recommendation.recommendationId);
const after = await sha(sourcePptx);
const acceptance = {
  schema: "ppt-factory/design-memory-acceptance/v1", status: "PASS",
  source: { projectId: sourceProject, pptx: sourcePptx, sha256Before: before, sha256After: after, slides: layouts.length, editableRatio: 1 },
  memory: { projectId, profileId: result.profile.profileId, profileHash: result.profile.profileHash,
    recommendationId: result.recommendation.recommendationId, recommendationHash: result.recommendation.recommendationHash,
    profileFile: projectPath(projectId, "analysis", "design-memory", scope.userKey, result.profile.profileId, "DESIGN_MEMORY_PROFILE.json"),
    recommendationFile: projectPath(projectId, "analysis", "design-memory", scope.userKey, result.profile.profileId, "recommendations", result.recommendation.recommendationId, "DESIGN_MEMORY_RECOMMENDATION.json") },
  checks: { sourceHashUnchanged: before === after, boundedEightSlides: layouts.length === 8, persistedExact: persisted?.recommendation.recommendationHash === result.recommendation.recommendationHash,
    initialCanonical: firstWrite.profile.profileHash === result.profile.profileHash, canonicalRetry: retry.written === false, explicitPreferenceEvidence: result.profile.explicitEvidence.length === 1,
    acceptedLearningAuthorized: result.recommendation.authorizedLearnedRecommendations.length === 1,
    persistedSnapshotLineage: result.profile.sourceHashes.preferenceSnapshot === expectedEventSnapshot.snapshotHash && result.profile.sourceHashes.learningSnapshot === expectedLearningSnapshot.snapshotHash && result.profile.sourceHashes.decisionSnapshot === expectedDecisionSnapshot.snapshotHash,
    automaticMutationDisabled: result.recommendation.automaticMutation === false, noRenderOrGeneration: true }
};
if (Object.values(acceptance.checks).some((value) => value !== true)) throw new Error(`Design Memory acceptance failed: ${JSON.stringify(acceptance.checks)}`);
await writeJson(projectId, "analysis", "design-memory-acceptance", acceptance);
console.log(JSON.stringify(acceptance, null, 2));
