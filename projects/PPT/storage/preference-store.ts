import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { LearnedPreferenceProfile, PreferenceRecommendationDecisionJournal, PreferenceRecommendationProposal, StyleEditJournal } from "@/lib/preference-learning";
import type { PreferenceEventJournal, PreferenceProfile, PreferenceScope } from "@/lib/preference-events";
import { projectPath } from "./local-store.ts";

export type PreferenceEventSnapshot = {
  schema: "ppt-factory/preference-event-snapshot/v1";
  revision: number;
  scope: PreferenceScope;
  journal: PreferenceEventJournal;
  profile: PreferenceProfile;
  snapshotHash: string;
};

export type PreferenceLearningSnapshot = {
  schema: "ppt-factory/preference-learning-snapshot/v1";
  revision: number;
  scope: PreferenceScope;
  journal: StyleEditJournal;
  profile: LearnedPreferenceProfile;
  proposal: PreferenceRecommendationProposal;
  snapshotHash: string;
};

export type PreferenceDecisionSnapshot = {
  schema: "ppt-factory/preference-decision-snapshot/v1";
  revision: number;
  scope: PreferenceScope;
  journal: PreferenceRecommendationDecisionJournal;
  snapshotHash: string;
};

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b, "en")).map(([key, item]) => [key, canonical(item)]));
  return value;
}

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");

function withHash<T extends { snapshotHash?: string }>(value: Omit<T, "snapshotHash">): T {
  return { ...value, snapshotHash: digest(value) } as T;
}

function assertSnapshot<T extends { revision: number; scope: PreferenceScope; snapshotHash: string }>(value: T, projectId: string, userKey: string) {
  const { snapshotHash, ...body } = value;
  if (!Number.isInteger(value.revision) || value.revision < 1 || value.scope.projectId !== projectId || value.scope.userKey !== userKey
    || snapshotHash !== digest(body)) throw new Error("Preference snapshot is invalid or has been modified");
  return value;
}

async function optionalJson<T>(projectId: string, name: string) {
  try { return JSON.parse(await readFile(projectPath(projectId, "analysis", `${name}.json`), "utf8")) as T; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
}

async function atomicJson(projectId: string, name: string, value: unknown) {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error("Invalid preference artifact name");
  const target = projectPath(projectId, "analysis", `${name}.json`);
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, JSON.stringify(value, null, 2), { encoding: "utf8", flag: "wx" });
    await rename(temporary, target);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

export const eventSnapshot = (scope: PreferenceScope, revision: number, journal: PreferenceEventJournal, profile: PreferenceProfile) =>
  withHash<PreferenceEventSnapshot>({ schema: "ppt-factory/preference-event-snapshot/v1", revision, scope: structuredClone(scope), journal, profile });
export const learningSnapshot = (scope: PreferenceScope, revision: number, journal: StyleEditJournal, profile: LearnedPreferenceProfile, proposal: PreferenceRecommendationProposal) =>
  withHash<PreferenceLearningSnapshot>({ schema: "ppt-factory/preference-learning-snapshot/v1", revision, scope: structuredClone(scope), journal, profile, proposal });
export const decisionSnapshot = (scope: PreferenceScope, revision: number, journal: PreferenceRecommendationDecisionJournal) =>
  withHash<PreferenceDecisionSnapshot>({ schema: "ppt-factory/preference-decision-snapshot/v1", revision, scope: structuredClone(scope), journal });

export async function readEventSnapshot(projectId: string, userKey: string, name: string) {
  const value = await optionalJson<PreferenceEventSnapshot>(projectId, name);
  if (value && value.schema !== "ppt-factory/preference-event-snapshot/v1") throw new Error("Preference snapshot is invalid or has been modified");
  return value ? assertSnapshot(value, projectId, userKey) : undefined;
}
export async function readLearningSnapshot(projectId: string, userKey: string, name: string) {
  const value = await optionalJson<PreferenceLearningSnapshot>(projectId, name);
  if (value && value.schema !== "ppt-factory/preference-learning-snapshot/v1") throw new Error("Preference snapshot is invalid or has been modified");
  return value ? assertSnapshot(value, projectId, userKey) : undefined;
}
export async function readDecisionSnapshot(projectId: string, userKey: string, name: string) {
  const value = await optionalJson<PreferenceDecisionSnapshot>(projectId, name);
  if (value && value.schema !== "ppt-factory/preference-decision-snapshot/v1") throw new Error("Preference snapshot is invalid or has been modified");
  return value ? assertSnapshot(value, projectId, userKey) : undefined;
}

async function casWrite<T extends { revision: number }>(projectId: string, name: string, expectedRevision: number, snapshot: T) {
  const current = await optionalJson<{ revision?: number }>(projectId, name);
  const actualRevision = current?.revision ?? 0;
  if (actualRevision !== expectedRevision || snapshot.revision !== expectedRevision + 1) throw new Error("Preference snapshot revision conflict");
  await atomicJson(projectId, name, snapshot);
}

export const writeEventSnapshot = (projectId: string, name: string, expectedRevision: number, snapshot: PreferenceEventSnapshot) => casWrite(projectId, name, expectedRevision, snapshot);
export const writeLearningSnapshot = (projectId: string, name: string, expectedRevision: number, snapshot: PreferenceLearningSnapshot) => casWrite(projectId, name, expectedRevision, snapshot);
export const writeDecisionSnapshot = (projectId: string, name: string, expectedRevision: number, snapshot: PreferenceDecisionSnapshot) => casWrite(projectId, name, expectedRevision, snapshot);
