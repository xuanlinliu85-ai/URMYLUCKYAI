import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  aggregatePreferenceProfile,
  appendPreferenceEvent,
  preferenceRankingSignals
} from "../lib/preference-events.ts";
import { buildSemanticSearchIndex, searchSemanticIndex } from "../lib/semantic-search.ts";

const root = path.join(process.cwd(), "generated", "probes", "preference-events");
const analysisDir = path.join(root, "analysis");
await rm(root, { recursive: true, force: true });
await mkdir(analysisDir, { recursive: true });

const scope = { kind: "local-project-user-placeholder", projectId: "project_preference_acceptance", userKey: "local-user" };
const goldenSlides = {
  schema: "ppt-factory/golden-slides/v1", referenceStyleId: "style_acceptance", sourceFile: "bounded-reference.pptx",
  usage: { mode: "learn-style", retrievalEligible: true }, thresholds: { candidate: 68, retrieval: 72 },
  candidates: [{ id: "golden_summary", sourceSlide: 2, role: "summary", layoutFamily: "EXEC_SUMMARY", density: "balanced", hasChart: false, score: 90, candidateThreshold: 68, eligible: true, dimensionScores: {}, evidence: ["summary"] }]
};
const stylePacks = {
  schema: "ppt-factory/style-pack-search-library/v1",
  packs: [{ schema: "ppt-factory/style-pack/v1", id: "pack_summary", version: "1.0.0", name: "经营摘要", styleId: "style_summary", tags: ["summary"], roles: ["summary"], layoutFamilies: ["EXEC_SUMMARY"], densities: ["balanced"], hasCharts: false, chartTypes: [], audienceTags: ["management"], active: true }]
};
const refs = { goldenSlides, stylePacks };
const inputs = [
  { idempotencyKey: "accept-favorite-pack", action: "favorite", subject: { artifactType: "style_pack", id: "pack_summary", version: "1.0.0" } },
  { idempotencyKey: "accept-use-pack", action: "use", subject: { artifactType: "style_pack", id: "pack_summary", version: "1.0.0" } },
  { idempotencyKey: "accept-reject-golden", action: "reject", subject: { artifactType: "golden_slide", id: "golden_summary", version: "v1" } }
];

let journal;
for (const input of inputs) journal = appendPreferenceEvent(journal, { scope, ...input }, refs).journal;
const retry = appendPreferenceEvent(journal, { scope, ...inputs[0] }, refs);
assert.equal(retry.appended, false);
assert.equal(retry.journal.events.length, 3);
const profile = aggregatePreferenceProfile(journal);
await writeFile(path.join(analysisDir, "preference-events.json"), JSON.stringify(journal, null, 2));
await writeFile(path.join(analysisDir, "preference-profile.json"), JSON.stringify(profile, null, 2));

const persistedJournal = JSON.parse(await readFile(path.join(analysisDir, "preference-events.json"), "utf8"));
const persistedProfile = JSON.parse(await readFile(path.join(analysisDir, "preference-profile.json"), "utf8"));
assert.deepEqual(persistedJournal, journal);
assert.deepEqual(persistedProfile, profile);

const index = buildSemanticSearchIndex({ projectId: scope.projectId, goldenSlides, stylePacks });
const base = searchSemanticIndex(index, { text: "summary", roles: ["summary"], minScore: 0 });
const neutral = searchSemanticIndex(index, { text: "summary", roles: ["summary"], minScore: 0 }, { preferenceSignals: preferenceRankingSignals(profile) });
assert.deepEqual(neutral, base);
const explicit = searchSemanticIndex(index, { text: "summary", roles: ["summary"], minScore: 0, preferenceRanking: "explicit" }, { preferenceSignals: preferenceRankingSignals(profile) });
assert.ok(explicit.matches.some((item) => item.evidence.some((entry) => entry.startsWith("preference-adjustment:"))));

const checks = {
  supportedActions: [...new Set(journal.events.map((item) => item.action))].sort().join(",") === "favorite,reject,use",
  deterministicIdempotency: retry.event.eventId === journal.events[0].eventId,
  exactEventCount: journal.events.length === 3,
  persistedRoundTrip: JSON.stringify(persistedProfile) === JSON.stringify(profile),
  noAutomaticDesignChanges: profile.policy.automaticDesignChanges === false,
  defaultSearchNeutral: JSON.stringify(neutral) === JSON.stringify(base),
  explicitSearchEvidence: explicit.matches.some((item) => item.evidence.some((entry) => entry.startsWith("preference-adjustment:")))
};
const report = {
  schema: "ppt-factory/preference-event-acceptance/v1",
  status: Object.values(checks).every(Boolean) ? "PASS" : "FAIL",
  scope,
  checks,
  artifacts: {
    journal: path.join(analysisDir, "preference-events.json"),
    profile: path.join(analysisDir, "preference-profile.json")
  },
  rendererChanged: false,
  pptRegenerationRequired: false
};
await writeFile(path.join(root, "acceptance.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (report.status !== "PASS") process.exitCode = 1;
