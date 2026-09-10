import { createHash } from "node:crypto";
import { aggregatePreferenceProfile, normalizePreferenceJournal, preferenceRankingSignals, type PreferenceEventJournal, type PreferenceProfile, type PreferenceScope, type PreferenceSubjectAggregate } from "./preference-events.ts";
import { createPreferenceProposal, learnPreferenceProfile, mergeStyleEditJournal, type LearnedPreferenceProfile, type LearnedRecommendation, type PreferenceRecommendationDecision, type PreferenceRecommendationDecisionJournal, type PreferenceRecommendationProposal, type StyleEditJournal, type TrustedPreferenceLearningArtifacts, type WithheldPreference } from "./preference-learning.ts";
import { buildSemanticSearchIndex, searchSemanticIndex, type SemanticSearchMatch, type SemanticSearchQuery, type SemanticSearchResult } from "./semantic-search.ts";
import { verifyStylePackLibrary, type StylePackLibrary } from "./style-packs.ts";
import type { GoldenSlideLibrary } from "./types.ts";

export const DESIGN_MEMORY_PROFILE_SCHEMA = "ppt-factory/design-memory-profile/v1" as const;
export const DESIGN_MEMORY_RECOMMENDATION_SCHEMA = "ppt-factory/design-memory-recommendation/v1" as const;

export class DesignMemoryError extends Error {
  readonly code: "INVALID" | "CONFLICT" | "INTEGRITY";
  constructor(message: string, code: "INVALID" | "CONFLICT" | "INTEGRITY") { super(message); this.code = code; }
}

export type DesignMemoryLearningSources = {
  journal: StyleEditJournal;
  profile: LearnedPreferenceProfile;
  proposal: PreferenceRecommendationProposal;
  decisions?: PreferenceRecommendationDecisionJournal;
  trustedArtifacts: TrustedPreferenceLearningArtifacts;
};

export type DesignMemoryInput = {
  scope: PreferenceScope;
  stylePacks: StylePackLibrary;
  goldenSlides?: GoldenSlideLibrary;
  preferenceJournal: PreferenceEventJournal;
  preferenceProfile: PreferenceProfile;
  learning?: DesignMemoryLearningSources;
  sourceSnapshots: {
    preference: { revision: number; snapshotHash: string };
    learning?: { revision: number; snapshotHash: string };
    decisions?: { revision: number; snapshotHash: string };
  };
  query: Omit<SemanticSearchQuery, "preferenceRanking">;
};

export type DesignMemoryLearnedItem = LearnedRecommendation & {
  authorization: "authorized" | "rejected" | "pending" | "conflicting";
  decisionId?: string;
  evidence: string[];
};
export type DesignMemoryCandidate = SemanticSearchMatch & { sourceArtifactHash: string; sourceVersionHash?: string };

export type DesignMemoryProfile = {
  schema: typeof DESIGN_MEMORY_PROFILE_SCHEMA;
  profileId: string;
  scope: PreferenceScope;
  sourceHashes: {
    stylePacks: string;
    goldenSlides?: string;
    preferenceJournal: string;
    preferenceProfile: string;
    learningJournal?: string;
    learnedProfile?: string;
    proposal?: string;
    decisions?: string;
    semanticIndex: string;
    preferenceSnapshot?: string;
    learningSnapshot?: string;
    decisionSnapshot?: string;
  };
  sourceRevisions: { preference: number; learning?: number; decisions?: number };
  policy: {
    automaticDesignChanges: false;
    requiresExplicitDownstreamOptIn: true;
    ranking: "deterministic-explicit-preference";
    learnedAuthority: "conflict-free-exact-proposal-acceptance";
  };
  explicitEvidence: PreferenceSubjectAggregate[];
  learned: DesignMemoryLearnedItem[];
  withheld: WithheldPreference[];
  profileHash: string;
};

export type DesignMemoryRecommendation = {
  schema: typeof DESIGN_MEMORY_RECOMMENDATION_SCHEMA;
  recommendationId: string;
  profileId: string;
  profileHash: string;
  scope: PreferenceScope;
  mode: "advisory";
  automaticMutation: false;
  requiresExplicitOptIn: true;
  targets: readonly ["style-mix", "slide-plan", "pptx"];
  normalizedQuery: SemanticSearchResult["query"];
  queryHash: string;
  candidates: DesignMemoryCandidate[];
  authorizedLearnedRecommendations: LearnedRecommendation[];
  suppressedLearnedRecommendations: Array<{ recommendationId: string; authorization: "rejected" | "pending" | "conflicting" }>;
  recommendationHash: string;
};

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b, "en"))
    .map(([key, item]) => [key, canonical(item)]));
  return value;
}

export const designMemoryHash = (value: unknown) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
const same = (a: unknown, b: unknown) => designMemoryHash(a) === designMemoryHash(b);
const ID = /^[a-zA-Z0-9_-]+$/;
const HASH = /^[a-f0-9]{64}$/;
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const onlyKeys = (value: Record<string, unknown>, allowed: string[]) => Object.keys(value).every((key) => allowed.includes(key));
const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value);

function assertScope(scope: PreferenceScope) {
  if (!isRecord(scope) || !onlyKeys(scope as unknown as Record<string, unknown>, ["kind", "projectId", "userKey"])
    || scope.kind !== "local-project-user-placeholder" || !ID.test(scope.projectId ?? "") || !ID.test(scope.userKey ?? "")) {
    throw new DesignMemoryError("A valid project/user Design Memory scope is required", "INVALID");
  }
}

function assertSameScope(actual: PreferenceScope, expected: PreferenceScope, label: string) {
  if (!actual || actual.kind !== expected.kind || actual.projectId !== expected.projectId || actual.userKey !== expected.userKey) {
    throw new DesignMemoryError(`${label} scope does not match Design Memory scope`, "CONFLICT");
  }
}

function assertQuery(value: DesignMemoryInput["query"]) {
  const allowed = new Set(["text", "artifactTypes", "roles", "layoutFamilies", "densities", "chart", "styleIds", "audienceTags", "limit", "minScore"]);
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !allowed.has(key))) {
    throw new DesignMemoryError("Design Memory query is invalid", "INVALID");
  }
}

function validateExplicitEvidence(value: unknown) {
  if (!Array.isArray(value)) throw new DesignMemoryError("Design Memory explicit evidence is invalid", "INTEGRITY");
  for (const item of value) {
    if (!isRecord(item) || !onlyKeys(item, ["subject", "searchDocumentId", "counts", "weightedTotal", "signal", "latestSequence", "evidence"]) || !isRecord(item.subject) || !isRecord(item.counts)
      || !onlyKeys(item.subject, ["artifactType", "id", "version"]) || !onlyKeys(item.counts, ["favorite", "use", "reject"])) throw new DesignMemoryError("Design Memory explicit evidence item is invalid", "INTEGRITY");
    const subject = item.subject as { artifactType: string; id: string; version: string }; const counts = item.counts as Record<string, number>;
    if (!['golden_slide', 'style_pack'].includes(subject.artifactType) || !ID.test(subject.id ?? "") || typeof subject.version !== "string"
      || Object.values(counts).some((count) => !Number.isInteger(count) || count < 0) || !Number.isInteger(item.latestSequence) || (item.latestSequence as number) < 1) throw new DesignMemoryError("Design Memory explicit evidence values are invalid", "INTEGRITY");
    const weighted = counts.favorite * 3 + counts.use - counts.reject * 4; const total = counts.favorite + counts.use + counts.reject;
    const signal = total ? Number((weighted / (total * 4) * 100).toFixed(2)) : 0;
    const searchId = subject.artifactType === "golden_slide" ? `golden:${subject.id}` : `style-pack:${subject.id}@${subject.version}`;
    const evidence = [`favorite:${counts.favorite}×3`, `use:${counts.use}×1`, `reject:${counts.reject}×-4`, `signal:${signal}`];
    if (item.weightedTotal !== weighted || item.signal !== signal || item.searchDocumentId !== searchId || !same(item.evidence, evidence)) throw new DesignMemoryError("Design Memory explicit evidence derivation is invalid", "INTEGRITY");
  }
}

function validateLearnedEvidence(value: unknown, withheld: unknown) {
  if (!Array.isArray(value) || !Array.isArray(withheld)) throw new DesignMemoryError("Design Memory learned evidence is invalid", "INTEGRITY");
  const learnedAllowed = ["recommendationId", "dimension", "path", "kind", "value", "direction", "recommendedValue", "confidence", "evidenceCount", "independentDeckVersions", "decayedWeight", "competingWeight", "evidence", "authorization", "decisionId"];
  for (const item of value) {
    if (!isRecord(item) || !onlyKeys(item, learnedAllowed) || !/^learned_[a-f0-9]{20}$/.test(String(item.recommendationId))
      || !["authorized", "rejected", "pending", "conflicting"].includes(String(item.authorization)) || !Array.isArray(item.evidence)
      || !item.evidence.includes(`memory-authorization:${item.authorization}`) || !finite(item.confidence) || !Number.isInteger(item.evidenceCount)) throw new DesignMemoryError("Design Memory learned recommendation is invalid", "INTEGRITY");
    if (item.authorization === "pending" ? item.decisionId !== undefined : !ID.test(String(item.decisionId ?? ""))) throw new DesignMemoryError("Design Memory learned decision binding is invalid", "INTEGRITY");
  }
  const withheldAllowed = ["dimension", "path", "candidate", "confidence", "evidenceCount", "reason", "evidence"];
  for (const item of withheld) if (!isRecord(item) || !onlyKeys(item, withheldAllowed) || !["minimum-evidence", "low-confidence", "conflicting-evidence"].includes(String(item.reason)) || !Array.isArray(item.evidence)) throw new DesignMemoryError("Design Memory withheld evidence is invalid", "INTEGRITY");
}

export function validateDesignMemoryProfile(value: unknown, expected?: { projectId: string; userKey: string; profileId?: string }): DesignMemoryProfile {
  if (!isRecord(value) || !onlyKeys(value, ["schema", "profileId", "scope", "sourceHashes", "sourceRevisions", "policy", "explicitEvidence", "learned", "withheld", "profileHash"])
    || value.schema !== DESIGN_MEMORY_PROFILE_SCHEMA || !isRecord(value.scope) || !isRecord(value.sourceHashes) || !isRecord(value.policy)) throw new DesignMemoryError("Design Memory profile structure is invalid", "INTEGRITY");
  const profile = value as unknown as DesignMemoryProfile; assertScope(profile.scope);
  if (expected && (profile.scope.projectId !== expected.projectId || profile.scope.userKey !== expected.userKey || (expected.profileId && profile.profileId !== expected.profileId))) throw new DesignMemoryError("Design Memory profile scope or identity is invalid", "INTEGRITY");
  const sourceKeys = ["stylePacks", "goldenSlides", "preferenceJournal", "preferenceProfile", "learningJournal", "learnedProfile", "proposal", "decisions", "trustedLearningArtifacts", "semanticIndex", "preferenceSnapshot", "learningSnapshot", "decisionSnapshot"];
  if (!onlyKeys(value.sourceHashes as Record<string, unknown>, sourceKeys) || !["stylePacks", "preferenceJournal", "preferenceProfile", "semanticIndex"].every((key) => HASH.test(String((value.sourceHashes as Record<string, unknown>)[key] ?? "")))
    || Object.values(value.sourceHashes).some((hash) => !HASH.test(String(hash)))) throw new DesignMemoryError("Design Memory source hashes are invalid", "INTEGRITY");
  if (!isRecord(value.sourceRevisions) || !onlyKeys(value.sourceRevisions, ["preference", "learning", "decisions"])
    || !Number.isInteger(value.sourceRevisions.preference) || (value.sourceRevisions.preference as number) < 0
    || Object.values(value.sourceRevisions).some((revision) => !Number.isInteger(revision) || (revision as number) < 0)) throw new DesignMemoryError("Design Memory source revisions are invalid", "INTEGRITY");
  if (!HASH.test(String(value.sourceHashes.preferenceSnapshot ?? ""))
    || ((value.sourceRevisions as Record<string, unknown>).learning !== undefined) !== (value.sourceHashes.learningSnapshot !== undefined)
    || ((value.sourceRevisions as Record<string, unknown>).decisions !== undefined) !== (value.sourceHashes.decisionSnapshot !== undefined)) throw new DesignMemoryError("Design Memory source snapshot lineage is incomplete", "INTEGRITY");
  if (!onlyKeys(value.policy as Record<string, unknown>, ["automaticDesignChanges", "requiresExplicitDownstreamOptIn", "ranking", "learnedAuthority"])
    || profile.policy.automaticDesignChanges !== false || profile.policy.requiresExplicitDownstreamOptIn !== true || profile.policy.ranking !== "deterministic-explicit-preference"
    || profile.policy.learnedAuthority !== "conflict-free-exact-proposal-acceptance") throw new DesignMemoryError("Design Memory policy is invalid", "INTEGRITY");
  validateExplicitEvidence(profile.explicitEvidence); validateLearnedEvidence(profile.learned, profile.withheld);
  if ((profile.learned.length > 0 || profile.withheld.length > 0) && !["learningJournal", "learnedProfile", "proposal", "trustedLearningArtifacts"].every((key) => HASH.test(String((profile.sourceHashes as unknown as Record<string, unknown>)[key] ?? "")))) {
    throw new DesignMemoryError("Design Memory learned evidence lineage is incomplete", "INTEGRITY");
  }
  const hasLearning = profile.sourceHashes.learningJournal !== undefined;
  if (hasLearning !== (profile.sourceHashes.learningSnapshot !== undefined) || hasLearning !== (profile.sourceRevisions.learning !== undefined)
    || (profile.sourceHashes.decisions !== undefined) !== (profile.sourceHashes.decisionSnapshot !== undefined) || (profile.sourceHashes.decisions !== undefined) !== (profile.sourceRevisions.decisions !== undefined)) throw new DesignMemoryError("Design Memory persisted learning snapshot lineage is incomplete", "INTEGRITY");
  if (profile.learned.some((item) => item.authorization !== "pending") && !HASH.test(profile.sourceHashes.decisions ?? "")) throw new DesignMemoryError("Design Memory decision lineage is incomplete", "INTEGRITY");
  const { schema: _schema, profileId: _profileId, profileHash: _profileHash, ...body } = profile;
  const expectedId = `design_memory_${designMemoryHash(body).slice(0, 24)}`;
  if (profile.profileId !== expectedId || profile.profileHash !== designMemoryHash({ schema: profile.schema, profileId: profile.profileId, ...body })) throw new DesignMemoryError("Design Memory profile identity or hash is invalid", "INTEGRITY");
  return structuredClone(profile);
}

function validateCandidate(item: unknown) {
  if (!isRecord(item) || !onlyKeys(item, ["id", "artifactType", "title", "score", "dimensions", "evidence", "source", "sourceArtifactHash", "sourceVersionHash"])
    || !["golden_slide", "style_pack"].includes(String(item.artifactType)) || typeof item.id !== "string" || typeof item.title !== "string" || !finite(item.score) || (item.score as number) < 0 || (item.score as number) > 100
    || !isRecord(item.dimensions) || !isRecord(item.source) || !onlyKeys(item.source, ["candidateId", "sourceSlide", "stylePackId", "version"])
    || !Array.isArray(item.evidence) || item.evidence.some((evidence) => typeof evidence !== "string") || !HASH.test(String(item.sourceArtifactHash)) || !HASH.test(String(item.sourceVersionHash))) throw new DesignMemoryError("Design Memory candidate is invalid", "INTEGRITY");
  if (item.artifactType === "style_pack" ? (typeof item.source.stylePackId !== "string" || typeof item.source.version !== "string" || item.source.candidateId !== undefined || item.source.sourceSlide !== undefined)
    : (typeof item.source.candidateId !== "string" || !Number.isInteger(item.source.sourceSlide) || item.source.stylePackId !== undefined || item.source.version !== undefined)) throw new DesignMemoryError("Design Memory candidate source is invalid", "INTEGRITY");
  const dimensionKeys = ["semantic", "role", "layout", "density", "chart", "style", "audience", "quality", "preference"];
  if (!onlyKeys(item.dimensions, dimensionKeys) || Object.values(item.dimensions).some((score) => !finite(score) || (score as number) < 0 || (score as number) > 100)) throw new DesignMemoryError("Design Memory candidate dimensions are invalid", "INTEGRITY");
}

export function validateDesignMemoryRecommendation(value: unknown, profileValue: unknown, expectedRecommendationId?: string): DesignMemoryRecommendation {
  const profile = validateDesignMemoryProfile(profileValue);
  const keys = ["schema", "recommendationId", "profileId", "profileHash", "scope", "mode", "automaticMutation", "requiresExplicitOptIn", "targets", "normalizedQuery", "queryHash", "candidates", "authorizedLearnedRecommendations", "suppressedLearnedRecommendations", "recommendationHash"];
  if (!isRecord(value) || !onlyKeys(value, keys) || value.schema !== DESIGN_MEMORY_RECOMMENDATION_SCHEMA || !isRecord(value.scope) || !isRecord(value.normalizedQuery)
    || !Array.isArray(value.targets) || !Array.isArray(value.candidates) || !Array.isArray(value.authorizedLearnedRecommendations) || !Array.isArray(value.suppressedLearnedRecommendations)) throw new DesignMemoryError("Design Memory recommendation structure is invalid", "INTEGRITY");
  const recommendation = value as unknown as DesignMemoryRecommendation;
  assertScope(recommendation.scope);
  if ((expectedRecommendationId && recommendation.recommendationId !== expectedRecommendationId) || recommendation.profileId !== profile.profileId || recommendation.profileHash !== profile.profileHash
    || recommendation.scope.projectId !== profile.scope.projectId || recommendation.scope.userKey !== profile.scope.userKey || recommendation.mode !== "advisory"
    || recommendation.automaticMutation !== false || recommendation.requiresExplicitOptIn !== true || !same(recommendation.targets, ["style-mix", "slide-plan", "pptx"])) throw new DesignMemoryError("Design Memory recommendation policy or binding is invalid", "INTEGRITY");
  const queryAllowed = ["text", "artifactTypes", "roles", "layoutFamilies", "densities", "chart", "styleIds", "audienceTags", "limit", "minScore", "preferenceRanking"];
  if (!onlyKeys(recommendation.normalizedQuery as unknown as Record<string, unknown>, queryAllowed) || recommendation.normalizedQuery.preferenceRanking !== "explicit"
    || !["required", "excluded", "any"].includes(recommendation.normalizedQuery.chart) || !Number.isInteger(recommendation.normalizedQuery.limit) || recommendation.normalizedQuery.limit < 1 || recommendation.normalizedQuery.limit > 20
    || !finite(recommendation.normalizedQuery.minScore) || recommendation.normalizedQuery.minScore < 0 || recommendation.normalizedQuery.minScore > 100
    || ["artifactTypes", "roles", "layoutFamilies", "densities", "styleIds", "audienceTags"].some((key) => {
      const item = (recommendation.normalizedQuery as unknown as Record<string, unknown>)[key]; return item !== undefined && (!Array.isArray(item) || item.some((entry) => typeof entry !== "string"));
    }) || recommendation.queryHash !== designMemoryHash(recommendation.normalizedQuery)) throw new DesignMemoryError("Design Memory normalized query is invalid", "INTEGRITY");
  recommendation.candidates.forEach((candidate) => {
    validateCandidate(candidate);
    const expectedSourceHash = candidate.artifactType === "style_pack" ? profile.sourceHashes.stylePacks : profile.sourceHashes.goldenSlides;
    if (!expectedSourceHash || candidate.sourceArtifactHash !== expectedSourceHash) throw new DesignMemoryError("Design Memory candidate source lineage is invalid", "INTEGRITY");
  });
  const expectedAuthorized = profile.learned.filter((item) => item.authorization === "authorized").map(({ authorization: _authorization, decisionId: _decisionId, ...item }) => item);
  const expectedSuppressed = profile.learned.filter((item) => item.authorization !== "authorized").map((item) => ({ recommendationId: item.recommendationId, authorization: item.authorization }));
  if (!same(recommendation.authorizedLearnedRecommendations, expectedAuthorized) || !same(recommendation.suppressedLearnedRecommendations, expectedSuppressed)) throw new DesignMemoryError("Design Memory learned recommendation projection is invalid", "INTEGRITY");
  const { schema: _schema, recommendationId: _recommendationId, recommendationHash: _recommendationHash, ...body } = recommendation;
  const expectedId = `design_recommendation_${designMemoryHash(body).slice(0, 24)}`;
  if (recommendation.recommendationId !== expectedId || recommendation.recommendationHash !== designMemoryHash({ schema: recommendation.schema, recommendationId: recommendation.recommendationId, ...body })) throw new DesignMemoryError("Design Memory recommendation identity or hash is invalid", "INTEGRITY");
  return structuredClone(recommendation);
}

function validatedStylePacks(value: StylePackLibrary) {
  try { return structuredClone(verifyStylePackLibrary(value)); }
  catch (error) { throw new DesignMemoryError(error instanceof Error ? error.message : "Style Pack library is invalid", "INTEGRITY"); }
}

function validateGoldenSlides(golden: GoldenSlideLibrary) {
  const roles = new Set(["cover", "agenda_section", "summary", "evidence_data", "comparison", "process_timeline", "closing", "other"]);
  const families = new Set(["COVER", "SECTION", "EXEC_SUMMARY", "DATA_LEFT_TEXT_RIGHT", "TEXT_LEFT_DATA_RIGHT", "FULL_CHART", "FULL_TABLE", "BIG_NUMBER", "TWO_COLUMN", "HERO_IMAGE", "COMPARISON", "PROCESS_TIMELINE", "OTHER"]);
  const dimensions = ["layoutQuality", "clarity", "reusability", "styleRepresentativeness", "hierarchy", "balance"];
  if (!isRecord(golden) || !onlyKeys(golden as unknown as Record<string, unknown>, ["schema", "referenceStyleId", "sourceFile", "usage", "thresholds", "candidates"])
    || golden.schema !== "ppt-factory/golden-slides/v1" || !ID.test(golden.referenceStyleId ?? "") || typeof golden.sourceFile !== "string"
    || !isRecord(golden.usage) || !onlyKeys(golden.usage as unknown as Record<string, unknown>, ["mode", "retrievalEligible"])
    || !["learn-style", "compatibility-only"].includes(golden.usage.mode) || golden.usage.retrievalEligible !== (golden.usage.mode === "learn-style")
    || !isRecord(golden.thresholds) || !onlyKeys(golden.thresholds as unknown as Record<string, unknown>, ["candidate", "retrieval"])
    || !finite(golden.thresholds.candidate) || golden.thresholds.candidate < 0 || golden.thresholds.candidate > 100
    || !finite(golden.thresholds.retrieval) || golden.thresholds.retrieval < 0 || golden.thresholds.retrieval > 100 || !Array.isArray(golden.candidates)) throw new DesignMemoryError("Golden Slide library is invalid", "INTEGRITY");
  const ids = new Set<string>();
  for (const candidate of golden.candidates) {
    if (!isRecord(candidate) || !onlyKeys(candidate as unknown as Record<string, unknown>, ["id", "sourceSlide", "role", "layoutFamily", "density", "hasChart", "score", "candidateThreshold", "eligible", "dimensionScores", "evidence"])
      || !ID.test(candidate.id ?? "") || ids.has(candidate.id) || !Number.isInteger(candidate.sourceSlide) || candidate.sourceSlide < 1
      || !roles.has(candidate.role) || !families.has(candidate.layoutFamily) || !["sparse", "balanced", "dense"].includes(candidate.density)
      || typeof candidate.hasChart !== "boolean" || !finite(candidate.score) || candidate.score < 0 || candidate.score > 100
      || !finite(candidate.candidateThreshold) || candidate.candidateThreshold !== golden.thresholds.candidate
      || candidate.eligible !== (golden.usage.mode === "learn-style" && candidate.score >= candidate.candidateThreshold)
      || !isRecord(candidate.dimensionScores) || !onlyKeys(candidate.dimensionScores as unknown as Record<string, unknown>, dimensions)
      || dimensions.some((key) => !finite(candidate.dimensionScores[key as keyof typeof candidate.dimensionScores]) || candidate.dimensionScores[key as keyof typeof candidate.dimensionScores] < 0 || candidate.dimensionScores[key as keyof typeof candidate.dimensionScores] > 100)
      || !Array.isArray(candidate.evidence) || candidate.evidence.some((item) => typeof item !== "string")) throw new DesignMemoryError("Golden Slide candidate is invalid", "INTEGRITY");
    ids.add(candidate.id);
  }
  return structuredClone(golden);
}

function validateDecision(decision: PreferenceRecommendationDecision, scope: PreferenceScope, index: number) {
  const { schema: _schema, decisionId: _decisionId, sequence: _sequence, ...payload } = decision;
  if (decision.schema !== "ppt-factory/preference-recommendation-decision/v1" || decision.sequence !== index + 1
    || decision.decisionId !== `preference_decision_${designMemoryHash(payload).slice(0, 20)}`
    || !["accept", "reject"].includes(decision.decision) || decision.explicitOptIn !== true
    || decision.authorizedForDownstreamApply !== (decision.decision === "accept")
    || decision.downstreamMutationPerformed !== false) {
    throw new DesignMemoryError(`Preference decision ${index + 1} is invalid`, "INTEGRITY");
  }
  assertSameScope(decision.scope, scope, `Preference decision ${index + 1}`);
}

function validateLearning(value: DesignMemoryLearningSources | undefined, scope: PreferenceScope, preferenceJournal: PreferenceEventJournal) {
  if (!value) return undefined;
  assertSameScope(value.journal.scope, scope, "Style edit journal");
  const eventKeys = new Set<string>();
  value.journal.events.forEach((event, index) => {
    const { schema: _schema, eventId: _eventId, sequence: _sequence, ...payload } = event;
    const expectedId = `edit_${designMemoryHash({ scope, payload }).slice(0, 20)}`;
    if (event.schema !== "ppt-factory/style-edit-event/v1" || event.sequence !== index + 1 || event.eventId !== expectedId || eventKeys.has(event.idempotencyKey)) {
      throw new DesignMemoryError(`Style edit journal event ${index + 1} is invalid`, "INTEGRITY");
    }
    eventKeys.add(event.idempotencyKey);
  });
  const inputs = value.journal.events.map(({ schema: _schema, eventId: _eventId, sequence: _sequence, ...input }) => input);
  let rebuilt: ReturnType<typeof mergeStyleEditJournal>;
  try { rebuilt = mergeStyleEditJournal(undefined, scope, inputs, preferenceJournal, value.trustedArtifacts); }
  catch (error) { throw new DesignMemoryError(error instanceof Error ? error.message : "Trusted learning lineage is invalid", "INTEGRITY"); }
  if (!same(rebuilt.journal, value.journal)) throw new DesignMemoryError("Style edit journal does not match trusted persisted lineage", "INTEGRITY");
  const profile = learnPreferenceProfile(value.journal);
  if (!same(profile, value.profile)) throw new DesignMemoryError("Learned preference profile does not match its edit journal", "INTEGRITY");
  const proposal = createPreferenceProposal(profile);
  if (!same(proposal, value.proposal)) throw new DesignMemoryError("Preference proposal does not match its learned profile", "INTEGRITY");
  const decisions = value.decisions;
  if (decisions) {
    if (decisions.schema !== "ppt-factory/preference-recommendation-decision-journal/v1" || !Array.isArray(decisions.decisions)) {
      throw new DesignMemoryError("Preference decision journal is invalid", "INTEGRITY");
    }
    assertSameScope(decisions.scope, scope, "Preference decision journal");
    const keys = new Set<string>();
    decisions.decisions.forEach((decision, index) => {
      validateDecision(decision, scope, index);
      if (keys.has(decision.decisionKey)) throw new DesignMemoryError("Preference decision keys must be unique", "INTEGRITY");
      keys.add(decision.decisionKey);
    });
  }
  return { journal: value.journal, profile, proposal, decisions, trustedArtifacts: value.trustedArtifacts };
}

export function buildDesignMemory(input: DesignMemoryInput): { profile: DesignMemoryProfile; recommendation: DesignMemoryRecommendation } {
  assertScope(input.scope); assertQuery(input.query);
  assertSameScope(input.preferenceJournal.scope, input.scope, "Preference event journal");
  const preferenceJournal = normalizePreferenceJournal(input.preferenceJournal, input.scope);
  const preferenceProfile = aggregatePreferenceProfile(preferenceJournal);
  if (!same(preferenceProfile, input.preferenceProfile)) throw new DesignMemoryError("Preference profile does not match its event journal", "INTEGRITY");
  const stylePacks = validatedStylePacks(input.stylePacks);
  const goldenSlides = input.goldenSlides ? validateGoldenSlides(input.goldenSlides) : undefined;
  for (const aggregate of preferenceProfile.subjects) {
    const subject = aggregate.subject;
    if (subject.artifactType === "style_pack" && !stylePacks.packs.some((pack) => pack.id === subject.id && pack.version === subject.version && pack.active)) {
      throw new DesignMemoryError(`Preference subject is stale or unavailable: ${subject.id}@${subject.version}`, "INTEGRITY");
    }
    if (subject.artifactType === "golden_slide" && (!goldenSlides || goldenSlides.usage.mode !== "learn-style" || !goldenSlides.usage.retrievalEligible
      || !goldenSlides.candidates.some((candidate) => candidate.id === subject.id && candidate.eligible) || subject.version !== "v1")) {
      throw new DesignMemoryError(`Preference subject is stale or unavailable: ${subject.id}@${subject.version}`, "INTEGRITY");
    }
  }
  const index = buildSemanticSearchIndex({ projectId: input.scope.projectId, goldenSlides, stylePacks });
  const search = searchSemanticIndex(index, { ...input.query, preferenceRanking: "explicit" }, {
    preferenceSignals: preferenceRankingSignals(preferenceProfile)
  });
  const learning = validateLearning(input.learning, input.scope, preferenceJournal);
  const relevantDecisions = (learning?.decisions?.decisions ?? []).filter((item) => item.proposalId === learning?.proposal.proposalId);
  const decisionKinds = new Set(relevantDecisions.map((item) => item.decision));
  const authorization = decisionKinds.size === 0 ? "pending" as const : decisionKinds.size > 1 ? "conflicting" as const
    : decisionKinds.has("accept") ? "authorized" as const : "rejected" as const;
  const authorityDecision = relevantDecisions.at(-1);
  const learned = (learning?.profile.recommendations ?? []).map((item) => ({
    ...structuredClone(item), authorization, ...(authorityDecision ? { decisionId: authorityDecision.decisionId } : {}),
    evidence: [...item.evidence, `memory-authorization:${authorization}`, ...relevantDecisions.map((decision) => `decision:${decision.decisionId}:${decision.decision}`)]
  }));
  const candidates: DesignMemoryCandidate[] = search.matches.map((match) => {
    if (match.artifactType === "style_pack") {
      const pack = stylePacks.packs.find((item) => item.id === match.source.stylePackId && item.version === match.source.version);
      if (!pack) throw new DesignMemoryError("Semantic result references an unknown Style Pack", "INTEGRITY");
      return { ...structuredClone(match), sourceArtifactHash: designMemoryHash(stylePacks), sourceVersionHash: pack.contentHash };
    }
    const candidate = goldenSlides?.candidates.find((item) => item.id === match.source.candidateId);
    if (!candidate) throw new DesignMemoryError("Semantic result references an unknown Golden Slide", "INTEGRITY");
    return { ...structuredClone(match), sourceArtifactHash: designMemoryHash(goldenSlides), sourceVersionHash: designMemoryHash(candidate) };
  });
  const sourceHashes = {
    stylePacks: designMemoryHash(stylePacks), ...(goldenSlides ? { goldenSlides: designMemoryHash(goldenSlides) } : {}),
    preferenceJournal: designMemoryHash(preferenceJournal), preferenceProfile: designMemoryHash(preferenceProfile),
    ...(learning ? {
      learningJournal: designMemoryHash(learning.journal), learnedProfile: designMemoryHash(learning.profile),
      proposal: designMemoryHash(learning.proposal), trustedLearningArtifacts: designMemoryHash(learning.trustedArtifacts), ...(learning.decisions ? { decisions: designMemoryHash(learning.decisions) } : {})
    } : {}), semanticIndex: designMemoryHash(index), preferenceSnapshot: input.sourceSnapshots.preference.snapshotHash,
    ...(input.sourceSnapshots.learning ? { learningSnapshot: input.sourceSnapshots.learning.snapshotHash } : {}),
    ...(input.sourceSnapshots.decisions ? { decisionSnapshot: input.sourceSnapshots.decisions.snapshotHash } : {})
  };
  for (const [label, snapshot] of Object.entries(input.sourceSnapshots)) if (!Number.isInteger(snapshot.revision) || snapshot.revision < 0 || !HASH.test(snapshot.snapshotHash)) throw new DesignMemoryError(`${label} source snapshot lineage is invalid`, "INTEGRITY");
  if (Boolean(learning) !== Boolean(input.sourceSnapshots.learning) || Boolean(learning?.decisions) !== Boolean(input.sourceSnapshots.decisions)) throw new DesignMemoryError("Persisted learning snapshot lineage does not match Design Memory sources", "INTEGRITY");
  const profileBody = {
    scope: structuredClone(input.scope), sourceHashes,
    sourceRevisions: { preference: input.sourceSnapshots.preference.revision,
      ...(input.sourceSnapshots.learning ? { learning: input.sourceSnapshots.learning.revision } : {}),
      ...(input.sourceSnapshots.decisions ? { decisions: input.sourceSnapshots.decisions.revision } : {}) },
    policy: { automaticDesignChanges: false as const, requiresExplicitDownstreamOptIn: true as const,
      ranking: "deterministic-explicit-preference" as const, learnedAuthority: "conflict-free-exact-proposal-acceptance" as const },
    explicitEvidence: structuredClone(preferenceProfile.subjects), learned,
    withheld: structuredClone(learning?.profile.withheld ?? [])
  };
  const profileId = `design_memory_${designMemoryHash(profileBody).slice(0, 24)}`;
  const profileBase = { schema: DESIGN_MEMORY_PROFILE_SCHEMA, profileId, ...profileBody };
  const profile = { ...profileBase, profileHash: designMemoryHash(profileBase) } satisfies DesignMemoryProfile;
  const recommendationBody = {
    profileId, profileHash: profile.profileHash, scope: structuredClone(input.scope), mode: "advisory" as const,
    automaticMutation: false as const, requiresExplicitOptIn: true as const,
    targets: ["style-mix", "slide-plan", "pptx"] as const,
    normalizedQuery: structuredClone(search.query), queryHash: designMemoryHash(search.query), candidates: structuredClone(candidates),
    authorizedLearnedRecommendations: learned.filter((item) => item.authorization === "authorized").map(({ authorization: _authorization, decisionId: _decisionId, ...item }) => item),
    suppressedLearnedRecommendations: learned.filter((item) => item.authorization !== "authorized")
      .map((item) => ({ recommendationId: item.recommendationId, authorization: item.authorization as "rejected" | "pending" | "conflicting" }))
  };
  const recommendationId = `design_recommendation_${designMemoryHash(recommendationBody).slice(0, 24)}`;
  const recommendationBase = { schema: DESIGN_MEMORY_RECOMMENDATION_SCHEMA, recommendationId, ...recommendationBody };
  const recommendation = { ...recommendationBase, recommendationHash: designMemoryHash(recommendationBase) } satisfies DesignMemoryRecommendation;
  return { profile: validateDesignMemoryProfile(profile), recommendation: validateDesignMemoryRecommendation(recommendation, profile) };
}
