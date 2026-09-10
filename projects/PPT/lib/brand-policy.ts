import { createHash } from "node:crypto";

export const BRAND_POLICY_SCHEMA = "ppt-factory/brand-policy/v1" as const;
export const BRAND_RULE_KINDS = ["font", "color", "logo_asset_id", "asset_id", "chart_pack_id", "lock"] as const;
export const BRAND_LOCK_DIMENSIONS = ["typography", "layout", "visualTone"] as const;

export type BrandRuleKind = typeof BRAND_RULE_KINDS[number];
export type BrandRuleEffect = "allowed" | "required";
export type BrandRuleSeverity = "warning" | "blocking";

export type BrandRule = {
  id: string;
  kind: BrandRuleKind;
  effect: BrandRuleEffect;
  severity: BrandRuleSeverity;
  values: string[];
  description?: string;
};

export type BrandPolicyExemption = {
  exemptionId: string;
  ruleIds: string[];
  deckVersionIds: string[];
  auditReason: string;
  authorizedBy: string;
  authorizedAt: string;
  expiresAt?: string;
};

export type BrandPolicyExemptionDraft = Omit<BrandPolicyExemption, "authorizedBy" | "authorizedAt">;

export type BrandPolicyVersion = {
  schema: typeof BRAND_POLICY_SCHEMA;
  tenantId: string;
  teamId: string;
  policyId: string;
  version: string;
  name: string;
  contentHash: string;
  rules: BrandRule[];
  exemptions: BrandPolicyExemption[];
  provenance: {
    createdBy: string;
    createdAt: string;
    sourceProjectId?: string;
    parentVersion: string | null;
    parentContentHash: string | null;
  };
};

export type BrandPolicyDraft = {
  policyId: string;
  version: string;
  name: string;
  rules: BrandRule[];
  exemptions?: BrandPolicyExemptionDraft[];
  sourceProjectId?: string;
};

export class BrandPolicyError extends Error {
  readonly code: "INVALID" | "CONFLICT";

  constructor(message: string, code: "INVALID" | "CONFLICT" = "INVALID") {
    super(message);
    this.code = code;
  }
}

const ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const ARTIFACT_ID_PATTERN = /^[a-zA-Z0-9_\-\u3400-\u9fff]+$/;
const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const COLOR_PATTERN = /^#[0-9A-F]{6}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertOnlyKeys(value: Record<string, unknown>, keys: string[], label: string) {
  const allowed = new Set(keys);
  if (Object.keys(value).some((key) => !allowed.has(key))) throw new BrandPolicyError(`${label} contains unsupported fields`);
}

function assertScopedId(value: unknown, label: string) {
  if (typeof value !== "string" || !ID_PATTERN.test(value) || value.length > 80) throw new BrandPolicyError(`${label} is invalid`);
}

function assertArtifactId(value: unknown, label: string) {
  if (typeof value !== "string" || !ARTIFACT_ID_PATTERN.test(value) || value.length > 120) throw new BrandPolicyError(`${label} is invalid`);
}

function assertTimestamp(value: unknown, label: string) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)
    || !Number.isFinite(Date.parse(value))) throw new BrandPolicyError(`${label} must be an RFC3339 UTC timestamp`);
}

function assertNonEmptyText(value: unknown, label: string, maximum = 500) {
  if (typeof value !== "string" || !value.normalize("NFKC").trim() || value.length > maximum) throw new BrandPolicyError(`${label} is required`);
}

export function canonicalizeBrandValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeBrandValue);
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([key, item]) => [key, canonicalizeBrandValue(item)]));
  }
  return value;
}

export function brandArtifactHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(canonicalizeBrandValue(value))).digest("hex");
}

export function brandPolicyDigest(policy: Omit<BrandPolicyVersion, "contentHash"> | BrandPolicyVersion) {
  const { contentHash: _contentHash, ...payload } = policy as BrandPolicyVersion;
  return brandArtifactHash(payload);
}

function normalizeRuleValue(kind: BrandRuleKind, value: string) {
  const normalized = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (kind === "color") return normalized.toUpperCase();
  return normalized;
}

function normalizeRule(rule: BrandRule): BrandRule {
  return {
    id: rule.id,
    kind: rule.kind,
    effect: rule.effect,
    severity: rule.severity,
    values: [...new Set(rule.values.map((value) => normalizeRuleValue(rule.kind, value)))].sort((a, b) => a.localeCompare(b, "en")),
    ...(rule.description ? { description: rule.description.normalize("NFKC").trim().replace(/\s+/g, " ") } : {})
  };
}

function normalizeExemption(exemption: BrandPolicyExemptionDraft, authorizedBy: string, authorizedAt: string, existing?: BrandPolicyExemption): BrandPolicyExemption {
  return {
    exemptionId: exemption.exemptionId,
    ruleIds: [...new Set(exemption.ruleIds)].sort((a, b) => a.localeCompare(b, "en")),
    deckVersionIds: [...new Set(exemption.deckVersionIds)].sort((a, b) => a.localeCompare(b, "en")),
    auditReason: exemption.auditReason.normalize("NFKC").trim().replace(/\s+/g, " "),
    authorizedBy: existing?.authorizedBy ?? authorizedBy,
    authorizedAt: existing?.authorizedAt ?? authorizedAt,
    ...(exemption.expiresAt ? { expiresAt: exemption.expiresAt } : {})
  };
}

export function createBrandPolicyVersion(input: {
  tenantId: string;
  teamId: string;
  createdBy: string;
  createdAt: string;
  parentVersion: string | null;
  parentContentHash: string | null;
  exemptionAuthorizedBy: string;
  exemptionAuthorizedAt: string;
  existingExemptions?: BrandPolicyExemption[];
  draft: BrandPolicyDraft;
}): BrandPolicyVersion {
  validateBrandPolicyDraft(input.draft);
  assertScopedId(input.exemptionAuthorizedBy, "Brand Policy exemption authorizer");
  assertTimestamp(input.exemptionAuthorizedAt, "Brand Policy exemption authorization time");
  const base = {
    schema: BRAND_POLICY_SCHEMA,
    tenantId: input.tenantId,
    teamId: input.teamId,
    policyId: input.draft.policyId,
    version: input.draft.version,
    name: input.draft.name.normalize("NFKC").trim().replace(/\s+/g, " "),
    rules: input.draft.rules.map(normalizeRule).sort((a, b) => a.id.localeCompare(b.id, "en")),
    exemptions: (input.draft.exemptions ?? []).map((exemption) => normalizeExemption(exemption, input.exemptionAuthorizedBy,
      input.exemptionAuthorizedAt, input.existingExemptions?.find((item) => item.exemptionId === exemption.exemptionId)))
      .sort((a, b) => a.exemptionId.localeCompare(b.exemptionId, "en")),
    provenance: {
      createdBy: input.createdBy,
      createdAt: input.createdAt,
      ...(input.draft.sourceProjectId ? { sourceProjectId: input.draft.sourceProjectId } : {}),
      parentVersion: input.parentVersion,
      parentContentHash: input.parentContentHash
    }
  } satisfies Omit<BrandPolicyVersion, "contentHash">;
  const policy = { ...base, contentHash: brandPolicyDigest(base) };
  return validateBrandPolicyVersion(policy);
}

export function validateBrandPolicyDraft(value: unknown): BrandPolicyDraft {
  if (!isRecord(value)) throw new BrandPolicyError("Brand Policy draft must be an object");
  assertOnlyKeys(value, ["policyId", "version", "name", "rules", "exemptions", "sourceProjectId"], "Brand Policy draft");
  assertArtifactId(value.policyId, "Brand Policy policyId");
  if (typeof value.version !== "string" || !VERSION_PATTERN.test(value.version)) throw new BrandPolicyError("Brand Policy version is invalid");
  assertNonEmptyText(value.name, "Brand Policy name", 200);
  if (value.sourceProjectId !== undefined) assertScopedId(value.sourceProjectId, "Brand Policy sourceProjectId");
  if (!Array.isArray(value.rules) || value.rules.length === 0 || value.rules.length > 200) throw new BrandPolicyError("Brand Policy requires 1 to 200 rules");
  const ruleIds = new Set<string>();
  for (const [index, candidate] of value.rules.entries()) {
    if (!isRecord(candidate)) throw new BrandPolicyError(`Brand Policy rule ${index + 1} must be an object`);
    assertOnlyKeys(candidate, ["id", "kind", "effect", "severity", "values", "description"], "Brand Policy rule");
    assertArtifactId(candidate.id, "Brand Policy rule id");
    if (ruleIds.has(candidate.id as string)) throw new BrandPolicyError(`Duplicate Brand Policy rule id: ${candidate.id}`);
    ruleIds.add(candidate.id as string);
    if (!(BRAND_RULE_KINDS as readonly unknown[]).includes(candidate.kind)) throw new BrandPolicyError(`Brand Policy rule ${candidate.id} kind is invalid`);
    if (candidate.effect !== "allowed" && candidate.effect !== "required") throw new BrandPolicyError(`Brand Policy rule ${candidate.id} effect is invalid`);
    if (candidate.severity !== "warning" && candidate.severity !== "blocking") throw new BrandPolicyError(`Brand Policy rule ${candidate.id} severity is invalid`);
    if (!Array.isArray(candidate.values) || candidate.values.length === 0 || candidate.values.length > 200
      || candidate.values.some((item) => typeof item !== "string" || !item.normalize("NFKC").trim() || item.length > 200)) {
      throw new BrandPolicyError(`Brand Policy rule ${candidate.id} values are invalid`);
    }
    if (new Set(candidate.values).size !== candidate.values.length) throw new BrandPolicyError(`Brand Policy rule ${candidate.id} contains duplicate values`);
    if (candidate.kind === "lock" && (candidate.effect !== "required"
      || candidate.values.some((item) => !(BRAND_LOCK_DIMENSIONS as readonly unknown[]).includes(item)))) {
      throw new BrandPolicyError(`Brand Policy lock rule ${candidate.id} must require typography, layout or visualTone`);
    }
    if (candidate.kind === "color" && candidate.values.some((item) => typeof item !== "string" || !COLOR_PATTERN.test(item.toUpperCase()))) {
      throw new BrandPolicyError(`Brand Policy color rule ${candidate.id} must use #RRGGBB values`);
    }
    if (candidate.description !== undefined) assertNonEmptyText(candidate.description, `Brand Policy rule ${candidate.id} description`, 500);
  }
  const exemptions = value.exemptions ?? [];
  if (!Array.isArray(exemptions) || exemptions.length > 200) throw new BrandPolicyError("Brand Policy exemptions are invalid");
  const exemptionIds = new Set<string>();
  for (const [index, candidate] of exemptions.entries()) {
    if (!isRecord(candidate)) throw new BrandPolicyError(`Brand Policy exemption ${index + 1} must be an object`);
    assertOnlyKeys(candidate, ["exemptionId", "ruleIds", "deckVersionIds", "auditReason", "expiresAt"], "Brand Policy exemption draft");
    assertArtifactId(candidate.exemptionId, "Brand Policy exemption id");
    if (exemptionIds.has(candidate.exemptionId as string)) throw new BrandPolicyError(`Duplicate Brand Policy exemption id: ${candidate.exemptionId}`);
    exemptionIds.add(candidate.exemptionId as string);
    if (!Array.isArray(candidate.ruleIds) || candidate.ruleIds.length === 0 || candidate.ruleIds.length > 200
      || candidate.ruleIds.some((id) => typeof id !== "string" || !ruleIds.has(id))) throw new BrandPolicyError(`Brand Policy exemption ${candidate.exemptionId} references an unknown rule`);
    if (new Set(candidate.ruleIds).size !== candidate.ruleIds.length) throw new BrandPolicyError(`Brand Policy exemption ${candidate.exemptionId} contains duplicate rule ids`);
    if (!Array.isArray(candidate.deckVersionIds) || candidate.deckVersionIds.length === 0 || candidate.deckVersionIds.length > 200) {
      throw new BrandPolicyError(`Brand Policy exemption ${candidate.exemptionId} must be deck-version scoped`);
    }
    candidate.deckVersionIds.forEach((id) => assertArtifactId(id, `Brand Policy exemption ${candidate.exemptionId} deckVersionId`));
    if (new Set(candidate.deckVersionIds).size !== candidate.deckVersionIds.length) throw new BrandPolicyError(`Brand Policy exemption ${candidate.exemptionId} contains duplicate deck version ids`);
    assertNonEmptyText(candidate.auditReason, `Brand Policy exemption ${candidate.exemptionId} auditReason`, 1000);
    if (candidate.expiresAt !== undefined) assertTimestamp(candidate.expiresAt, `Brand Policy exemption ${candidate.exemptionId} expiresAt`);
  }
  return structuredClone(value) as BrandPolicyDraft;
}

export function validateBrandPolicyVersion(value: BrandPolicyVersion): BrandPolicyVersion {
  if (!isRecord(value) || value.schema !== BRAND_POLICY_SCHEMA || !Array.isArray(value.rules) || !Array.isArray(value.exemptions)) {
    throw new BrandPolicyError("Unsupported Brand Policy schema");
  }
  assertOnlyKeys(value as unknown as Record<string, unknown>, ["schema", "tenantId", "teamId", "policyId", "version", "name", "contentHash", "rules", "exemptions", "provenance"], "Brand Policy");
  assertScopedId(value.tenantId, "tenantId");
  assertScopedId(value.teamId, "teamId");
  assertArtifactId(value.policyId, "policyId");
  if (typeof value.version !== "string" || !VERSION_PATTERN.test(value.version)) throw new BrandPolicyError("Brand Policy version is invalid");
  assertNonEmptyText(value.name, "Brand Policy name", 200);
  if (!HASH_PATTERN.test(value.contentHash)) throw new BrandPolicyError("Brand Policy content hash is invalid");
  if (!isRecord(value.provenance)) throw new BrandPolicyError("Brand Policy provenance is required");
  assertOnlyKeys(value.provenance as unknown as Record<string, unknown>, ["createdBy", "createdAt", "sourceProjectId", "parentVersion", "parentContentHash"], "Brand Policy provenance");
  assertScopedId(value.provenance.createdBy, "Brand Policy createdBy");
  assertTimestamp(value.provenance.createdAt, "Brand Policy createdAt");
  if (value.provenance.sourceProjectId !== undefined) assertScopedId(value.provenance.sourceProjectId, "Brand Policy sourceProjectId");
  if ((value.provenance.parentVersion === null) !== (value.provenance.parentContentHash === null)) throw new BrandPolicyError("Brand Policy parent version and hash must both be null or both be present");
  if (value.provenance.parentVersion !== null && !VERSION_PATTERN.test(value.provenance.parentVersion)) throw new BrandPolicyError("Brand Policy parent version is invalid");
  if (value.provenance.parentContentHash !== null && !HASH_PATTERN.test(value.provenance.parentContentHash)) throw new BrandPolicyError("Brand Policy parent hash is invalid");
  if (value.rules.length === 0) throw new BrandPolicyError("Brand Policy requires at least one rule");
  const ruleIds = new Set<string>();
  for (const rule of value.rules) {
    if (!isRecord(rule)) throw new BrandPolicyError("Brand Policy rule is invalid");
    assertOnlyKeys(rule as unknown as Record<string, unknown>, ["id", "kind", "effect", "severity", "values", "description"], "Brand Policy rule");
    assertArtifactId(rule.id, "Brand Policy rule id");
    if (ruleIds.has(rule.id)) throw new BrandPolicyError(`Duplicate Brand Policy rule id: ${rule.id}`);
    ruleIds.add(rule.id);
    if (!(BRAND_RULE_KINDS as readonly string[]).includes(rule.kind)) throw new BrandPolicyError(`Brand Policy rule ${rule.id} kind is invalid`);
    if (rule.effect !== "allowed" && rule.effect !== "required") throw new BrandPolicyError(`Brand Policy rule ${rule.id} effect is invalid`);
    if (rule.severity !== "warning" && rule.severity !== "blocking") throw new BrandPolicyError(`Brand Policy rule ${rule.id} severity is invalid`);
    if (!Array.isArray(rule.values) || rule.values.length === 0 || rule.values.some((item) => typeof item !== "string" || !item.trim())) {
      throw new BrandPolicyError(`Brand Policy rule ${rule.id} values are required`);
    }
    if (rule.values.length > 200 || rule.values.some((item) => item.length > 200)) throw new BrandPolicyError(`Brand Policy rule ${rule.id} values exceed the bounded contract`);
    if (new Set(rule.values).size !== rule.values.length) throw new BrandPolicyError(`Brand Policy rule ${rule.id} contains duplicate values`);
    if (rule.kind === "lock" && (rule.effect !== "required" || rule.values.some((item) => !(BRAND_LOCK_DIMENSIONS as readonly string[]).includes(item)))) {
      throw new BrandPolicyError(`Brand Policy lock rule ${rule.id} must require typography, layout or visualTone`);
    }
    if (rule.kind === "color" && rule.values.some((item) => !COLOR_PATTERN.test(item))) throw new BrandPolicyError(`Brand Policy color rule ${rule.id} must use #RRGGBB values`);
    if (rule.description !== undefined) assertNonEmptyText(rule.description, `Brand Policy rule ${rule.id} description`, 500);
  }
  const exemptionIds = new Set<string>();
  for (const exemption of value.exemptions) {
    if (!isRecord(exemption)) throw new BrandPolicyError("Brand Policy exemption is invalid");
    assertOnlyKeys(exemption as unknown as Record<string, unknown>, ["exemptionId", "ruleIds", "deckVersionIds", "auditReason", "authorizedBy", "authorizedAt", "expiresAt"], "Brand Policy exemption");
    assertArtifactId(exemption.exemptionId, "Brand Policy exemption id");
    if (exemptionIds.has(exemption.exemptionId)) throw new BrandPolicyError(`Duplicate Brand Policy exemption id: ${exemption.exemptionId}`);
    exemptionIds.add(exemption.exemptionId);
    if (!Array.isArray(exemption.ruleIds) || exemption.ruleIds.length === 0 || exemption.ruleIds.some((id) => !ruleIds.has(id))) {
      throw new BrandPolicyError(`Brand Policy exemption ${exemption.exemptionId} references an unknown rule`);
    }
    if (!Array.isArray(exemption.deckVersionIds) || exemption.deckVersionIds.length === 0) throw new BrandPolicyError(`Brand Policy exemption ${exemption.exemptionId} must be deck-version scoped`);
    exemption.deckVersionIds.forEach((id) => assertArtifactId(id, `Brand Policy exemption ${exemption.exemptionId} deckVersionId`));
    assertNonEmptyText(exemption.auditReason, `Brand Policy exemption ${exemption.exemptionId} auditReason`, 1000);
    assertScopedId(exemption.authorizedBy, `Brand Policy exemption ${exemption.exemptionId} authorizedBy`);
    assertTimestamp(exemption.authorizedAt, `Brand Policy exemption ${exemption.exemptionId} authorizedAt`);
    if (exemption.expiresAt !== undefined) assertTimestamp(exemption.expiresAt, `Brand Policy exemption ${exemption.exemptionId} expiresAt`);
    if (exemption.expiresAt !== undefined && Date.parse(exemption.expiresAt) <= Date.parse(exemption.authorizedAt)) {
      throw new BrandPolicyError(`Brand Policy exemption ${exemption.exemptionId} must expire after authorization`);
    }
  }
  if (brandPolicyDigest(value) !== value.contentHash) throw new BrandPolicyError("Brand Policy content hash mismatch");
  return structuredClone(value);
}
