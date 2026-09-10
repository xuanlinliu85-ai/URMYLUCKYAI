export type PreferenceArtifactKind = "events-snapshot" | "learning-snapshot" | "decision-snapshot";
export const LEGACY_PREFERENCE_EVENT_ARTIFACTS: { readonly journal: "preference-events"; readonly profile: "preference-profile" };
export function scopedPreferenceArtifactName(userKey: string, kind: PreferenceArtifactKind): string;
