import { createHash } from "node:crypto";
import { scopedPreferenceArtifactName } from "./preference-artifacts.mjs";
import type { GoldenSlideLibrary } from "@/lib/types";
import type { StylePackLibrary } from "@/lib/style-packs";

export const PREFERENCE_ACTION_WEIGHTS = {
  favorite: 3,
  use: 1,
  reject: -4
} as const;

export type PreferenceAction = keyof typeof PREFERENCE_ACTION_WEIGHTS;
export type PreferenceArtifactType = "golden_slide" | "style_pack";

export type PreferenceScope = {
  kind: "local-project-user-placeholder";
  projectId: string;
  userKey: string;
};

export type PreferenceSubject = {
  artifactType: PreferenceArtifactType;
  id: string;
  version: string;
};

export type PreferenceEvent = {
  schema: "ppt-factory/preference-event/v1";
  eventId: string;
  sequence: number;
  idempotencyKey: string;
  action: PreferenceAction;
  subject: PreferenceSubject;
};

export type PreferenceEventJournal = {
  schema: "ppt-factory/preference-event-journal/v1";
  scope: PreferenceScope;
  events: PreferenceEvent[];
};

export type PreferenceSubjectAggregate = {
  subject: PreferenceSubject;
  searchDocumentId: string;
  counts: Record<PreferenceAction, number>;
  weightedTotal: number;
  signal: number;
  latestSequence: number;
  evidence: string[];
};

export type PreferenceProfile = {
  schema: "ppt-factory/preference-profile/v1";
  scope: PreferenceScope;
  totalEvents: number;
  policy: {
    automaticDesignChanges: false;
    semanticSearchRanking: "explicit-opt-in-only";
    weights: typeof PREFERENCE_ACTION_WEIGHTS;
  };
  subjects: PreferenceSubjectAggregate[];
};

export type PreferenceReferenceLibraries = {
  goldenSlides?: GoldenSlideLibrary;
  stylePacks?: StylePackLibrary;
};

export type AppendPreferenceInput = {
  scope: PreferenceScope;
  idempotencyKey: string;
  action: PreferenceAction;
  subject: PreferenceSubject;
};

export class PreferenceEventError extends Error {
  readonly code: "INVALID" | "NOT_FOUND" | "CONFLICT";

  constructor(message: string, code: "INVALID" | "NOT_FOUND" | "CONFLICT") {
    super(message);
    this.code = code;
  }
}

const ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const KEY_PATTERN = /^[a-zA-Z0-9._:-]+$/;
const round = (value: number) => Number(value.toFixed(2));
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

export function validatePreferenceUserKey(userKey: string) {
  if (!ID_PATTERN.test(userKey ?? "")) throw new PreferenceEventError("userKey must contain only letters, numbers, underscore or hyphen", "INVALID");
  return userKey;
}

export const preferenceEventSnapshotName = (userKey: string) => scopedPreferenceArtifactName(validatePreferenceUserKey(userKey), "events-snapshot");

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
  if (scope?.kind !== "local-project-user-placeholder" || !ID_PATTERN.test(scope.projectId ?? "") || !ID_PATTERN.test(scope.userKey ?? "")) {
    throw new PreferenceEventError("A valid local project/user placeholder scope is required", "INVALID");
  }
}

function assertSubject(subject: PreferenceSubject, libraries: PreferenceReferenceLibraries) {
  if (!subject || !["golden_slide", "style_pack"].includes(subject.artifactType)
    || !KEY_PATTERN.test(subject.id ?? "") || !KEY_PATTERN.test(subject.version ?? "")) {
    throw new PreferenceEventError("A valid versioned preference subject is required", "INVALID");
  }
  if (subject.artifactType === "golden_slide") {
    const library = libraries.goldenSlides;
    if (subject.version !== "v1") throw new PreferenceEventError("Golden Slide subjects must reference artifact version v1", "INVALID");
    const candidate = library?.candidates.find((item) => item.id === subject.id);
    if (!candidate || !candidate.eligible || library?.usage.mode !== "learn-style" || !library.usage.retrievalEligible) {
      throw new PreferenceEventError(`Eligible Golden Slide not found: ${subject.id}@${subject.version}`, "NOT_FOUND");
    }
    return;
  }
  if (subject.artifactType === "style_pack") {
    const pack = libraries.stylePacks?.packs.find((item) => item.id === subject.id && item.version === subject.version && item.active);
    if (!pack) throw new PreferenceEventError(`Active Style Pack version not found: ${subject.id}@${subject.version}`, "NOT_FOUND");
    return;
  }
  throw new PreferenceEventError("Unsupported preference subject type", "INVALID");
}

function sameScope(a: PreferenceScope, b: PreferenceScope) {
  return a.kind === b.kind && a.projectId === b.projectId && a.userKey === b.userKey;
}

function eventPayload(input: AppendPreferenceInput) {
  return {
    idempotencyKey: input.idempotencyKey,
    action: input.action,
    subject: input.subject
  };
}

export function emptyPreferenceJournal(scope: PreferenceScope): PreferenceEventJournal {
  assertScope(scope);
  return { schema: "ppt-factory/preference-event-journal/v1", scope: structuredClone(scope), events: [] };
}

export function normalizePreferenceJournal(value: PreferenceEventJournal | undefined, scope: PreferenceScope) {
  assertScope(scope);
  if (!value) return emptyPreferenceJournal(scope);
  if (value.schema !== "ppt-factory/preference-event-journal/v1" || !sameScope(value.scope, scope) || !Array.isArray(value.events)) {
    throw new PreferenceEventError("Preference journal schema or local scope does not match", "INVALID");
  }
  const seenKeys = new Set<string>();
  const seenIds = new Set<string>();
  value.events.forEach((event, index) => {
    const payload = { idempotencyKey: event.idempotencyKey, action: event.action, subject: event.subject };
    const expectedId = `pref_${digest({ scope, ...payload }).slice(0, 20)}`;
    if (event.schema !== "ppt-factory/preference-event/v1" || event.sequence !== index + 1
      || event.eventId !== expectedId || seenKeys.has(event.idempotencyKey) || seenIds.has(event.eventId)
      || !KEY_PATTERN.test(event.idempotencyKey ?? "") || !(event.action in PREFERENCE_ACTION_WEIGHTS)
      || !event.subject || !["golden_slide", "style_pack"].includes(event.subject.artifactType)
      || !KEY_PATTERN.test(event.subject.id ?? "") || !KEY_PATTERN.test(event.subject.version ?? "")) {
      throw new PreferenceEventError(`Preference journal event ${index + 1} is invalid`, "INVALID");
    }
    seenKeys.add(event.idempotencyKey);
    seenIds.add(event.eventId);
  });
  return structuredClone(value);
}

export function appendPreferenceEvent(
  journalValue: PreferenceEventJournal | undefined,
  input: AppendPreferenceInput,
  libraries: PreferenceReferenceLibraries
) {
  assertScope(input.scope);
  if (!KEY_PATTERN.test(input.idempotencyKey ?? "") || input.idempotencyKey.length > 128) {
    throw new PreferenceEventError("A valid idempotency key is required", "INVALID");
  }
  if (!(input.action in PREFERENCE_ACTION_WEIGHTS)) throw new PreferenceEventError("Unsupported preference action", "INVALID");
  assertSubject(input.subject, libraries);
  const journal = normalizePreferenceJournal(journalValue, input.scope);
  const existing = journal.events.find((item) => item.idempotencyKey === input.idempotencyKey);
  const payload = eventPayload(input);
  if (existing) {
    const existingPayload = { idempotencyKey: existing.idempotencyKey, action: existing.action, subject: existing.subject };
    if (digest(existingPayload) !== digest(payload)) {
      throw new PreferenceEventError(`Idempotency key already belongs to another event: ${input.idempotencyKey}`, "CONFLICT");
    }
    return { journal, event: existing, appended: false, profile: aggregatePreferenceProfile(journal) };
  }
  const event: PreferenceEvent = {
    schema: "ppt-factory/preference-event/v1",
    eventId: `pref_${digest({ scope: input.scope, ...payload }).slice(0, 20)}`,
    sequence: journal.events.length + 1,
    ...structuredClone(payload)
  };
  const next = { ...journal, events: [...journal.events, event] };
  return { journal: next, event, appended: true, profile: aggregatePreferenceProfile(next) };
}

export function migrateLegacyPreferenceJournal(value: PreferenceEventJournal, scope: PreferenceScope) {
  const journal = normalizePreferenceJournal(value, scope);
  return { journal, profile: aggregatePreferenceProfile(journal) };
}

function searchDocumentId(subject: PreferenceSubject) {
  return subject.artifactType === "golden_slide"
    ? `golden:${subject.id}`
    : `style-pack:${subject.id}@${subject.version}`;
}

export function aggregatePreferenceProfile(journal: PreferenceEventJournal): PreferenceProfile {
  const grouped = new Map<string, PreferenceEvent[]>();
  for (const event of journal.events) {
    const key = `${event.subject.artifactType}:${event.subject.id}@${event.subject.version}`;
    grouped.set(key, [...(grouped.get(key) ?? []), event]);
  }
  const subjects = [...grouped.values()].map((events) => {
    const counts = { favorite: 0, use: 0, reject: 0 };
    for (const event of events) counts[event.action] += 1;
    const weightedTotal = counts.favorite * PREFERENCE_ACTION_WEIGHTS.favorite
      + counts.use * PREFERENCE_ACTION_WEIGHTS.use
      + counts.reject * PREFERENCE_ACTION_WEIGHTS.reject;
    const maximumMagnitude = events.length * Math.max(...Object.values(PREFERENCE_ACTION_WEIGHTS).map(Math.abs));
    const signal = maximumMagnitude ? round(clamp(weightedTotal / maximumMagnitude * 100, -100, 100)) : 0;
    const subject = structuredClone(events[0].subject);
    return {
      subject, searchDocumentId: searchDocumentId(subject), counts, weightedTotal, signal,
      latestSequence: Math.max(...events.map((item) => item.sequence)),
      evidence: [
        `favorite:${counts.favorite}×${PREFERENCE_ACTION_WEIGHTS.favorite}`,
        `use:${counts.use}×${PREFERENCE_ACTION_WEIGHTS.use}`,
        `reject:${counts.reject}×${PREFERENCE_ACTION_WEIGHTS.reject}`,
        `signal:${signal}`
      ]
    };
  }).sort((a, b) => a.searchDocumentId.localeCompare(b.searchDocumentId, "en"));
  return {
    schema: "ppt-factory/preference-profile/v1",
    scope: structuredClone(journal.scope),
    totalEvents: journal.events.length,
    policy: {
      automaticDesignChanges: false,
      semanticSearchRanking: "explicit-opt-in-only",
      weights: { ...PREFERENCE_ACTION_WEIGHTS }
    },
    subjects
  };
}

export function queryPreferenceEvents(journal: PreferenceEventJournal, filter: {
  action?: PreferenceAction;
  artifactType?: PreferenceArtifactType;
  subjectId?: string;
} = {}) {
  return journal.events.filter((event) => (!filter.action || event.action === filter.action)
    && (!filter.artifactType || event.subject.artifactType === filter.artifactType)
    && (!filter.subjectId || event.subject.id === filter.subjectId));
}

export function preferenceRankingSignals(profile?: PreferenceProfile) {
  return Object.fromEntries((profile?.subjects ?? []).map((item) => [item.searchDocumentId, {
    signal: item.signal,
    evidence: [...item.evidence]
  }]));
}
