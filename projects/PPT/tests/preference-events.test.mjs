import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  aggregatePreferenceProfile,
  appendPreferenceEvent,
  emptyPreferenceJournal,
  migrateLegacyPreferenceJournal,
  preferenceEventSnapshotName,
  preferenceRankingSignals,
  queryPreferenceEvents
} from "../lib/preference-events.ts";
import { buildSemanticSearchIndex, searchSemanticIndex } from "../lib/semantic-search.ts";

const scope = { kind: "local-project-user-placeholder", projectId: "project_pref", userKey: "local-user" };
const goldenSlides = {
  schema: "ppt-factory/golden-slides/v1", referenceStyleId: "style_bank", sourceFile: "reference.pptx",
  usage: { mode: "learn-style", retrievalEligible: true }, thresholds: { candidate: 68, retrieval: 72 },
  candidates: [
    { id: "golden_data", sourceSlide: 3, role: "evidence_data", layoutFamily: "FULL_CHART", density: "balanced", hasChart: true, score: 92, candidateThreshold: 68, eligible: true, dimensionScores: {}, evidence: ["monthly"] },
    { id: "golden_weak", sourceSlide: 4, role: "other", layoutFamily: "OTHER", density: "dense", hasChart: false, score: 40, candidateThreshold: 68, eligible: false, dimensionScores: {}, evidence: [] }
  ]
};
const stylePacks = {
  schema: "ppt-factory/style-pack-search-library/v1",
  packs: [
    { schema: "ppt-factory/style-pack/v1", id: "pack_board", version: "1.2.0", name: "董事会月报", styleId: "style_board", tags: ["monthly"], roles: ["evidence_data"], layoutFamilies: ["FULL_CHART"], densities: ["balanced"], hasCharts: true, chartTypes: ["bar"], audienceTags: ["board"], active: true },
    { schema: "ppt-factory/style-pack/v1", id: "pack_board", version: "1.1.0", name: "旧版", styleId: "style_board", tags: [], roles: [], layoutFamilies: [], densities: ["balanced"], hasCharts: false, chartTypes: [], audienceTags: [], active: false }
  ]
};
const refs = { goldenSlides, stylePacks };

function event(action, subject, idempotencyKey) {
  return { scope, action, subject, idempotencyKey };
}

test("explicit events append deterministically and identical retries are idempotent", () => {
  const input = event("favorite", { artifactType: "style_pack", id: "pack_board", version: "1.2.0" }, "save-pack-board-1");
  const first = appendPreferenceEvent(undefined, input, refs);
  const retry = appendPreferenceEvent(first.journal, structuredClone(input), refs);
  const replayFromEmpty = appendPreferenceEvent(undefined, structuredClone(input), refs);
  assert.equal(first.appended, true);
  assert.equal(retry.appended, false);
  assert.equal(retry.journal.events.length, 1);
  assert.equal(first.event.eventId, replayFromEmpty.event.eventId);
  assert.deepEqual(first.profile, retry.profile);
});

test("all supported actions aggregate into explainable bounded signals", () => {
  let journal = emptyPreferenceJournal(scope);
  for (const [index, action] of ["favorite", "use", "reject"].entries()) {
    journal = appendPreferenceEvent(journal, event(action, { artifactType: "golden_slide", id: "golden_data", version: "v1" }, `golden-action-${index}`), refs).journal;
  }
  const profile = aggregatePreferenceProfile(journal);
  assert.equal(profile.totalEvents, 3);
  assert.equal(profile.policy.automaticDesignChanges, false);
  assert.equal(profile.policy.semanticSearchRanking, "explicit-opt-in-only");
  assert.deepEqual(profile.subjects[0].counts, { favorite: 1, use: 1, reject: 1 });
  assert.equal(profile.subjects[0].weightedTotal, 0);
  assert.equal(profile.subjects[0].signal, 0);
  assert.equal(queryPreferenceEvents(journal, { action: "reject" }).length, 1);
  assert.ok(profile.subjects[0].evidence.includes("reject:1×-4"));
});

test("subject versions, eligibility, local scope and idempotency conflicts are validated", () => {
  assert.throws(() => appendPreferenceEvent(undefined, event("use", { artifactType: "golden_slide", id: "golden_data", version: "1" }, "bad-golden-version"), refs), /version v1/);
  assert.throws(() => appendPreferenceEvent(undefined, event("use", { artifactType: "golden_slide", id: "golden_weak", version: "v1" }, "weak"), refs), /not found/);
  assert.throws(() => appendPreferenceEvent(undefined, event("use", { artifactType: "style_pack", id: "pack_board", version: "1.1.0" }, "inactive"), refs), /not found/);
  const first = appendPreferenceEvent(undefined, event("use", { artifactType: "style_pack", id: "pack_board", version: "1.2.0" }, "same-key"), refs);
  assert.throws(() => appendPreferenceEvent(first.journal, event("reject", { artifactType: "style_pack", id: "pack_board", version: "1.2.0" }, "same-key"), refs), /another event/);
  assert.throws(() => appendPreferenceEvent(first.journal, { ...event("use", { artifactType: "style_pack", id: "pack_board", version: "1.2.0" }, "other"), scope: { ...scope, userKey: "another-user" } }, refs), /scope does not match/);
  const tampered = structuredClone(first.journal);
  tampered.events[0].action = "reject";
  assert.throws(() => appendPreferenceEvent(tampered, event("use", { artifactType: "style_pack", id: "pack_board", version: "1.2.0" }, "new-key"), refs), /event 1 is invalid/);
});

test("semantic preference ranking is neutral by default and changes only on explicit opt-in", () => {
  const index = buildSemanticSearchIndex({ projectId: scope.projectId, goldenSlides, stylePacks });
  const query = { text: "monthly", roles: ["evidence_data"], chart: "required", minScore: 0 };
  const before = searchSemanticIndex(index, query);
  const neutralWithSignals = searchSemanticIndex(index, query, { preferenceSignals: { "golden:golden_data": { signal: -100, evidence: ["reject:1×-4"] } } });
  assert.deepEqual(neutralWithSignals, before);

  let journal = appendPreferenceEvent(undefined, event("reject", { artifactType: "golden_slide", id: "golden_data", version: "v1" }, "reject-golden"), refs).journal;
  journal = appendPreferenceEvent(journal, event("favorite", { artifactType: "style_pack", id: "pack_board", version: "1.2.0" }, "favorite-pack"), refs).journal;
  const explicit = searchSemanticIndex(index, { ...query, preferenceRanking: "explicit" }, {
    preferenceSignals: preferenceRankingSignals(aggregatePreferenceProfile(journal))
  });
  const goldenBefore = before.matches.find((item) => item.id === "golden:golden_data");
  const goldenAfter = explicit.matches.find((item) => item.id === "golden:golden_data");
  assert.ok(goldenAfter.score < goldenBefore.score);
  assert.ok(explicit.matches.some((item) => item.evidence.some((entry) => entry.startsWith("preference-adjustment:"))));
});

test("legacy journal migration preserves same-user evidence and rejects cross-user adoption", () => {
  const legacy = appendPreferenceEvent(undefined, event("use", { artifactType: "style_pack", id: "pack_board", version: "1.2.0" }, "legacy-use"), refs).journal;
  const migrated = migrateLegacyPreferenceJournal(structuredClone(legacy), scope);
  assert.deepEqual(migrated.journal, legacy);
  assert.equal(migrated.profile.totalEvents, 1);
  assert.throws(() => migrateLegacyPreferenceJournal(legacy, { ...scope, userKey: "other-user" }), /scope does not match/);
});

test("schema and APIs preserve versioned JSON artifacts and explicit search opt-in", () => {
  const root = process.cwd();
  const schema = JSON.parse(fs.readFileSync(path.join(root, "schemas/preference-events.schema.json"), "utf8"));
  assert.equal(schema.oneOf[0].properties.schema.const, "ppt-factory/preference-event-journal/v1");
  assert.equal(schema.oneOf[1].properties.policy.properties.automaticDesignChanges.const, false);
  assert.equal(schema.oneOf[2].properties.schema.const, "ppt-factory/preference-event-snapshot/v1");
  const eventRoute = fs.readFileSync(path.join(root, "app/api/preferences/events/route.ts"), "utf8");
  const searchRoute = fs.readFileSync(path.join(root, "app/api/search/semantics/route.ts"), "utf8");
  assert.equal(preferenceEventSnapshotName("local-user"), "preference-local-user-events-snapshot");
  assert.match(eventRoute, /loadPreferenceEventState\(projectId, userKey\)/);
  assert.match(eventRoute, /writeEventSnapshot\(projectId, state\.name, revision, next\)/);
  assert.match(eventRoute, /withPreferenceScopeLock\(projectId, userKey/);
  assert.match(searchRoute, /body\.query\.preferenceRanking === "explicit"/);
  assert.match(searchRoute, /loadPreferenceEventState\(projectId, userKey\)/);
});
