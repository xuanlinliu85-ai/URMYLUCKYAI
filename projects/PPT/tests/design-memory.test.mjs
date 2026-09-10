import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { buildDesignMemory, designMemoryHash, validateDesignMemoryRecommendation } from "../lib/design-memory.ts";
import { classifyDesignMemoryHttpError, parseDesignMemoryPostRequest } from "../lib/design-memory-api.ts";
import { appendPreferenceEvent, aggregatePreferenceProfile, emptyPreferenceJournal } from "../lib/preference-events.ts";
import { appendPreferenceDecision, createPreferenceProposal, learnPreferenceProfile, recommendFromEditHistory } from "../lib/preference-learning.ts";
import { readDesignMemory, writeDesignMemory } from "../storage/design-memory-store.ts";
import { projectPath } from "../storage/local-store.ts";

const scope = { kind: "local-project-user-placeholder", projectId: "project_memory", userKey: "analyst_1" };
const hash = (seed) => seed.repeat(64).slice(0, 64);
const plain = (value) => JSON.parse(JSON.stringify(value));
const dimensions = ["typography", "color", "layout", "chart", "density", "composition", "storytelling", "visualTone"];

function stylePackLibrary() {
  const style = { styleId: "style_board", name: "Board", sourceType: "hybrid", version: "1.0.0", styleVector: {}, typography: { primary: "Microsoft YaHei" }, colors: {}, grid: {}, composition: {}, charts: {}, visuals: {}, storytelling: {}, density: {}, preferredLayouts: ["EXEC_SUMMARY"], antiPatterns: [] };
  const weights = Object.fromEntries(dimensions.map((dimension) => [dimension, { reference: 0.4, system: 0.3, prompt: 0.3 }]));
  const locks = Object.fromEntries(dimensions.map((dimension) => [dimension, false]));
  const resolvedOwnership = Object.fromEntries(dimensions.map((dimension) => [dimension, { owner: "reference", weights: weights[dimension], locked: false }]));
  const payload = {
    schema: "ppt-factory/style-pack/v1", id: "pack_board", version: "1.0.0", name: "董事会月报", styleId: "style_board",
    tags: ["经营", "monthly"], roles: ["summary", "evidence_data"], layoutFamilies: ["EXEC_SUMMARY"], densities: ["balanced"],
    hasCharts: true, chartTypes: ["bar"], audienceTags: ["board"], active: true,
    previews: { cover: "cover.png", executiveSummary: "summary.png", dataSlide: "data.png" }, preferredLayouts: ["EXEC_SUMMARY"],
    chartRules: {}, typography: { primary: "Microsoft YaHei" }, imageDirection: {}, antiPatterns: [], examplePrompts: ["克制经营月报"],
    provenance: { previewSet: "B", sources: {}, weights, locks, resolvedOwnership },
    styleMix: { previewSet: "B", sources: {}, controls: {}, weights, locks, resolvedOwnership, finalStyleId: "style_board", finalStyle: style }, style
  };
  return { schema: "ppt-factory/style-pack-search-library/v1", packs: [{ ...payload, contentHash: designMemoryHash(payload) }] };
}

function preferenceSources(library = stylePackLibrary(), localScope = scope) {
  let journal = emptyPreferenceJournal(localScope);
  journal = appendPreferenceEvent(journal, { scope: localScope, idempotencyKey: "favorite-board", action: "favorite", subject: { artifactType: "style_pack", id: "pack_board", version: "1.0.0" } }, { stylePacks: library }).journal;
  journal = appendPreferenceEvent(journal, { scope: localScope, idempotencyKey: "use-board", action: "use", subject: { artifactType: "style_pack", id: "pack_board", version: "1.0.0" } }, { stylePacks: library }).journal;
  return { preferenceJournal: journal, preferenceProfile: aggregatePreferenceProfile(journal) };
}

function edit(index) {
  const beforeDeck = `deck_${index}_before`, afterDeck = `deck_${index}_after`, beforeStyle = `pack_board@1.0.${index * 2}`;
  return {
    idempotencyKey: `edit-${index}`,
    before: { deck: { versionId: beforeDeck, contentHash: hash(String(index)) }, style: { versionId: beforeStyle, contentHash: hash(String(index + 2)) } },
    after: { deck: { versionId: afterDeck, contentHash: hash(String(index + 4)), parentVersionId: beforeDeck }, style: { versionId: `pack_board@1.0.${index * 2 + 1}`, contentHash: hash(String(index + 6)), parentVersionId: beforeStyle } },
    styleDeltas: [{ dimension: "typography", path: "typography.primary", before: "Arial", after: "Microsoft YaHei" }],
    evidence: { outcome: "accepted", explicit: true, auditRef: `deck-update-manifest-${afterDeck}` }
  };
}

function learnedSources(decision = "accept") {
  const history = [edit(1), edit(2)];
  const styleVersions = history.flatMap((item) => [item.before.style, item.after.style]);
  const trustedArtifacts = {
    schema: "ppt-factory/preference-learning-trusted-artifacts/v1", source: "persisted-local-artifacts", projectId: scope.projectId,
    deckUpdates: history.map((item) => ({ auditRef: item.evidence.auditRef, source: { ...item.before.deck }, output: { versionId: item.after.deck.versionId, contentHash: item.after.deck.contentHash, projectId: scope.projectId } })),
    styleVersions: styleVersions.map(({ versionId, contentHash }) => ({ versionId, contentHash }))
  };
  const learned = recommendFromEditHistory(scope, history, { trustedArtifacts });
  const decided = appendPreferenceDecision(undefined, learned.proposal, { decision, decisionKey: `memory-${decision}`, explicitOptIn: true });
  return { journal: learned.journal, profile: learned.profile, proposal: learned.proposal, decisions: decided.journal, trustedArtifacts };
}

function input(overrides = {}) {
  const stylePacks = stylePackLibrary();
  const result = { scope, stylePacks, ...preferenceSources(stylePacks), learning: learnedSources(),
    query: { text: "董事会 monthly 经营", artifactTypes: ["style_pack"], roles: ["summary"], minScore: 40 }, ...overrides };
  if (!result.sourceSnapshots) result.sourceSnapshots = { preference: { revision: 1, snapshotHash: hash("a") },
    ...(result.learning ? { learning: { revision: 1, snapshotHash: hash("b") }, ...(result.learning.decisions ? { decisions: { revision: 1, snapshotHash: hash("c") } } : {}) } : {}) };
  return result;
}

function goldenLibrary(mode = "learn-style") {
  return {
    schema: "ppt-factory/golden-slides/v1", referenceStyleId: "style_board", sourceFile: "reference.pptx",
    usage: { mode, retrievalEligible: mode === "learn-style" }, thresholds: { candidate: 68, retrieval: 72 },
    candidates: [{ id: "golden_summary", sourceSlide: 2, role: "summary", layoutFamily: "EXEC_SUMMARY", density: "balanced", hasChart: false,
      score: 85, candidateThreshold: 68, eligible: mode === "learn-style",
      dimensionScores: { layoutQuality: 85, clarity: 86, reusability: 84, styleRepresentativeness: 83, hierarchy: 87, balance: 85 }, evidence: ["role:summary"] }]
  };
}

test("memory deterministically combines explicit ranking and accepted learned recommendations", () => {
  const first = buildDesignMemory(input()); const second = buildDesignMemory(structuredClone(input()));
  assert.deepEqual(first, second);
  assert.equal(first.recommendation.candidates[0].source.stylePackId, "pack_board");
  assert.ok(first.recommendation.candidates[0].evidence.some((item) => item.startsWith("preference:")));
  assert.equal(first.profile.learned[0].authorization, "authorized");
  assert.equal(first.recommendation.authorizedLearnedRecommendations[0].value, "Microsoft YaHei");
  assert.equal(first.recommendation.automaticMutation, false);
  assert.equal(first.recommendation.requiresExplicitOptIn, true);
  assert.match(first.profile.profileHash, /^[a-f0-9]{64}$/);
  assert.equal(first.recommendation.queryHash, designMemoryHash(first.recommendation.normalizedQuery));
});

test("explicit reject suppresses learned advice without erasing evidence", () => {
  const result = buildDesignMemory(input({ learning: learnedSources("reject") }));
  assert.equal(result.profile.learned[0].authorization, "rejected");
  assert.equal(result.recommendation.authorizedLearnedRecommendations.length, 0);
  assert.deepEqual(result.recommendation.suppressedLearnedRecommendations, [{ recommendationId: result.profile.learned[0].recommendationId, authorization: "rejected" }]);
  assert.ok(result.profile.learned[0].evidence.some((item) => item.startsWith("decision:")));
});

test("one memory profile supports content-addressed query-specific recommendations", () => {
  const first = buildDesignMemory(input({ query: { text: "董事会", artifactTypes: ["style_pack"], minScore: 20 } }));
  const second = buildDesignMemory(input({ query: { text: "monthly bar", artifactTypes: ["style_pack"], minScore: 20 } }));
  assert.equal(first.profile.profileId, second.profile.profileId);
  assert.notEqual(first.recommendation.recommendationId, second.recommendation.recommendationId);
  assert.notEqual(first.recommendation.queryHash, second.recommendation.queryHash);
});

test("missing decision remains pending and never authorizes downstream application", () => {
  const learning = learnedSources(); delete learning.decisions;
  const result = buildDesignMemory(input({ learning }));
  assert.equal(result.profile.learned[0].authorization, "pending");
  assert.equal(result.recommendation.authorizedLearnedRecommendations.length, 0);
});

test("conflicting accept and reject decisions remain ineligible", () => {
  const learning = learnedSources();
  learning.decisions = appendPreferenceDecision(learning.decisions, learning.proposal, { decision: "reject", decisionKey: "memory-conflict", explicitOptIn: true }).journal;
  const result = buildDesignMemory(input({ learning }));
  assert.equal(result.profile.learned[0].authorization, "conflicting");
  assert.equal(result.recommendation.authorizedLearnedRecommendations.length, 0);
  assert.equal(result.recommendation.suppressedLearnedRecommendations[0].authorization, "conflicting");
});

test("scope, source profiles, immutable packs and learned lineage fail closed", () => {
  const crossScope = input(); crossScope.preferenceJournal.scope.userKey = "another";
  assert.throws(() => buildDesignMemory(crossScope), /scope does not match/);
  const forgedProfile = input(); forgedProfile.preferenceProfile.totalEvents = 999;
  assert.throws(() => buildDesignMemory(forgedProfile), /profile does not match/);
  const forgedPack = input(); forgedPack.stylePacks.packs[0].name = "forged";
  assert.throws(() => buildDesignMemory(forgedPack), /modified/);
  const inactive = input(); const stored = inactive.stylePacks.packs[0]; stored.active = false; const { contentHash: _contentHash, ...payload } = stored; stored.contentHash = designMemoryHash(payload);
  assert.throws(() => buildDesignMemory(inactive), /stale or unavailable/);
  const forgedLearned = input(); forgedLearned.learning.profile.recommendations[0].value = "Comic Sans";
  assert.throws(() => buildDesignMemory(forgedLearned), /does not match its edit journal/);
  const rehashedLearning = input(); const event = rehashedLearning.learning.journal.events[0]; event.after.deck.contentHash = hash("f");
  const { schema: _schema, eventId: _eventId, sequence: _sequence, ...eventPayload } = event;
  event.eventId = `edit_${designMemoryHash({ scope, payload: eventPayload }).slice(0, 20)}`;
  rehashedLearning.learning.profile = learnPreferenceProfile(rehashedLearning.learning.journal);
  rehashedLearning.learning.proposal = createPreferenceProposal(rehashedLearning.learning.profile);
  rehashedLearning.learning.decisions = undefined; delete rehashedLearning.sourceSnapshots.decisions;
  assert.throws(() => buildDesignMemory(rehashedLearning), /persisted immutable deck-update manifest|trusted persisted lineage/i);
});

test("strict Golden lineage excludes compatibility-only and rejects malformed candidates", () => {
  const compatible = buildDesignMemory(input({ goldenSlides: goldenLibrary("compatibility-only"), query: { artifactTypes: ["golden_slide"], text: "summary", minScore: 0 } }));
  assert.equal(compatible.recommendation.candidates.length, 0);
  const malformed = goldenLibrary(); malformed.candidates[0].dimensionScores.clarity = 120;
  assert.throws(() => buildDesignMemory(input({ goldenSlides: malformed })), /Golden Slide candidate is invalid/);
  const extra = goldenLibrary(); extra.candidates[0].forgedScore = 100;
  assert.throws(() => buildDesignMemory(input({ goldenSlides: extra })), /Golden Slide candidate is invalid/);
  const invalidThreshold = goldenLibrary(); invalidThreshold.thresholds.candidate = -1; invalidThreshold.candidates[0].candidateThreshold = -1;
  assert.throws(() => buildDesignMemory(input({ goldenSlides: invalidThreshold })), /Golden Slide library is invalid/);
});

test("caller cannot inject ranking mode, scores or mutation authority", () => {
  assert.throws(() => buildDesignMemory(input({ query: { text: "board", preferenceRanking: "neutral" } })), /query is invalid/);
  assert.equal("score" in buildDesignMemory(input()).recommendation.authorizedLearnedRecommendations[0], false);
  const built = buildDesignMemory(input()); const tampered = structuredClone(built.recommendation); tampered.automaticMutation = true;
  const { recommendationHash: _hash, ...base } = tampered; tampered.recommendationHash = designMemoryHash(base);
  assert.throws(() => validateDesignMemoryRecommendation(tampered, built.profile), /policy|identity/);
  const forgedScope = structuredClone(built.recommendation); forgedScope.scope.kind = "forged";
  const { recommendationHash: _scopeHash, recommendationId: _scopeId, schema: _scopeSchema, ...scopeBody } = forgedScope;
  forgedScope.recommendationId = `design_recommendation_${designMemoryHash(scopeBody).slice(0, 24)}`;
  forgedScope.recommendationHash = designMemoryHash({ schema: forgedScope.schema, recommendationId: forgedScope.recommendationId, ...scopeBody });
  assert.throws(() => validateDesignMemoryRecommendation(forgedScope, built.profile), /scope|binding/);
});

test("content-addressed persistence is create-once, concurrent-idempotent and tamper-evident", async () => {
  const projectId = `project_memory_store_${Date.now()}`; const localScope = { ...scope, projectId };
  const library = stylePackLibrary(); const sources = preferenceSources(library, localScope);
  const built = buildDesignMemory({ scope: localScope, stylePacks: library, ...sources, sourceSnapshots: { preference: { revision: 1, snapshotHash: hash("a") } }, query: { text: "board", artifactTypes: ["style_pack"] } });
  const root = projectPath(projectId);
  try {
    const writes = await Promise.all(Array.from({ length: 4 }, () => writeDesignMemory(projectId, scope.userKey, built.profile, built.recommendation)));
    assert.equal(writes.filter((item) => item.written).length, 1);
    const stored = await readDesignMemory(projectId, scope.userKey, built.profile.profileId, built.recommendation.recommendationId);
    assert.deepEqual(stored, plain(built));
    const file = path.join(root, "analysis", "design-memory", scope.userKey, built.profile.profileId, "DESIGN_MEMORY_PROFILE.json");
    const tampered = JSON.parse(await readFile(file, "utf8")); tampered.policy.automaticDesignChanges = true;
    const { profileHash: _storedHash, ...tamperedBase } = tampered; tampered.profileHash = designMemoryHash(tamperedBase); await writeFile(file, JSON.stringify(tampered), "utf8");
    await assert.rejects(() => readDesignMemory(projectId, scope.userKey, built.profile.profileId, built.recommendation.recommendationId), /policy|identity|invalid or modified/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("atomic publish ignores partial temp files and recovers a profile-only commit", async () => {
  const projectId = `project_memory_recovery_${Date.now()}`; const localScope = { ...scope, projectId }; const library = stylePackLibrary(); const sources = preferenceSources(library, localScope);
  const built = buildDesignMemory({ scope: localScope, stylePacks: library, ...sources, sourceSnapshots: { preference: { revision: 1, snapshotHash: hash("a") } }, query: { text: "board", artifactTypes: ["style_pack"] } });
  const profileDirectory = projectPath(projectId, "analysis", "design-memory", scope.userKey, built.profile.profileId);
  const root = projectPath(projectId);
  try {
    await fs.promises.mkdir(profileDirectory, { recursive: true });
    await writeFile(path.join(profileDirectory, ".DESIGN_MEMORY_PROFILE.json.crash.tmp"), "{\"partial\":", "utf8");
    await writeFile(path.join(profileDirectory, "DESIGN_MEMORY_PROFILE.json"), `${JSON.stringify(built.profile, null, 2)}\n`, "utf8");
    const recovered = await writeDesignMemory(projectId, scope.userKey, built.profile, built.recommendation);
    assert.equal(recovered.written, true);
    assert.deepEqual(await readDesignMemory(projectId, scope.userKey, built.profile.profileId, built.recommendation.recommendationId), plain(built));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("schemas and API expose advisory artifacts without renderer or deck mutation imports", () => {
  const root = process.cwd();
  for (const name of ["design-memory-profile.schema.json", "design-memory-recommendation.schema.json"]) {
    const schema = JSON.parse(fs.readFileSync(path.join(root, "schemas", name), "utf8"));
    assert.equal(schema.type, "object"); assert.equal(schema.additionalProperties, false);
  }
  const route = fs.readFileSync(path.join(root, "app/api/preferences/design-memory/route.ts"), "utf8");
  assert.match(route, /writeDesignMemory/); assert.doesNotMatch(route, /render|generateDeck|applyStylePack|writeJson\(.*style-mix/i);
  assert.match(route, /deck-update-manifest-/); assert.match(route, /ingestTrustedPreferenceLearningArtifacts/);
});

test("API distinguishes malformed request JSON from corrupt persisted JSON", async () => {
  await assert.rejects(() => parseDesignMemoryPostRequest(new Request("http://local/design-memory", { method: "POST", headers: { "content-type": "application/json" }, body: "{\"broken\":" })),
    (error) => error?.code === "INVALID" && /valid JSON/.test(error.message));
  assert.deepEqual(classifyDesignMemoryHttpError(new SyntaxError("corrupt snapshot")), { status: 500, body: { error: "Persisted Design Memory source is corrupt", code: "INTEGRITY" } });
  const invalid = await parseDesignMemoryPostRequest(new Request("http://local/design-memory", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId: "p", query: {}, mutate: true }) }))
    .then(() => undefined, (error) => classifyDesignMemoryHttpError(error));
  assert.equal(invalid.status, 400); assert.equal(invalid.body.code, "INVALID");
});
