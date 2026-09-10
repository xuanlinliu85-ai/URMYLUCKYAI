import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  appendPreferenceDecision,
  buildStyleEditJournal,
  createPreferenceDecision,
  mergeStyleEditJournal,
  preferenceDecisionSnapshotName,
  preferenceLearningSnapshotName,
  preflightStyleEditInputShape,
  recommendFromEditHistory
} from "../lib/preference-learning.ts";
import { preferenceEventSnapshotName } from "../lib/preference-events.ts";
import { withPreferenceScopeLock } from "../lib/preference-lock.ts";

const root = process.cwd();
const scope = { kind: "local-project-user-placeholder", projectId: "project_learning", userKey: "local-user" };
const hash = (seed) => seed.repeat(64).slice(0, 64);
const version = (versionId, seed, parentVersionId) => ({ versionId, contentHash: hash(seed), ...(parentVersionId ? { parentVersionId } : {}) });

function edit(index, delta, evidence = {}) {
  const beforeDeck = `deck_${index}_before`;
  const beforeStyle = `pack_board@1.0.${index * 2}`;
  const afterDeck = `deck_${index}_after`;
  return {
    idempotencyKey: `edit-${index}`,
    before: { deck: version(beforeDeck, String(index % 10)), style: version(beforeStyle, String((index + 2) % 10)) },
    after: {
      deck: version(afterDeck, String((index + 4) % 10), beforeDeck),
      style: version(`pack_board@1.0.${index * 2 + 1}`, String((index + 6) % 10), beforeStyle)
    },
    styleDeltas: [delta],
    evidence: { outcome: "accepted", explicit: true, auditRef: `deck-update-manifest-${afterDeck}`, ...evidence }
  };
}

function trusted(inputs) {
  const styleVersions = new Map();
  for (const input of inputs) for (const ref of [input.before.style, input.after.style]) styleVersions.set(ref.versionId, ref.contentHash);
  return {
    schema: "ppt-factory/preference-learning-trusted-artifacts/v1",
    source: "persisted-local-artifacts",
    projectId: scope.projectId,
    deckUpdates: inputs.map((input) => ({
      auditRef: input.evidence.auditRef,
      source: { versionId: input.before.deck.versionId, contentHash: input.before.deck.contentHash },
      output: { versionId: input.after.deck.versionId, contentHash: input.after.deck.contentHash, projectId: scope.projectId }
    })),
    styleVersions: [...styleVersions].map(([versionId, contentHash]) => ({ versionId, contentHash }))
  };
}

const recommend = (history, options = {}) => recommendFromEditHistory(scope, history, { trustedArtifacts: trusted(history), ...options });

test("accepted and reverted trusted edit diffs produce deterministic explainable recommendations", () => {
  const history = [
    edit(1, { dimension: "typography", path: "typography.primary", before: "Arial", after: "Microsoft YaHei" }),
    edit(2, { dimension: "typography", path: "typography.primary", before: "Calibri", after: "Microsoft YaHei" }),
    edit(3, { dimension: "density", path: "density.score", before: 0.7, after: 0.5 }),
    edit(4, { dimension: "density", path: "density.score", before: 0.65, after: 0.45 }),
    edit(5, { dimension: "chart", path: "charts.gridlines", before: false, after: true }, { outcome: "reverted" }),
    edit(6, { dimension: "chart", path: "charts.gridlines", before: false, after: true }, { outcome: "reverted" })
  ];
  const first = recommend(history);
  const second = recommend(structuredClone(history));
  assert.deepEqual(first, second);
  assert.equal(first.profile.recommendations.length, 3);
  assert.equal(first.profile.evidenceSummary.revertedEvents, 2);
  assert.equal(first.profile.recommendations.find((item) => item.path === "typography.primary").value, "Microsoft YaHei");
  assert.equal(first.profile.recommendations.find((item) => item.path === "density.score").direction, "decrease");
  assert.equal(first.profile.recommendations.find((item) => item.path === "charts.gridlines").value, false);
  assert.equal(first.proposal.automaticMutation, false);
  assert.deepEqual(first.proposal.targets, ["style-mix", "slide-plan", "pptx"]);
});

test("one-off and conflicting edits are withheld by evidence and confidence safeguards", () => {
  const one = edit(1, { dimension: "color", path: "colors.accent", before: "#0055aa", after: "#ff9900" });
  const oneOff = recommend([one]);
  assert.equal(oneOff.profile.recommendations.length, 0);
  assert.equal(oneOff.profile.withheld[0].reason, "minimum-evidence");
  const history = [
    edit(1, { dimension: "composition", path: "composition.preferred", before: "grid", after: "editorial" }),
    edit(2, { dimension: "composition", path: "composition.preferred", before: "editorial", after: "grid" })
  ];
  assert.equal(recommend(history).profile.recommendations.length, 0);
});

test("ambiguous, content-bearing, mutable and untrusted version evidence fail closed", () => {
  const unsupported = edit(1, { dimension: "typography", path: "text.content", before: "旧", after: "新" });
  assert.throws(() => buildStyleEditJournal(scope, [unsupported], undefined, trusted([unsupported])), /unsupported or content-bearing/);
  const implicit = edit(1, { dimension: "layout", path: "grid.margin", before: 40, after: 60 });
  implicit.evidence.explicit = false;
  assert.throws(() => buildStyleEditJournal(scope, [implicit], undefined, trusted([implicit])), /ambiguous/);
  const broken = edit(1, { dimension: "layout", path: "grid.margin", before: 40, after: 60 });
  broken.after.deck.parentVersionId = "another_version";
  assert.throws(() => buildStyleEditJournal(scope, [broken], undefined, trusted([broken])), /broken immutable/);
  const valid = edit(1, { dimension: "layout", path: "grid.margin", before: 40, after: 60 });
  assert.throws(() => buildStyleEditJournal(scope, [valid]), /Trusted persisted/);
  const mismatch = trusted([valid]);
  mismatch.deckUpdates[0].output.contentHash = hash("f");
  assert.throws(() => buildStyleEditJournal(scope, [valid], undefined, mismatch), /do not match a persisted immutable/);
  const mutableA = edit(1, { dimension: "layout", path: "grid.margin", before: 40, after: 60 });
  const mutableB = edit(2, { dimension: "layout", path: "grid.margin", before: 45, after: 60 });
  mutableB.before.deck.versionId = mutableA.before.deck.versionId;
  mutableB.before.deck.contentHash = hash("f");
  mutableB.after.deck.parentVersionId = mutableB.before.deck.versionId;
  assert.throws(() => buildStyleEditJournal(scope, [mutableA, mutableB], undefined, trusted([mutableA, mutableB])), /reused with another content hash/);
});

test("persisted edit journal preserves caller order while identities remain sequence-independent", () => {
  const first = edit(1, { dimension: "chart", path: "charts.legend", before: true, after: false });
  const second = edit(2, { dimension: "chart", path: "charts.legend", before: true, after: false });
  const allTrusted = trusted([first, second]);
  const initial = mergeStyleEditJournal(undefined, scope, [first], undefined, allTrusted);
  const merged = mergeStyleEditJournal(initial.journal, scope, [first, second], undefined, allTrusted);
  assert.equal(merged.appended, 1);
  assert.equal(merged.existing, 1);
  assert.equal(merged.journal.events.length, 2);
  assert.equal(merged.journal.events[0].eventId, initial.journal.events[0].eventId);
  const orderA = buildStyleEditJournal(scope, [first, second], undefined, allTrusted);
  const orderB = buildStyleEditJournal(scope, [second, first], undefined, allTrusted);
  assert.deepEqual(orderA.events.map((item) => item.idempotencyKey), ["edit-1", "edit-2"]);
  assert.deepEqual(orderB.events.map((item) => item.idempotencyKey), ["edit-2", "edit-1"]);
  assert.deepEqual(new Set(orderA.events.map((item) => item.eventId)), new Set(orderB.events.map((item) => item.eventId)));
  const conflicting = structuredClone(first);
  conflicting.styleDeltas[0].before = false;
  conflicting.styleDeltas[0].after = true;
  assert.throws(() => mergeStyleEditJournal(initial.journal, scope, [conflicting], undefined, allTrusted), /another canonical payload/);
});

test("project/user lock serializes concurrent mutations without lost updates", async () => {
  const trace = [];
  let active = 0;
  let revision = 0;
  await Promise.all(Array.from({ length: 12 }, (_, index) => withPreferenceScopeLock("project_lock", "local-user", async () => {
    active += 1;
    assert.equal(active, 1);
    const before = revision;
    await new Promise((resolve) => setTimeout(resolve, index % 3));
    revision = before + 1;
    trace.push(index);
    active -= 1;
  })));
  assert.equal(revision, 12);
  assert.deepEqual(trace, Array.from({ length: 12 }, (_, index) => index));
});

test("explicit preference events corroborate only matching trusted outcomes", () => {
  const preferenceJournal = {
    schema: "ppt-factory/preference-event-journal/v1", scope,
    events: [{ schema: "ppt-factory/preference-event/v1", eventId: "pref_support", sequence: 1, idempotencyKey: "support", action: "use", subject: { artifactType: "style_pack", id: "board", version: "1.0.0" } }]
  };
  const accepted = edit(1, { dimension: "visualTone", path: "visuals.tone", before: "neutral", after: "restrained" }, { preferenceEventId: "pref_support" });
  const journal = buildStyleEditJournal(scope, [accepted], preferenceJournal, trusted([accepted]));
  assert.equal(journal.events[0].evidence.preferenceEventId, "pref_support");
  const reverted = edit(2, { dimension: "visualTone", path: "visuals.tone", before: "neutral", after: "restrained" }, { outcome: "reverted", preferenceEventId: "pref_support" });
  assert.throws(() => buildStyleEditJournal(scope, [reverted], preferenceJournal, trusted([reverted])), /conflicts/);
});

test("decision journal is append-only, idempotent and rejects decisionKey payload conflicts", () => {
  const history = [
    edit(1, { dimension: "chart", path: "charts.legend", before: true, after: false }),
    edit(2, { dimension: "chart", path: "charts.legend", before: true, after: false })
  ];
  const result = recommend(history);
  assert.throws(() => createPreferenceDecision(result.proposal, { decision: "accept", decisionKey: "decision-1" }), /explicit opt-in/);
  const first = appendPreferenceDecision(undefined, result.proposal, { decision: "accept", decisionKey: "decision-1", explicitOptIn: true });
  const retry = appendPreferenceDecision(first.journal, result.proposal, { decision: "accept", decisionKey: "decision-1", explicitOptIn: true });
  assert.equal(retry.appended, false);
  assert.equal(retry.journal.decisions.length, 1);
  assert.equal(retry.decision.downstreamMutationPerformed, false);
  assert.throws(() => appendPreferenceDecision(first.journal, result.proposal, { decision: "reject", decisionKey: "decision-1", explicitOptIn: true }), /another canonical payload/);
});

test("user-scoped paths, trusted ingestion and dry-run mutation boundaries are explicit", () => {
  assert.equal(preferenceEventSnapshotName("analyst_1"), "preference-analyst_1-events-snapshot");
  assert.equal(preferenceLearningSnapshotName("analyst_1"), "preference-analyst_1-learning-snapshot");
  assert.equal(preferenceDecisionSnapshotName("analyst_1"), "preference-analyst_1-decision-snapshot");
  assert.throws(() => preferenceLearningSnapshotName("../other"), /userKey/);
  const schema = JSON.parse(fs.readFileSync(path.join(root, "schemas/preference-learning.schema.json"), "utf8"));
  const constants = schema.oneOf.map((item) => schema.$defs[item.$ref.split("/").at(-1)].properties.schema.const);
  assert.deepEqual(constants, [
    "ppt-factory/style-edit-journal/v1", "ppt-factory/learned-preference-profile/v1",
    "ppt-factory/preference-recommendation-proposal/v1", "ppt-factory/preference-recommendation-decision-journal/v1",
    "ppt-factory/preference-learning-snapshot/v1", "ppt-factory/preference-decision-snapshot/v1"
  ]);
  const route = fs.readFileSync(path.join(root, "app/api/preferences/learning/route.ts"), "utf8");
  const eventsRoute = fs.readFileSync(path.join(root, "app/api/preferences/events/route.ts"), "utf8");
  const ingestion = fs.readFileSync(path.join(root, "lib/preference-learning-ingestion.ts"), "utf8");
  const migration = fs.readFileSync(path.join(root, "lib/preference-event-migration.ts"), "utf8");
  const store = fs.readFileSync(path.join(root, "storage/preference-store.ts"), "utf8");
  assert.match(route, /operation = body\.operation \?\? "recommend"/);
  assert.match(route, /dryRun: true, persisted: false, mutated: false/);
  assert.match(route, /withPreferenceScopeLock\(projectId, userKey/);
  assert.match(route, /learningSnapshot\(localScope, revision \+ 1/);
  assert.match(route, /decisionSnapshot\(localScope, revision \+ 1/);
  assert.match(route, /trustedArtifacts\(projectId, \[\.\.\.existingInputs, \.\.\.editHistory\]\)/);
  assert.match(eventsRoute, /loadPreferenceEventState\(projectId, userKey\)/);
  assert.match(eventsRoute, /withPreferenceScopeLock\(projectId, userKey/);
  assert.match(migration, /LEGACY_PREFERENCE_EVENT_ARTIFACTS\.journal/);
  assert.match(store, /writeFile\(temporary/);
  assert.match(store, /rename\(temporary, target\)/);
  assert.match(store, /snapshot\.revision !== expectedRevision \+ 1/);
  assert.match(ingestion, /getStylePack\(library/);
  assert.match(ingestion, /deck-update-manifest-/);
  assert.doesNotMatch(route, /writeJson\([^,]+,\s*"style"/);
  assert.doesNotMatch(route, /writeJson\([^,]+,\s*"slide-plans"/);
  assert.doesNotMatch(route, /writeFile|applyExistingDeckUpdate|generateDeck|renderDeck/i);
});

test("malformed ingestion is rejected by domain preflight before nested dereference", () => {
  for (const malformed of [null, {}, { idempotencyKey: "x" }, { idempotencyKey: "x", before: {}, after: {}, evidence: {} }]) {
    assert.throws(() => preflightStyleEditInputShape(malformed), /malformed ingestion shape/);
  }
  const route = fs.readFileSync(path.join(root, "app/api/preferences/learning/route.ts"), "utf8");
  assert.match(route, /body\.editHistory\.forEach\(\(event, index\) => preflightStyleEditInputShape\(event, index\)\)/);
});
