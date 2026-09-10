import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { appendPreferenceDecision, preferenceLearningSnapshotName, preflightStyleEditInputShape, recommendFromEditHistory } from "../lib/preference-learning.ts";
import { preferenceEventSnapshotName } from "../lib/preference-events.ts";
import { withPreferenceScopeLock } from "../lib/preference-lock.ts";

const output = path.join(process.cwd(), "generated", "probes", "preference-learning");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

const scope = { kind: "local-project-user-placeholder", projectId: "project_preference_learning_acceptance", userKey: "local-user" };
const hash = (seed) => seed.repeat(64).slice(0, 64);
const version = (id, seed, parentVersionId) => ({ versionId: id, contentHash: hash(seed), ...(parentVersionId ? { parentVersionId } : {}) });
const edit = (index, delta, outcome = "accepted") => ({
  idempotencyKey: `acceptance-edit-${index}`,
  before: { deck: version(`deck_before_${index}`, String(index), undefined), style: version(`pack_board@1.0.${index * 2}`, String(index + 2), undefined) },
  after: { deck: version(`deck_after_${index}`, String(index + 4), `deck_before_${index}`), style: version(`pack_board@1.0.${index * 2 + 1}`, String(index + 6), `pack_board@1.0.${index * 2}`) },
  styleDeltas: [delta],
  evidence: { outcome, explicit: true, auditRef: `deck-update-manifest-deck_after_${index}` }
});

const history = [
  edit(1, { dimension: "typography", path: "typography.primary", before: "Arial", after: "Microsoft YaHei" }),
  edit(2, { dimension: "typography", path: "typography.primary", before: "Calibri", after: "Microsoft YaHei" }),
  edit(3, { dimension: "density", path: "density.score", before: 0.72, after: 0.5 }),
  edit(4, { dimension: "density", path: "density.score", before: 0.66, after: 0.46 }),
  edit(5, { dimension: "chart", path: "charts.gridlines", before: false, after: true }, "reverted"),
  edit(6, { dimension: "chart", path: "charts.gridlines", before: false, after: true }, "reverted"),
  edit(7, { dimension: "color", path: "colors.accent", before: "#0055aa", after: "#ff9900" })
];
const styleVersions = new Map();
for (const item of history) for (const ref of [item.before.style, item.after.style]) styleVersions.set(ref.versionId, ref.contentHash);
const trustedArtifacts = {
  schema: "ppt-factory/preference-learning-trusted-artifacts/v1",
  source: "persisted-local-artifacts",
  projectId: scope.projectId,
  deckUpdates: history.map((item) => ({
    auditRef: item.evidence.auditRef,
    source: { versionId: item.before.deck.versionId, contentHash: item.before.deck.contentHash },
    output: { versionId: item.after.deck.versionId, contentHash: item.after.deck.contentHash, projectId: scope.projectId }
  })),
  styleVersions: [...styleVersions].map(([versionId, contentHash]) => ({ versionId, contentHash }))
};

const firstBatch = recommendFromEditHistory(scope, history.slice(0, 3), { trustedArtifacts });
const result = recommendFromEditHistory(scope, history.slice(3), { trustedArtifacts, existingJournal: firstBatch.journal });
const retry = recommendFromEditHistory(scope, structuredClone(history.slice(3)), { trustedArtifacts, existingJournal: result.journal });
assert.equal(firstBatch.appended, 3);
assert.equal(result.appended, 4);
assert.equal(retry.appended, 0);
assert.deepEqual(retry.journal, result.journal);
assert.equal(result.profile.recommendations.length, 3);
assert.equal(result.profile.withheld.length, 1);
assert.equal(result.proposal.automaticMutation, false);
const firstDecision = appendPreferenceDecision(undefined, result.proposal, { decision: "accept", decisionKey: "acceptance-decision", explicitOptIn: true });
const decisionRetry = appendPreferenceDecision(firstDecision.journal, result.proposal, { decision: "accept", decisionKey: "acceptance-decision", explicitOptIn: true });
assert.equal(decisionRetry.appended, false);
assert.equal(firstDecision.decision.downstreamMutationPerformed, false);
assert.throws(() => preflightStyleEditInputShape({ idempotencyKey: "broken" }), /malformed ingestion shape/);
let concurrentRevision = 0;
await Promise.all(Array.from({ length: 8 }, () => withPreferenceScopeLock(scope.projectId, scope.userKey, async () => {
  const before = concurrentRevision;
  await Promise.resolve();
  concurrentRevision = before + 1;
})));
const learningRouteSource = await readFile(path.join(process.cwd(), "app", "api", "preferences", "learning", "route.ts"), "utf8");
const eventsRouteSource = await readFile(path.join(process.cwd(), "app", "api", "preferences", "events", "route.ts"), "utf8");
const storeSource = await readFile(path.join(process.cwd(), "storage", "preference-store.ts"), "utf8");

await Promise.all([
  writeFile(path.join(output, "preference-edit-events.json"), JSON.stringify(result.journal, null, 2)),
  writeFile(path.join(output, "learned-preference-profile.json"), JSON.stringify(result.profile, null, 2)),
  writeFile(path.join(output, "preference-recommendation-proposal.json"), JSON.stringify(result.proposal, null, 2)),
  writeFile(path.join(output, "preference-recommendation-decisions.json"), JSON.stringify(firstDecision.journal, null, 2))
]);
const acceptance = {
  schema: "ppt-factory/preference-learning-acceptance/v1",
  status: "PASS",
  checks: {
    appendOnlyMerge: firstBatch.journal.events.length === 3 && result.journal.events.length === 7,
    callerOrderPreserved: result.journal.events.map((event) => event.idempotencyKey).join("|") === history.map((event) => event.idempotencyKey).join("|"),
    sequenceIndependentIdentity: firstBatch.journal.events.every((event, index) => result.journal.events[index].eventId === event.eventId),
    durableIdempotency: retry.appended === 0 && retry.journal.events.length === 7,
    concurrentLock: concurrentRevision === 8,
    sharedScopedMigration: preferenceEventSnapshotName(scope.userKey) === "preference-local-user-events-snapshot"
      && preferenceLearningSnapshotName(scope.userKey) === "preference-local-user-learning-snapshot"
      && learningRouteSource.includes("loadPreferenceEventState") && eventsRouteSource.includes("loadPreferenceEventState"),
    atomicRevisionedSnapshot: storeSource.includes("rename(temporary, target)") && storeSource.includes("snapshot.revision !== expectedRevision + 1"),
    malformedPreflight: true,
    trustedImmutableEvidence: result.journal.events.every((event) => trustedArtifacts.deckUpdates.some((item) => item.auditRef === event.evidence.auditRef && item.output.contentHash === event.after.deck.contentHash)),
    minimumEvidence: result.profile.recommendations.every((item) => item.evidenceCount >= 2 && item.independentDeckVersions >= 2),
    confidenceGate: result.profile.recommendations.every((item) => item.confidence >= result.profile.policy.minimumConfidence),
    oneOffWithheld: result.profile.withheld.some((item) => item.path === "colors.accent"),
    dryRunProposal: result.proposal.mode === "dry-run" && result.proposal.automaticMutation === false,
    appendOnlyDecision: firstDecision.journal.decisions.length === 1 && decisionRetry.appended === false,
    explicitDecisionNoMutation: firstDecision.decision.explicitOptIn === true && firstDecision.decision.downstreamMutationPerformed === false
  },
  counts: { events: result.journal.events.length, recommendations: result.profile.recommendations.length, withheld: result.profile.withheld.length, decisions: firstDecision.journal.decisions.length },
  artifacts: ["preference-edit-events.json", "learned-preference-profile.json", "preference-recommendation-proposal.json", "preference-recommendation-decisions.json"]
};
assert.ok(Object.values(acceptance.checks).every(Boolean));
await writeFile(path.join(output, "acceptance.json"), JSON.stringify(acceptance, null, 2));
console.log(JSON.stringify(acceptance, null, 2));
