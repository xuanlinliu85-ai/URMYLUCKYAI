import { LEGACY_PREFERENCE_EVENT_ARTIFACTS } from "@/lib/preference-artifacts.mjs";
import {
  aggregatePreferenceProfile, emptyPreferenceJournal, migrateLegacyPreferenceJournal,
  preferenceEventSnapshotName, type PreferenceEventJournal, type PreferenceScope
} from "@/lib/preference-events";
import { readJson } from "@/storage/local-store";
import { eventSnapshot, readEventSnapshot, writeEventSnapshot } from "@/storage/preference-store";

export async function loadPreferenceEventState(projectId: string, userKey: string, options: { persistMigration?: boolean } = {}) {
  const name = preferenceEventSnapshotName(userKey);
  const existing = await readEventSnapshot(projectId, userKey, name);
  if (existing) return { snapshot: existing, migrated: false, name, virtual: false };
  const scope: PreferenceScope = { kind: "local-project-user-placeholder", projectId, userKey };
  let legacy: PreferenceEventJournal | undefined;
  try { legacy = await readJson<PreferenceEventJournal>(projectId, "analysis", LEGACY_PREFERENCE_EVENT_ARTIFACTS.journal); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  if (legacy && legacy.scope?.kind === scope.kind && legacy.scope.projectId === projectId && legacy.scope.userKey === userKey) {
    const normalized = migrateLegacyPreferenceJournal(legacy, scope);
    const migrated = eventSnapshot(scope, 1, normalized.journal, normalized.profile);
    if (options.persistMigration !== false) await writeEventSnapshot(projectId, name, 0, migrated);
    return { snapshot: migrated, migrated: options.persistMigration !== false, migrationPending: options.persistMigration === false, name, virtual: options.persistMigration === false };
  }
  const journal = emptyPreferenceJournal(scope);
  return { snapshot: eventSnapshot(scope, 1, journal, aggregatePreferenceProfile(journal)), migrated: false, name, virtual: true };
}
