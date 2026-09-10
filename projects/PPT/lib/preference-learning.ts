import { createHash } from "node:crypto";
import type { PreferenceEventJournal, PreferenceScope } from "@/lib/preference-events";
import { scopedPreferenceArtifactName } from "./preference-artifacts.mjs";
import type { StyleDimension } from "@/lib/types";

export const PREFERENCE_LEARNING_POLICY = {
  minimumEvidence: 2,
  minimumConfidence: 0.65,
  decayHalfLifeEvents: 6,
  automaticMutation: false,
  applyMode: "explicit-proposal-decision-only"
} as const;

type Primitive = string | number | boolean;

export type ImmutableVersionRef = {
  versionId: string;
  contentHash: string;
  parentVersionId?: string;
};

export type StyleEditDelta = {
  dimension: StyleDimension;
  path: string;
  before: Primitive;
  after: Primitive;
};

export type ObjectStyleEditDelta = StyleEditDelta & {
  objectId: string;
  slideIndex: number;
  objectType: "text" | "shape" | "chart" | "image";
};

export type StyleEditEvidence = {
  outcome: "accepted" | "reverted";
  explicit: true;
  auditRef: string;
  preferenceEventId?: string;
};

export type StyleEditInput = {
  idempotencyKey: string;
  before: { deck: ImmutableVersionRef; style: ImmutableVersionRef };
  after: { deck: ImmutableVersionRef; style: ImmutableVersionRef };
  objectDeltas?: ObjectStyleEditDelta[];
  styleDeltas?: StyleEditDelta[];
  evidence: StyleEditEvidence;
};

export type StyleEditEvent = StyleEditInput & {
  schema: "ppt-factory/style-edit-event/v1";
  eventId: string;
  sequence: number;
};

export type StyleEditJournal = {
  schema: "ppt-factory/style-edit-journal/v1";
  scope: PreferenceScope;
  events: StyleEditEvent[];
};

export type TrustedPreferenceLearningArtifacts = {
  schema: "ppt-factory/preference-learning-trusted-artifacts/v1";
  source: "persisted-local-artifacts";
  projectId: string;
  deckUpdates: Array<{
    auditRef: string;
    source: { versionId: string; contentHash: string; projectId?: string };
    output: { versionId: string; contentHash: string; projectId: string };
  }>;
  styleVersions: Array<{ versionId: string; contentHash: string }>;
};

export type LearnedRecommendation = {
  recommendationId: string;
  dimension: StyleDimension;
  path: string;
  kind: "categorical-value" | "numeric-direction";
  value?: Primitive;
  direction?: "increase" | "decrease";
  recommendedValue?: number;
  confidence: number;
  evidenceCount: number;
  independentDeckVersions: number;
  decayedWeight: number;
  competingWeight: number;
  evidence: string[];
};

export type WithheldPreference = {
  dimension: StyleDimension;
  path: string;
  candidate: string;
  confidence: number;
  evidenceCount: number;
  reason: "minimum-evidence" | "low-confidence" | "conflicting-evidence";
  evidence: string[];
};

export type LearnedPreferenceProfile = {
  schema: "ppt-factory/learned-preference-profile/v1";
  profileId: string;
  scope: PreferenceScope;
  sourceJournalHash: string;
  policy: typeof PREFERENCE_LEARNING_POLICY;
  evidenceSummary: {
    acceptedEvents: number;
    revertedEvents: number;
    corroboratingPreferenceEvents: number;
  };
  recommendations: LearnedRecommendation[];
  withheld: WithheldPreference[];
};

export type PreferenceRecommendationProposal = {
  schema: "ppt-factory/preference-recommendation-proposal/v1";
  proposalId: string;
  profileId: string;
  scope: PreferenceScope;
  mode: "dry-run";
  automaticMutation: false;
  requiresExplicitOptIn: true;
  targets: readonly ["style-mix", "slide-plan", "pptx"];
  recommendations: LearnedRecommendation[];
  withheldCount: number;
};

export type PreferenceRecommendationDecision = {
  schema: "ppt-factory/preference-recommendation-decision/v1";
  decisionId: string;
  sequence: number;
  proposalId: string;
  scope: PreferenceScope;
  decision: "accept" | "reject";
  decisionKey: string;
  explicitOptIn: true;
  authorizedForDownstreamApply: boolean;
  downstreamMutationPerformed: false;
};

export type PreferenceRecommendationDecisionJournal = {
  schema: "ppt-factory/preference-recommendation-decision-journal/v1";
  scope: PreferenceScope;
  decisions: PreferenceRecommendationDecision[];
};

export class PreferenceLearningError extends Error {
  readonly code: "INVALID" | "CONFLICT" | "NOT_FOUND";

  constructor(message: string, code: "INVALID" | "CONFLICT" | "NOT_FOUND" = "INVALID") {
    super(message);
    this.code = code;
  }
}

const ID_PATTERN = /^[a-zA-Z0-9._:-]+$/;
const USER_KEY_PATTERN = /^[a-zA-Z0-9_-]+$/;
const VERSION_ID_PATTERN = /^[a-zA-Z0-9._:@\-\u3400-\u9fff]+$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const SUPPORTED_PATHS: Record<StyleDimension, ReadonlySet<string>> = {
  typography: new Set(["typography.primary", "typography.titleWeight", "typography.bodyWeight", "typography.titleSizePt", "typography.bodySizePt"]),
  color: new Set(["colors.background", "colors.text", "colors.primary", "colors.accent", "colors.muted"]),
  layout: new Set(["grid.margin", "grid.gutter", "grid.columns", "layout.family"]),
  chart: new Set(["charts.legend", "charts.gridlines", "charts.dataLabels", "charts.palette", "charts.treatment"]),
  density: new Set(["density.score", "density.label"]),
  composition: new Set(["composition.preferred", "composition.imageFrequency"]),
  storytelling: new Set(["storytelling.model", "storytelling.confidence"]),
  visualTone: new Set(["visuals.tone", "visuals.imageStyle", "styleVector.visualImpact", "styleVector.technology"])
};

const round = (value: number) => Number(value.toFixed(4));

export function validatePreferenceUserKey(userKey: string) {
  if (!USER_KEY_PATTERN.test(userKey ?? "")) throw new PreferenceLearningError("userKey must contain only letters, numbers, underscore or hyphen");
  return userKey;
}

export const preferenceLearningSnapshotName = (userKey: string) => scopedPreferenceArtifactName(validatePreferenceUserKey(userKey), "learning-snapshot");
export const preferenceDecisionSnapshotName = (userKey: string) => scopedPreferenceArtifactName(validatePreferenceUserKey(userKey), "decision-snapshot");

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b, "en"))
      .map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}

function digest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

function assertScope(scope: PreferenceScope) {
  if (scope?.kind !== "local-project-user-placeholder" || !ID_PATTERN.test(scope.projectId ?? "") || !USER_KEY_PATTERN.test(scope.userKey ?? "")) {
    throw new PreferenceLearningError("A valid local project/user placeholder scope is required");
  }
}

function assertVersion(ref: ImmutableVersionRef | undefined, label: string) {
  if (!ref || !VERSION_ID_PATTERN.test(ref.versionId ?? "") || !HASH_PATTERN.test(ref.contentHash ?? "")
    || (ref.parentVersionId !== undefined && !VERSION_ID_PATTERN.test(ref.parentVersionId))) {
    throw new PreferenceLearningError(`${label} must be an immutable version id with a sha256 content hash`);
  }
}

function sameVersion(actual: ImmutableVersionRef, trusted: { versionId: string; contentHash: string }) {
  return actual.versionId === trusted.versionId && actual.contentHash === trusted.contentHash;
}

function assertTrustedArtifacts(scope: PreferenceScope, trusted?: TrustedPreferenceLearningArtifacts) {
  if (!trusted || trusted.schema !== "ppt-factory/preference-learning-trusted-artifacts/v1"
    || trusted.source !== "persisted-local-artifacts" || trusted.projectId !== scope.projectId
    || !Array.isArray(trusted.deckUpdates) || !Array.isArray(trusted.styleVersions)) {
    throw new PreferenceLearningError("Trusted persisted deck-update and style artifacts are required for edit learning", "NOT_FOUND");
  }
}

function reconcileTrustedEvent(event: StyleEditInput, trusted: TrustedPreferenceLearningArtifacts, index: number) {
  const transition = trusted.deckUpdates.find((item) => item.auditRef === event.evidence.auditRef);
  if (!transition || !sameVersion(event.before.deck, transition.source) || !sameVersion(event.after.deck, transition.output)
    || transition.output.projectId !== trusted.projectId) {
    throw new PreferenceLearningError(`Edit event ${index + 1} deck versions or auditRef do not match a persisted immutable deck-update manifest`, "NOT_FOUND");
  }
  for (const [label, ref] of [["before", event.before.style], ["after", event.after.style]] as const) {
    if (!trusted.styleVersions.some((item) => sameVersion(ref, item))) {
      throw new PreferenceLearningError(`Edit event ${index + 1} ${label} style version does not match a persisted immutable Style Pack`, "NOT_FOUND");
    }
  }
}

function primitive(value: unknown): value is Primitive {
  return typeof value === "string" || (typeof value === "number" && Number.isFinite(value)) || typeof value === "boolean";
}

function assertDelta(delta: StyleEditDelta, label: string) {
  if (!delta || !SUPPORTED_PATHS[delta.dimension]?.has(delta.path)) {
    throw new PreferenceLearningError(`${label} uses an unsupported or content-bearing style path`);
  }
  if (!primitive(delta.before) || !primitive(delta.after) || typeof delta.before !== typeof delta.after || digest(delta.before) === digest(delta.after)) {
    throw new PreferenceLearningError(`${label} must contain different primitive before/after style values`);
  }
}

function assertPreferenceEvidence(event: StyleEditInput, preferenceJournal?: PreferenceEventJournal) {
  const preferenceEventId = event.evidence.preferenceEventId;
  if (!preferenceEventId) return;
  const supporting = preferenceJournal?.events.find((item) => item.eventId === preferenceEventId);
  if (!supporting) throw new PreferenceLearningError(`Corroborating preference event not found: ${preferenceEventId}`, "NOT_FOUND");
  const expected = event.evidence.outcome === "accepted" ? ["favorite", "use"] : ["reject"];
  if (!expected.includes(supporting.action)) {
    throw new PreferenceLearningError(`Preference event ${preferenceEventId} conflicts with ${event.evidence.outcome} edit evidence`, "CONFLICT");
  }
}

export function preflightStyleEditInputShape(value: unknown, index = 0): asserts value is StyleEditInput {
  const event = value as Partial<StyleEditInput> | null;
  if (!event || typeof event !== "object" || typeof event.idempotencyKey !== "string"
    || !event.before || typeof event.before !== "object" || !event.before.deck || !event.before.style
    || !event.after || typeof event.after !== "object" || !event.after.deck || !event.after.style
    || !event.evidence || typeof event.evidence !== "object" || typeof event.evidence.auditRef !== "string"
    || (!Array.isArray(event.objectDeltas) && !Array.isArray(event.styleDeltas))) {
    throw new PreferenceLearningError(`Edit event ${index + 1} has a malformed ingestion shape`);
  }
}

function validateInput(
  event: StyleEditInput,
  index: number,
  versionHashes: Map<string, string>,
  preferenceJournal: PreferenceEventJournal | undefined,
  trusted: TrustedPreferenceLearningArtifacts
) {
  if (!ID_PATTERN.test(event.idempotencyKey ?? "") || event.idempotencyKey.length > 128) {
    throw new PreferenceLearningError(`Edit event ${index + 1} has an invalid idempotency key`);
  }
  for (const [label, ref] of Object.entries({
    "before.deck": event.before?.deck, "before.style": event.before?.style,
    "after.deck": event.after?.deck, "after.style": event.after?.style
  })) assertVersion(ref, `Edit event ${index + 1} ${label}`);
  if (event.after.deck.parentVersionId !== event.before.deck.versionId || event.after.style.parentVersionId !== event.before.style.versionId) {
    throw new PreferenceLearningError(`Edit event ${index + 1} has a broken immutable before/after parent chain`);
  }
  if (event.after.deck.versionId === event.before.deck.versionId || event.after.style.versionId === event.before.style.versionId) {
    throw new PreferenceLearningError(`Edit event ${index + 1} must reference distinct immutable before/after versions`);
  }
  for (const ref of [event.before.deck, event.before.style, event.after.deck, event.after.style]) {
    const previousHash = versionHashes.get(ref.versionId);
    if (previousHash && previousHash !== ref.contentHash) {
      throw new PreferenceLearningError(`Immutable version ${ref.versionId} is reused with another content hash`, "CONFLICT");
    }
    versionHashes.set(ref.versionId, ref.contentHash);
  }
  if (event.evidence?.explicit !== true || !["accepted", "reverted"].includes(event.evidence?.outcome)
    || !ID_PATTERN.test(event.evidence?.auditRef ?? "")) {
    throw new PreferenceLearningError(`Edit event ${index + 1} is ambiguous: explicit acceptance or revert evidence is required`);
  }
  const objectDeltas = event.objectDeltas ?? [];
  const styleDeltas = event.styleDeltas ?? [];
  if (objectDeltas.length + styleDeltas.length === 0) throw new PreferenceLearningError(`Edit event ${index + 1} has no style deltas`);
  objectDeltas.forEach((delta, deltaIndex) => {
    assertDelta(delta, `Edit event ${index + 1} object delta ${deltaIndex + 1}`);
    if (!ID_PATTERN.test(delta.objectId ?? "") || !Number.isInteger(delta.slideIndex) || delta.slideIndex < 1
      || !["text", "shape", "chart", "image"].includes(delta.objectType)) {
      throw new PreferenceLearningError(`Edit event ${index + 1} object delta ${deltaIndex + 1} has an invalid native object target`);
    }
  });
  styleDeltas.forEach((delta, deltaIndex) => assertDelta(delta, `Edit event ${index + 1} style delta ${deltaIndex + 1}`));
  assertPreferenceEvidence(event, preferenceJournal);
  reconcileTrustedEvent(event, trusted, index);
}

function editPayload(input: StyleEditInput) {
  return structuredClone(input);
}

function editEventId(scope: PreferenceScope, input: StyleEditInput) {
  return `edit_${digest({ scope, payload: editPayload(input) }).slice(0, 20)}`;
}

function normalizeExistingJournal(value: StyleEditJournal | undefined, scope: PreferenceScope) {
  if (!value) return { schema: "ppt-factory/style-edit-journal/v1" as const, scope: structuredClone(scope), events: [] };
  if (value.schema !== "ppt-factory/style-edit-journal/v1" || value.scope.projectId !== scope.projectId
    || value.scope.userKey !== scope.userKey || value.scope.kind !== scope.kind || !Array.isArray(value.events)) {
    throw new PreferenceLearningError("Persisted style edit journal scope or schema does not match", "CONFLICT");
  }
  const keys = new Set<string>();
  const ids = new Set<string>();
  value.events.forEach((event, index) => {
    preflightStyleEditInputShape(event, index);
    const { schema: _schema, eventId: _eventId, sequence: _sequence, ...payload } = event;
    if (event.schema !== "ppt-factory/style-edit-event/v1" || event.sequence !== index + 1
      || event.eventId !== editEventId(scope, payload) || keys.has(event.idempotencyKey) || ids.has(event.eventId)) {
      throw new PreferenceLearningError(`Persisted style edit journal event ${index + 1} is invalid`, "CONFLICT");
    }
    keys.add(event.idempotencyKey);
    ids.add(event.eventId);
  });
  return structuredClone(value);
}

export function mergeStyleEditJournal(
  existingValue: StyleEditJournal | undefined,
  scope: PreferenceScope,
  inputs: StyleEditInput[],
  preferenceJournal: PreferenceEventJournal | undefined,
  trusted: TrustedPreferenceLearningArtifacts
) {
  assertScope(scope);
  assertTrustedArtifacts(scope, trusted);
  if (!Array.isArray(inputs) || inputs.length === 0 || inputs.length > 200) {
    throw new PreferenceLearningError("Edit history must contain between 1 and 200 explicit events");
  }
  if (preferenceJournal && (preferenceJournal.scope.projectId !== scope.projectId || preferenceJournal.scope.userKey !== scope.userKey)) {
    throw new PreferenceLearningError("Preference-event scope does not match edit-history scope", "CONFLICT");
  }
  const existing = normalizeExistingJournal(existingValue, scope);
  const byKey = new Map(existing.events.map((event) => [event.idempotencyKey, event]));
  const pending = new Map<string, StyleEditInput>();
  const versionHashes = new Map<string, string>();
  existing.events.forEach((event, index) => validateInput(event, index, versionHashes, preferenceJournal, trusted));
  inputs.forEach((input, index) => {
    preflightStyleEditInputShape(input, index);
    validateInput(input, index, versionHashes, preferenceJournal, trusted);
    const stored = byKey.get(input.idempotencyKey);
    if (stored) {
      const { schema: _schema, eventId: _eventId, sequence: _sequence, ...storedPayload } = stored;
      if (digest(storedPayload) !== digest(editPayload(input))) {
        throw new PreferenceLearningError(`Edit idempotency key already belongs to another canonical payload: ${input.idempotencyKey}`, "CONFLICT");
      }
      return;
    }
    const duplicate = pending.get(input.idempotencyKey);
    if (duplicate && digest(duplicate) !== digest(input)) {
      throw new PreferenceLearningError(`Duplicate edit idempotency key has conflicting payload: ${input.idempotencyKey}`, "CONFLICT");
    }
    pending.set(input.idempotencyKey, structuredClone(input));
  });
  const additions = [...pending.values()].map((payload, index) => ({
      schema: "ppt-factory/style-edit-event/v1" as const,
      eventId: editEventId(scope, payload),
      sequence: existing.events.length + index + 1,
      ...payload
    }));
  const journal = { ...existing, events: [...existing.events, ...additions] };
  return { journal, appended: additions.length, existing: inputs.length - additions.length };
}

export function buildStyleEditJournal(
  scope: PreferenceScope,
  inputs: StyleEditInput[],
  preferenceJournal?: PreferenceEventJournal,
  trusted?: TrustedPreferenceLearningArtifacts
): StyleEditJournal {
  return mergeStyleEditJournal(undefined, scope, inputs, preferenceJournal, trusted as TrustedPreferenceLearningArtifacts).journal;
}

type CandidateEvidence = {
  key: string;
  dimension: StyleDimension;
  path: string;
  kind: LearnedRecommendation["kind"];
  value?: Primitive;
  direction?: "increase" | "decrease";
  numericValue?: number;
  eventId: string;
  deckVersionId: string;
  decay: number;
  weight: number;
  evidence: string[];
};

function candidateFor(event: StyleEditEvent, delta: StyleEditDelta, maxSequence: number): CandidateEvidence {
  const accepted = event.evidence.outcome === "accepted";
  const chosen = accepted ? delta.after : delta.before;
  const rejected = accepted ? delta.before : delta.after;
  const decay = 2 ** (-(maxSequence - event.sequence) / PREFERENCE_LEARNING_POLICY.decayHalfLifeEvents);
  const corroborated = Boolean(event.evidence.preferenceEventId);
  const weight = decay * (corroborated ? 1.1 : 1);
  const base = {
    dimension: delta.dimension, path: delta.path, eventId: event.eventId,
    deckVersionId: event.after.deck.versionId, decay, weight,
    evidence: [
      `event:${event.eventId}`, `outcome:${event.evidence.outcome}`, `audit:${event.evidence.auditRef}`,
      `chosen:${JSON.stringify(chosen)}`, `displaced:${JSON.stringify(rejected)}`, `decay:${round(decay)}`,
      ...(event.evidence.preferenceEventId ? [`preference-event:${event.evidence.preferenceEventId}`] : [])
    ]
  };
  if (typeof chosen === "number" && typeof rejected === "number") {
    const direction = chosen > rejected ? "increase" as const : "decrease" as const;
    return { ...base, kind: "numeric-direction", direction, numericValue: chosen, key: `${delta.dimension}:${delta.path}:direction:${direction}` };
  }
  return { ...base, kind: "categorical-value", value: chosen, key: `${delta.dimension}:${delta.path}:value:${JSON.stringify(chosen)}` };
}

export function learnPreferenceProfile(journal: StyleEditJournal): LearnedPreferenceProfile {
  assertScope(journal.scope);
  if (journal.schema !== "ppt-factory/style-edit-journal/v1" || journal.events.length === 0) throw new PreferenceLearningError("Invalid or empty style edit journal");
  const maxSequence = Math.max(...journal.events.map((event) => event.sequence));
  const all = journal.events.flatMap((event) => [...(event.objectDeltas ?? []), ...(event.styleDeltas ?? [])]
    .map((delta) => candidateFor(event, delta, maxSequence)));
  const byPath = new Map<string, CandidateEvidence[]>();
  for (const item of all) {
    const key = `${item.dimension}:${item.path}`;
    byPath.set(key, [...(byPath.get(key) ?? []), item]);
  }
  const recommendations: LearnedRecommendation[] = [];
  const withheld: WithheldPreference[] = [];
  for (const pathEvidence of byPath.values()) {
    const candidates = new Map<string, CandidateEvidence[]>();
    for (const item of pathEvidence) candidates.set(item.key, [...(candidates.get(item.key) ?? []), item]);
    const totalWeight = pathEvidence.reduce((sum, item) => sum + item.weight, 0);
    const ranked = [...candidates.entries()].map(([key, items]) => ({
      key, items, weight: items.reduce((sum, item) => sum + item.weight, 0)
    })).sort((a, b) => b.weight - a.weight || a.key.localeCompare(b.key, "en"));
    const top = ranked[0];
    const representative = top.items[0];
    const independentVersions = new Set(top.items.map((item) => item.deckVersionId)).size;
    const consistency = totalWeight ? top.weight / totalWeight : 0;
    const recency = top.items.reduce((sum, item) => sum + item.decay, 0) / top.items.length;
    const evidenceFactor = Math.min(1, Math.min(top.items.length, independentVersions) / PREFERENCE_LEARNING_POLICY.minimumEvidence);
    // Decay reduces confidence without erasing older, repeated evidence solely
    // because unrelated edits were recorded later in the same bounded journal.
    const recencyConfidence = 0.5 + recency * 0.5;
    const confidence = round(consistency * recencyConfidence * evidenceFactor);
    const common = {
      dimension: representative.dimension, path: representative.path, confidence,
      evidenceCount: top.items.length, evidence: top.items.flatMap((item) => item.evidence)
    };
    if (top.items.length < PREFERENCE_LEARNING_POLICY.minimumEvidence || independentVersions < PREFERENCE_LEARNING_POLICY.minimumEvidence) {
      withheld.push({ ...common, candidate: top.key, reason: "minimum-evidence" });
      continue;
    }
    if (ranked.length > 1 && consistency < 0.6) {
      withheld.push({ ...common, candidate: top.key, reason: "conflicting-evidence" });
      continue;
    }
    if (confidence < PREFERENCE_LEARNING_POLICY.minimumConfidence) {
      withheld.push({ ...common, candidate: top.key, reason: "low-confidence" });
      continue;
    }
    const recommendationPayload = {
      dimension: representative.dimension, path: representative.path, kind: representative.kind,
      ...(representative.kind === "categorical-value" ? { value: representative.value } : {
        direction: representative.direction,
        recommendedValue: round(top.items.reduce((sum, item) => sum + (item.numericValue ?? 0) * item.weight, 0) / top.weight)
      }),
      confidence, evidenceCount: top.items.length, independentDeckVersions: independentVersions,
      decayedWeight: round(top.weight), competingWeight: round(totalWeight - top.weight), evidence: common.evidence
    };
    recommendations.push({
      recommendationId: `learned_${digest(recommendationPayload).slice(0, 20)}`,
      ...recommendationPayload
    });
  }
  recommendations.sort((a, b) => a.dimension.localeCompare(b.dimension, "en") || a.path.localeCompare(b.path, "en"));
  withheld.sort((a, b) => a.dimension.localeCompare(b.dimension, "en") || a.path.localeCompare(b.path, "en"));
  const sourceJournalHash = digest(journal);
  const body = {
    scope: journal.scope, sourceJournalHash, policy: PREFERENCE_LEARNING_POLICY,
    evidenceSummary: {
      acceptedEvents: journal.events.filter((event) => event.evidence.outcome === "accepted").length,
      revertedEvents: journal.events.filter((event) => event.evidence.outcome === "reverted").length,
      corroboratingPreferenceEvents: journal.events.filter((event) => event.evidence.preferenceEventId).length
    }, recommendations, withheld
  };
  return {
    schema: "ppt-factory/learned-preference-profile/v1",
    profileId: `learned_profile_${digest(body).slice(0, 20)}`,
    ...structuredClone(body)
  };
}

export function createPreferenceProposal(profile: LearnedPreferenceProfile): PreferenceRecommendationProposal {
  const body = {
    profileId: profile.profileId, scope: profile.scope, mode: "dry-run" as const,
    automaticMutation: false as const, requiresExplicitOptIn: true as const,
    targets: ["style-mix", "slide-plan", "pptx"] as const,
    recommendations: structuredClone(profile.recommendations), withheldCount: profile.withheld.length
  };
  return {
    schema: "ppt-factory/preference-recommendation-proposal/v1",
    proposalId: `preference_proposal_${digest(body).slice(0, 20)}`,
    ...body
  };
}

function assertPreferenceProposal(proposal: PreferenceRecommendationProposal) {
  if (!proposal || proposal.schema !== "ppt-factory/preference-recommendation-proposal/v1"
    || proposal.mode !== "dry-run" || proposal.automaticMutation !== false || proposal.requiresExplicitOptIn !== true
    || JSON.stringify(proposal.targets) !== JSON.stringify(["style-mix", "slide-plan", "pptx"])) {
    throw new PreferenceLearningError("Preference proposal is invalid or unsafe");
  }
  const { schema: _schema, proposalId: _proposalId, ...body } = proposal;
  const expectedId = `preference_proposal_${digest(body).slice(0, 20)}`;
  if (proposal.proposalId !== expectedId) throw new PreferenceLearningError("Preference proposal is stale or has been modified", "CONFLICT");
}

export function createPreferenceDecision(
  proposal: PreferenceRecommendationProposal,
  input: { decision: "accept" | "reject"; decisionKey: string; explicitOptIn?: boolean }
): PreferenceRecommendationDecision {
  return appendPreferenceDecision(undefined, proposal, input).decision;
}

function decisionPayload(
  proposal: PreferenceRecommendationProposal,
  input: { decision: "accept" | "reject"; decisionKey: string; explicitOptIn?: boolean }
) {
  assertPreferenceProposal(proposal);
  if (input.explicitOptIn !== true) throw new PreferenceLearningError("An explicit opt-in is required to record a recommendation decision");
  if (!ID_PATTERN.test(input.decisionKey ?? "") || !["accept", "reject"].includes(input.decision)) {
    throw new PreferenceLearningError("A valid explicit recommendation decision is required");
  }
  return {
    proposalId: proposal.proposalId, scope: proposal.scope, decision: input.decision,
    decisionKey: input.decisionKey, explicitOptIn: true as const,
    authorizedForDownstreamApply: input.decision === "accept",
    downstreamMutationPerformed: false as const
  };
}

function normalizeDecisionJournal(value: PreferenceRecommendationDecisionJournal | undefined, scope: PreferenceScope) {
  if (!value) return { schema: "ppt-factory/preference-recommendation-decision-journal/v1" as const, scope: structuredClone(scope), decisions: [] };
  if (value.schema !== "ppt-factory/preference-recommendation-decision-journal/v1" || value.scope.projectId !== scope.projectId
    || value.scope.userKey !== scope.userKey || value.scope.kind !== scope.kind || !Array.isArray(value.decisions)) {
    throw new PreferenceLearningError("Persisted preference decision journal scope or schema does not match", "CONFLICT");
  }
  const keys = new Set<string>();
  value.decisions.forEach((decision, index) => {
    const { schema: _schema, decisionId: _decisionId, sequence: _sequence, ...payload } = decision;
    if (decision.schema !== "ppt-factory/preference-recommendation-decision/v1" || decision.sequence !== index + 1
      || decision.decisionId !== `preference_decision_${digest(payload).slice(0, 20)}` || keys.has(decision.decisionKey)) {
      throw new PreferenceLearningError(`Persisted preference decision ${index + 1} is invalid`, "CONFLICT");
    }
    keys.add(decision.decisionKey);
  });
  return structuredClone(value);
}

export function appendPreferenceDecision(
  journalValue: PreferenceRecommendationDecisionJournal | undefined,
  proposal: PreferenceRecommendationProposal,
  input: { decision: "accept" | "reject"; decisionKey: string; explicitOptIn?: boolean }
) {
  const body = decisionPayload(proposal, input);
  const journal = normalizeDecisionJournal(journalValue, proposal.scope);
  const existing = journal.decisions.find((item) => item.decisionKey === input.decisionKey);
  if (existing) {
    const { schema: _schema, decisionId: _decisionId, sequence: _sequence, ...storedPayload } = existing;
    if (digest(storedPayload) !== digest(body)) {
      throw new PreferenceLearningError(`Decision key already belongs to another canonical payload: ${input.decisionKey}`, "CONFLICT");
    }
    return { journal, decision: existing, appended: false };
  }
  const decision = {
    schema: "ppt-factory/preference-recommendation-decision/v1" as const,
    decisionId: `preference_decision_${digest(body).slice(0, 20)}`,
    sequence: journal.decisions.length + 1,
    ...body
  };
  return { journal: { ...journal, decisions: [...journal.decisions, decision] }, decision, appended: true };
}

export function recommendFromEditHistory(
  scope: PreferenceScope,
  inputs: StyleEditInput[],
  options: {
    preferenceJournal?: PreferenceEventJournal;
    trustedArtifacts?: TrustedPreferenceLearningArtifacts;
    existingJournal?: StyleEditJournal;
  } = {}
) {
  const merged = mergeStyleEditJournal(
    options.existingJournal, scope, inputs, options.preferenceJournal,
    options.trustedArtifacts as TrustedPreferenceLearningArtifacts
  );
  const journal = merged.journal;
  const profile = learnPreferenceProfile(journal);
  const proposal = createPreferenceProposal(profile);
  return { journal, profile, proposal, appended: merged.appended, existing: merged.existing };
}
