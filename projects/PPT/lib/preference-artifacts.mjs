export const LEGACY_PREFERENCE_EVENT_ARTIFACTS = {
  journal: "preference-events",
  profile: "preference-profile"
};

export function scopedPreferenceArtifactName(userKey, kind) {
  if (!/^[a-zA-Z0-9_-]+$/.test(userKey ?? "")) throw new Error("Invalid preference artifact userKey");
  if (!["events-snapshot", "learning-snapshot", "decision-snapshot"].includes(kind)) throw new Error("Invalid preference artifact kind");
  return `preference-${userKey}-${kind}`;
}
