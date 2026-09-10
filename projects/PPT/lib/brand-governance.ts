import { createHash } from "node:crypto";
import {
  BRAND_LOCK_DIMENSIONS, BrandPolicyError, brandArtifactHash, createBrandPolicyVersion, validateBrandPolicyDraft, validateBrandPolicyVersion,
  type BrandPolicyDraft, type BrandPolicyExemption, type BrandPolicyVersion, type BrandRule, type BrandRuleKind
} from "./brand-policy.ts";
import {
  teamArtifactDigest, TeamLibraryError, TeamStyleLibraryService,
  type TeamArtifactVersion, type TeamLibraryActor
} from "./team-style-library.ts";
import type { AuthoritativeDeckBinding } from "./deck-version-binding.ts";
import type { QaReport, SlidePlan, StyleDna, StyleMixArtifact } from "@/lib/types";

export const BRAND_GOVERNANCE_REPORT_SCHEMA = "ppt-factory/brand-governance-report/v1" as const;
export const BRAND_GOVERNANCE_DECISION_SCHEMA = "ppt-factory/brand-governance-decision/v1" as const;

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const EVIDENCE_NAMES = ["styleDna", "styleMix", "slidePlans", "inspect", "layouts", "fontEvidence", "imageEvidence", "chartPackManifest", "qaReport"] as const;
type EvidenceName = typeof EVIDENCE_NAMES[number];

export type HashBoundEvidence<T = unknown> = {
  expectedHash?: string;
  content?: T;
};

export type BrandGovernanceInput = {
  deckVersionId: string;
  deckBinding: AuthoritativeDeckBinding;
  deckBytes: Uint8Array;
  evidence: {
    styleDna: HashBoundEvidence<StyleDna>;
    styleMix: HashBoundEvidence<StyleMixArtifact>;
    slidePlans: HashBoundEvidence<SlidePlan[]>;
    inspect: HashBoundEvidence<unknown[]>;
    layouts: HashBoundEvidence<unknown[]>;
    fontEvidence: HashBoundEvidence<unknown>;
    imageEvidence: HashBoundEvidence<unknown>;
    chartPackManifest: HashBoundEvidence<unknown>;
    qaReport: HashBoundEvidence<QaReport>;
  };
};

export type GovernanceIntegrityCheck = {
  id: string;
  passed: boolean;
  expected?: string;
  actual?: string;
  message: string;
};

export type GovernanceFinding = {
  findingId: string;
  ruleId: string;
  kind: BrandRuleKind | "qa";
  effect: "allowed" | "required";
  severity: "warning" | "blocking";
  status: "active" | "exempted";
  values: string[];
  evidence: string[];
  exemption?: {
    exemptionId: string;
    auditReason: string;
    authorizedBy: string;
    authorizedAt: string;
    expiresAt?: string;
  };
};

export type BrandGovernanceBinding = {
  policy: {
    policyId: string;
    version: string;
    teamArtifactHash: string;
    contentHash: string;
  };
  deck: {
    versionId: string;
    expectedSha256: string;
    actualSha256: string;
    projectId: string;
    manifestType: "generation" | "update";
    manifestName: string;
    manifestHash: string;
    pptxName: string;
    slides: number;
    evidenceManifestName?: string;
    evidenceManifestHash?: string;
  };
  style: {
    styleDnaExpectedHash?: string;
    styleDnaActualHash?: string;
    styleMixExpectedHash?: string;
    styleMixActualHash?: string;
  };
  evidence: Array<{ name: EvidenceName; expectedHash?: string; actualHash?: string }>;
  artifactSetHash: string;
};

export type BrandGovernanceReport = {
  schema: typeof BRAND_GOVERNANCE_REPORT_SCHEMA;
  tenantId: string;
  teamId: string;
  status: "COMPLIANT" | "COMPLIANT_WITH_WARNINGS" | "VIOLATING" | "INTEGRITY_FAILURE";
  binding: BrandGovernanceBinding;
  integrity: { passed: boolean; checks: GovernanceIntegrityCheck[] };
  observed: {
    fonts: string[];
    colors: string[];
    logoAssetIds: string[];
    assetIds: string[];
    chartPackIds: string[];
    locks: Record<(typeof BRAND_LOCK_DIMENSIONS)[number], boolean | null>;
  };
  findings: GovernanceFinding[];
  summary: { activeBlocking: number; activeWarnings: number; exempted: number; evaluatedRules: number };
  evaluatedAt: string;
  reportHash: string;
};

export type BrandGovernanceDecision = {
  schema: typeof BRAND_GOVERNANCE_DECISION_SCHEMA;
  tenantId: string;
  teamId: string;
  decision: "ALLOW" | "ALLOW_WITH_WARNINGS" | "BLOCKED";
  reasonCodes: string[];
  binding: BrandGovernanceBinding & { reportHash: string };
  decidedAt: string;
  decisionHash: string;
};

export type BrandGovernanceResult = {
  report: BrandGovernanceReport;
  decision: BrandGovernanceDecision;
};

function sha256Bytes(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function compareVersions(left: string, right: string) {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) if (a[index] !== b[index]) return a[index] - b[index];
  return 0;
}

function policyFromArtifact(artifact: TeamArtifactVersion) {
  if (artifact.artifactType !== "brand_policy") throw new TeamLibraryError("Team artifact is not a Brand Policy", "INVALID");
  const policy = validateBrandPolicyVersion(artifact.content as BrandPolicyVersion);
  if (teamArtifactDigest(artifact) !== artifact.contentHash) throw new TeamLibraryError("Brand Policy Team artifact hash mismatch", "INVALID");
  return policy;
}

function makeIntegrityCheck(id: string, expected: string | undefined, actual: string | undefined, label: string): GovernanceIntegrityCheck {
  const passed = Boolean(expected && actual && HASH_PATTERN.test(expected) && expected === actual);
  return { id, passed, ...(expected ? { expected } : {}), ...(actual ? { actual } : {}), message: passed ? `${label} hash verified` : `${label} hash is missing or does not match` };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function layoutSlideNumber(value: unknown) {
  if (!isRecord(value)) return undefined;
  if (Number.isInteger(value.slide)) return Number(value.slide);
  return isRecord(value.slide) && Number.isInteger(value.slide.slide) ? Number(value.slide.slide) : undefined;
}

function evidenceContractChecks(input: BrandGovernanceInput): GovernanceIntegrityCheck[] {
  const content = Object.fromEntries(EVIDENCE_NAMES.map((name) => [name, input.evidence[name].content])) as Record<EvidenceName, unknown>;
  const styleDna = content.styleDna;
  const styleMix = content.styleMix;
  const slidePlans = content.slidePlans;
  const inspect = content.inspect;
  const layouts = content.layouts;
  const fontEvidence = content.fontEvidence;
  const imageEvidence = content.imageEvidence;
  const chartManifest = content.chartPackManifest;
  const qaReport = content.qaReport;
  const plansValid = Array.isArray(slidePlans) && slidePlans.length > 0 && slidePlans.every((item) => isRecord(item)
    && Number.isInteger(item.slideIndex) && Number(item.slideIndex) > 0);
  const inspectValid = Array.isArray(inspect) && inspect.length > 0 && inspect.every((item) => isRecord(item)
    && typeof item.kind === "string" && Number.isInteger(item.slide) && Number(item.slide) > 0);
  const layoutsValid = Array.isArray(layouts) && layouts.length > 0 && layouts.every((item) => Number(layoutSlideNumber(item)) > 0
    && isRecord(item) && Array.isArray(item.elements));
  const fontObjects = isRecord(fontEvidence) && Array.isArray(fontEvidence.objects) ? fontEvidence.objects : undefined;
  const fontValid = Boolean(fontObjects && fontObjects.every((item) => isRecord(item) && Number.isInteger(item.slide)
    && Number(item.slide) > 0 && typeof item.objectName === "string" && item.objectName.length > 0
    && [item.resolvedTypeface, item.appliedTypeface, item.requestedTypeface].some((value) => typeof value === "string" && value.trim())));
  const imageRecords = Array.isArray(imageEvidence) ? imageEvidence : isRecord(imageEvidence) && Array.isArray(imageEvidence.assets) ? imageEvidence.assets : undefined;
  const imageValid = Boolean(imageRecords && imageRecords.every((item) => isRecord(item) && Number.isInteger(item.slide)
    && Number(item.slide) > 0 && typeof item.objectName === "string" && item.objectName.trim()
    && typeof item.assetId === "string" && item.assetId.trim()));
  const charts = isRecord(chartManifest) && Array.isArray(chartManifest.charts) ? chartManifest.charts : undefined;
  const chartValid = Boolean(charts && charts.every((item) => isRecord(item) && Number.isInteger(item.slide)
    && Number(item.slide) > 0 && typeof item.objectName === "string" && item.objectName.trim()
    && typeof item.resolvedId === "string" && item.resolvedId.trim()));
  const qaValid = isRecord(qaReport) && ["PASS", "REVIEW", "FAIL"].includes(String(qaReport.status));
  const styleValid = isRecord(styleDna) && typeof styleDna.styleId === "string" && styleDna.styleId.length > 0
    && isRecord(styleDna.typography) && isRecord(styleDna.colors);
  const mixValid = isRecord(styleMix) && typeof styleMix.finalStyleId === "string" && isRecord(styleMix.locks)
    && Object.values(styleMix.locks).every((value) => typeof value === "boolean");
  const planSlides = plansValid ? uniqueSorted((slidePlans as Record<string, unknown>[]).map((item) => String(item.slideIndex))) : [];
  const inspectSlides = inspectValid ? uniqueSorted((inspect as Record<string, unknown>[]).filter((item) => item.kind === "slide").map((item) => String(item.slide))) : [];
  const layoutSlides = layoutsValid ? uniqueSorted((layouts as unknown[]).map((item) => String(layoutSlideNumber(item)))) : [];
  const expectedSlides = Array.from({ length: input.deckBinding.slides }, (_, index) => String(index + 1));
  const slideCoverage = JSON.stringify(planSlides) === JSON.stringify(expectedSlides)
    && JSON.stringify(inspectSlides) === JSON.stringify(expectedSlides) && JSON.stringify(layoutSlides) === JSON.stringify(expectedSlides);
  const identity = (slide: unknown, objectName: unknown) => `${String(slide)}:${String(objectName)}`;
  const exactUniqueCoverage = (actual: string[], expected: string[]) => actual.length === new Set(actual).size
    && JSON.stringify(uniqueSorted(actual)) === JSON.stringify(uniqueSorted(expected));
  const expectedFonts = layoutsValid ? (layouts as Record<string, unknown>[]).flatMap((layout) => {
    const textElements = (layout.elements as unknown[]).filter((item) => isRecord(item)
      && (typeof item.text === "string" || isRecord(item.resolvedTextStyle))) as Record<string, unknown>[];
    return textElements.map((item, index) => identity(layoutSlideNumber(layout), item.name ?? item.id ?? `text-${index + 1}`));
  }) : [];
  const actualFonts = fontValid ? (fontObjects as Record<string, unknown>[]).map((item) => identity(item.slide, item.objectName)) : [];
  const expectedImages = inspectValid ? (inspect as Record<string, unknown>[]).filter((item) => item.kind === "image")
    .map((item) => identity(item.slide, [item.name, item.id].find((value) => typeof value === "string" && value.trim()))) : [];
  const actualImages = imageValid ? (imageRecords as Record<string, unknown>[]).map((item) => identity(item.slide, item.objectName)) : [];
  const expectedCharts = inspectValid ? (inspect as Record<string, unknown>[]).filter((item) => item.kind === "chart")
    .map((item) => identity(item.slide, [item.name, item.id].find((value) => typeof value === "string" && value.trim()))) : [];
  const actualCharts = chartValid ? (charts as Record<string, unknown>[]).map((item) => identity(item.slide, item.objectName)) : [];
  const crossCoverage = slideCoverage && exactUniqueCoverage(actualFonts, expectedFonts)
    && exactUniqueCoverage(actualImages, expectedImages) && exactUniqueCoverage(actualCharts, expectedCharts);
  return [
    { id: "evidence.styleDna.contract", passed: styleValid, message: "Style DNA must expose identity, typography and colors" },
    { id: "evidence.styleMix.contract", passed: mixValid, message: "Style Mix must expose identity and boolean locks" },
    { id: "evidence.slidePlans.contract", passed: plansValid, message: "Slide Plans must contain bounded indexed records" },
    { id: "evidence.inspect.contract", passed: inspectValid, message: "Inspect evidence must contain typed slide-scoped records" },
    { id: "evidence.layouts.contract", passed: layoutsValid, message: "Layout evidence must contain indexed slides and element arrays" },
    { id: "evidence.fontEvidence.contract", passed: fontValid, message: "Font evidence must identify slide, object and native typeface" },
    { id: "evidence.imageEvidence.contract", passed: imageValid, message: "Image evidence must be an array of asset-identified records" },
    { id: "evidence.chartPackManifest.contract", passed: chartValid, message: "Chart manifest must contain resolved chart-pack identities" },
    { id: "evidence.qaReport.contract", passed: qaValid, message: "QA report must expose PASS, REVIEW or FAIL" },
    { id: "evidence.crossCoverage", passed: crossCoverage, message: "Slide/font/image/chart evidence must cover the authoritative deck" }
  ];
}

function normalizeObserved(kind: BrandRuleKind, value: string) {
  const normalized = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (kind === "font") return normalized.toLocaleLowerCase("en");
  if (kind === "color") return normalized.toUpperCase();
  return normalized;
}

function uniqueSorted(values: Iterable<string>) {
  return [...new Set([...values].filter(Boolean))].sort((a, b) => a.localeCompare(b, "en"));
}

function walk(value: unknown, visitor: (key: string, item: unknown, parent: Record<string, unknown>) => void) {
  if (Array.isArray(value)) {
    value.forEach((item) => walk(item, visitor));
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  for (const [key, item] of Object.entries(record)) {
    visitor(key, item, record);
    walk(item, visitor);
  }
}

function collectFonts(...sources: unknown[]) {
  const values = new Set<string>();
  for (const source of sources) walk(source, (key, item) => {
    if (typeof item === "string" && /(typeface|fontfamily|fontname|requestedtypeface|appliedtypeface|resolvedtypeface)/i.test(key) && item.trim()) values.add(item.normalize("NFKC").trim());
  });
  return uniqueSorted(values);
}

function collectColors(styleColors: unknown, ...layoutSources: unknown[]) {
  const values = new Set<string>();
  walk(styleColors, (_key, item) => {
    if (typeof item === "string" && /^#[0-9a-f]{6}$/i.test(item.trim())) values.add(item.trim().toUpperCase());
  });
  for (const source of layoutSources) walk(source, (key, item) => {
    if (typeof item === "string" && /color/i.test(key) && /^#[0-9a-f]{6}$/i.test(item.trim())) values.add(item.trim().toUpperCase());
  });
  return uniqueSorted(values);
}

function imageRecords(value: unknown) {
  const records: Record<string, unknown>[] = [];
  const source = Array.isArray(value) ? value : value && typeof value === "object" && Array.isArray((value as Record<string, unknown>).assets)
    ? (value as Record<string, unknown>).assets as unknown[] : [];
  for (const item of source) if (item && typeof item === "object") records.push(item as Record<string, unknown>);
  return records;
}

function collectAssets(inspect: unknown, imageEvidence: unknown) {
  const inspectRecords = Array.isArray(inspect) ? inspect.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object") : [];
  const records = [
    ...inspectRecords.filter((item) => item.kind === "image"),
    ...imageRecords(imageEvidence)
  ];
  const assets = new Set<string>();
  const logos = new Set<string>();
  for (const record of records) {
    const value = [record.assetId, record.objectName, record.name, record.id].find((item) => typeof item === "string" && item.trim()) as string | undefined;
    if (!value) continue;
    const normalized = value.normalize("NFKC").trim();
    assets.add(normalized);
    const role = String(record.role ?? record.assetRole ?? "");
    const name = String(record.objectName ?? record.name ?? "");
    if (/logo/i.test(role) || /logo/i.test(name)) logos.add(normalized);
  }
  return { assetIds: uniqueSorted(assets), logoAssetIds: uniqueSorted(logos) };
}

function collectChartPacks(styleDna: unknown, slidePlans: unknown, chartPackManifest: unknown) {
  const values = new Set<string>();
  if (styleDna && typeof styleDna === "object") {
    const charts = (styleDna as Record<string, unknown>).charts;
    if (charts && typeof charts === "object" && typeof (charts as Record<string, unknown>).chartPackId === "string") values.add(String((charts as Record<string, unknown>).chartPackId));
  }
  if (Array.isArray(slidePlans)) slidePlans.forEach((plan) => {
    if (plan && typeof plan === "object" && typeof (plan as Record<string, unknown>).chartPackRef === "string") values.add(String((plan as Record<string, unknown>).chartPackRef));
  });
  if (chartPackManifest && typeof chartPackManifest === "object") {
    const charts = (chartPackManifest as Record<string, unknown>).charts;
    if (Array.isArray(charts)) charts.forEach((chart) => {
      if (chart && typeof chart === "object" && typeof (chart as Record<string, unknown>).resolvedId === "string") values.add(String((chart as Record<string, unknown>).resolvedId));
    });
  }
  return uniqueSorted(values);
}

function collectLocks(styleMix: unknown) {
  const output = Object.fromEntries(BRAND_LOCK_DIMENSIONS.map((dimension) => [dimension, null])) as Record<(typeof BRAND_LOCK_DIMENSIONS)[number], boolean | null>;
  if (!styleMix || typeof styleMix !== "object") return output;
  const locks = (styleMix as Record<string, unknown>).locks;
  if (!locks || typeof locks !== "object") return output;
  for (const dimension of BRAND_LOCK_DIMENSIONS) {
    const value = (locks as Record<string, unknown>)[dimension];
    if (typeof value === "boolean") output[dimension] = value;
  }
  return output;
}

function activeExemption(exemptions: BrandPolicyExemption[], ruleId: string, deckVersionId: string, evaluatedAt: string) {
  return exemptions.find((exemption) => exemption.ruleIds.includes(ruleId)
    && exemption.deckVersionIds.includes(deckVersionId)
    && Date.parse(exemption.authorizedAt) <= Date.parse(evaluatedAt)
    && (!exemption.expiresAt || Date.parse(exemption.expiresAt) > Date.parse(evaluatedAt)));
}

function evaluateRule(rule: BrandRule, observed: BrandGovernanceReport["observed"], policy: BrandPolicyVersion, deckVersionId: string, evaluatedAt: string): GovernanceFinding | undefined {
  const observedValues = rule.kind === "font" ? observed.fonts
    : rule.kind === "color" ? observed.colors
      : rule.kind === "logo_asset_id" ? observed.logoAssetIds
        : rule.kind === "asset_id" ? observed.assetIds
          : rule.kind === "chart_pack_id" ? observed.chartPackIds
            : Object.entries(observed.locks).filter(([, locked]) => locked === true).map(([dimension]) => dimension);
  const actual = new Map(observedValues.map((value) => [normalizeObserved(rule.kind, value), value]));
  const expected = new Map(rule.values.map((value) => [normalizeObserved(rule.kind, value), value]));
  const violations = rule.effect === "allowed"
    ? [...actual.entries()].filter(([key]) => !expected.has(key)).map(([, value]) => value)
    : [...expected.entries()].filter(([key]) => !actual.has(key)).map(([, value]) => value);
  if (violations.length === 0) return undefined;
  const exemption = activeExemption(policy.exemptions, rule.id, deckVersionId, evaluatedAt);
  return {
    findingId: `rule:${rule.id}`,
    ruleId: rule.id,
    kind: rule.kind,
    effect: rule.effect,
    severity: rule.severity,
    status: exemption ? "exempted" : "active",
    values: uniqueSorted(violations),
    evidence: rule.kind === "lock" ? ["style-mix:locks"]
      : rule.kind === "chart_pack_id" ? ["style-dna:charts", "slide-plans:chartPackRef", "native:chart-pack-manifest"]
        : rule.kind === "font" ? ["style-dna:typography", "native:layout", "native:font-evidence"]
          : rule.kind === "color" ? ["style-dna:colors", "native:layout"]
            : ["native:inspect", "native:image-evidence"],
    ...(exemption ? { exemption: {
      exemptionId: exemption.exemptionId,
      auditReason: exemption.auditReason,
      authorizedBy: exemption.authorizedBy,
      authorizedAt: exemption.authorizedAt,
      ...(exemption.expiresAt ? { expiresAt: exemption.expiresAt } : {})
    } } : {})
  };
}

export function evaluateBrandGovernance(policyArtifact: TeamArtifactVersion, input: BrandGovernanceInput, evaluatedAt: string): BrandGovernanceResult {
  const policy = policyFromArtifact(policyArtifact);
  const evidenceBindings = EVIDENCE_NAMES.map((name) => {
    const item = input.evidence[name];
    return { name, ...(item.expectedHash ? { expectedHash: item.expectedHash } : {}), ...(item.content !== undefined ? { actualHash: brandArtifactHash(item.content) } : {}) };
  });
  const actualDeckHash = sha256Bytes(input.deckBytes);
  const integrityChecks = [
    makeIntegrityCheck("deck.sha256", input.deckBinding.sha256, actualDeckHash, "Deck"),
    ...evidenceBindings.map((binding) => makeIntegrityCheck(`evidence.${binding.name}`, binding.expectedHash, binding.actualHash, binding.name))
  ];
  const inspect = input.evidence.inspect.content;
  const layouts = input.evidence.layouts.content;
  const slidePlans = input.evidence.slidePlans.content;
  const qaReport = input.evidence.qaReport.content;
  integrityChecks.push(
    { id: "deck.versionId", passed: input.deckVersionId === input.deckBinding.versionId, message: "Requested deck version must match the authoritative manifest" },
    { id: "deck.binding", passed: HASH_PATTERN.test(input.deckBinding.manifestHash) && HASH_PATTERN.test(input.deckBinding.sha256)
      && typeof input.deckBinding.evidenceManifestName === "string" && input.deckBinding.evidenceManifestName.length > 0
      && typeof input.deckBinding.evidenceManifestHash === "string" && HASH_PATTERN.test(input.deckBinding.evidenceManifestHash)
      && input.deckBinding.projectId.length > 0 && input.deckBinding.slides > 0,
    message: "Deck binding must come from persisted immutable deck and evidence manifests" },
    { id: "style.identity", passed: Boolean(input.evidence.styleDna.content && input.evidence.styleMix.content
      && input.evidence.styleMix.content.finalStyleId === input.evidence.styleDna.content.styleId), message: "Style Mix must bind the evaluated Style DNA identity" }
  );
  integrityChecks.push(...evidenceContractChecks(input));
  const integrityPassed = integrityChecks.every((check) => check.passed);
  const assets = collectAssets(inspect, input.evidence.imageEvidence.content);
  const observed: BrandGovernanceReport["observed"] = {
    fonts: collectFonts(layouts, input.evidence.fontEvidence.content),
    colors: collectColors(undefined, layouts),
    ...assets,
    chartPackIds: collectChartPacks(undefined, undefined, input.evidence.chartPackManifest.content),
    locks: collectLocks(input.evidence.styleMix.content)
  };
  let findings: GovernanceFinding[] = [];
  if (integrityPassed) {
    findings = policy.rules.map((rule) => evaluateRule(rule, observed, policy, input.deckVersionId, evaluatedAt)).filter((item): item is GovernanceFinding => Boolean(item));
    if (qaReport?.status !== "PASS") findings.push({
      findingId: "system:qa-pass",
      ruleId: "system.qa_pass",
      kind: "qa",
      effect: "required",
      severity: "blocking",
      status: "active",
      values: [String(qaReport?.status ?? "MISSING")],
      evidence: ["qa:qa-report"]
    });
  }
  findings.sort((a, b) => a.findingId.localeCompare(b.findingId, "en"));
  const activeBlocking = findings.filter((finding) => finding.status === "active" && finding.severity === "blocking").length;
  const activeWarnings = findings.filter((finding) => finding.status === "active" && finding.severity === "warning").length;
  const exempted = findings.filter((finding) => finding.status === "exempted").length;
  const teamArtifactHash = policyArtifact.contentHash;
  const artifactSetHash = brandArtifactHash(evidenceBindings.map((item) => ({ name: item.name, actualHash: item.actualHash ?? null })));
  const binding: BrandGovernanceBinding = {
    policy: { policyId: policy.policyId, version: policy.version, teamArtifactHash, contentHash: policy.contentHash },
    deck: { versionId: input.deckBinding.versionId, expectedSha256: input.deckBinding.sha256, actualSha256: actualDeckHash,
      projectId: input.deckBinding.projectId, manifestType: input.deckBinding.manifestType, manifestName: input.deckBinding.manifestName,
      manifestHash: input.deckBinding.manifestHash, pptxName: input.deckBinding.pptxName, slides: input.deckBinding.slides,
      ...(input.deckBinding.evidenceManifestName ? { evidenceManifestName: input.deckBinding.evidenceManifestName } : {}),
      ...(input.deckBinding.evidenceManifestHash ? { evidenceManifestHash: input.deckBinding.evidenceManifestHash } : {}) },
    style: {
      ...(input.evidence.styleDna.expectedHash ? { styleDnaExpectedHash: input.evidence.styleDna.expectedHash } : {}),
      ...(evidenceBindings.find((item) => item.name === "styleDna")?.actualHash ? { styleDnaActualHash: evidenceBindings.find((item) => item.name === "styleDna")!.actualHash } : {}),
      ...(input.evidence.styleMix.expectedHash ? { styleMixExpectedHash: input.evidence.styleMix.expectedHash } : {}),
      ...(evidenceBindings.find((item) => item.name === "styleMix")?.actualHash ? { styleMixActualHash: evidenceBindings.find((item) => item.name === "styleMix")!.actualHash } : {})
    },
    evidence: evidenceBindings,
    artifactSetHash
  };
  const status: BrandGovernanceReport["status"] = !integrityPassed ? "INTEGRITY_FAILURE"
    : activeBlocking > 0 ? "VIOLATING"
      : activeWarnings > 0 ? "COMPLIANT_WITH_WARNINGS" : "COMPLIANT";
  const reportBase = {
    schema: BRAND_GOVERNANCE_REPORT_SCHEMA,
    tenantId: policy.tenantId,
    teamId: policy.teamId,
    status,
    binding,
    integrity: { passed: integrityPassed, checks: integrityChecks },
    observed,
    findings,
    summary: { activeBlocking, activeWarnings, exempted, evaluatedRules: integrityPassed ? policy.rules.length : 0 },
    evaluatedAt
  } satisfies Omit<BrandGovernanceReport, "reportHash">;
  const report: BrandGovernanceReport = { ...reportBase, reportHash: brandArtifactHash(reportBase) };
  const decision = status === "COMPLIANT" ? "ALLOW" : status === "COMPLIANT_WITH_WARNINGS" ? "ALLOW_WITH_WARNINGS" : "BLOCKED";
  const reasonCodes = !integrityPassed ? integrityChecks.filter((check) => !check.passed).map((check) => `INTEGRITY:${check.id}`)
    : findings.filter((finding) => finding.status === "active").map((finding) => `${finding.severity.toUpperCase()}:${finding.ruleId}`);
  const decisionBase = {
    schema: BRAND_GOVERNANCE_DECISION_SCHEMA,
    tenantId: policy.tenantId,
    teamId: policy.teamId,
    decision,
    reasonCodes: uniqueSorted(reasonCodes),
    binding: { ...binding, reportHash: report.reportHash },
    decidedAt: evaluatedAt
  } satisfies Omit<BrandGovernanceDecision, "decisionHash">;
  return { report, decision: { ...decisionBase, decisionHash: brandArtifactHash(decisionBase) } };
}

export class BrandGovernanceService {
  private readonly teamLibrary: TeamStyleLibraryService;
  private readonly now: () => string;
  private readonly resolveInput?: (actor: TeamLibraryActor, projectId: string, deckVersionId: string) => Promise<BrandGovernanceInput>;

  constructor(teamLibrary: TeamStyleLibraryService, now: () => string = () => new Date().toISOString(),
    resolveInput?: (actor: TeamLibraryActor, projectId: string, deckVersionId: string) => Promise<BrandGovernanceInput>) {
    this.teamLibrary = teamLibrary;
    this.now = now;
    this.resolveInput = resolveInput;
  }

  async publishPolicy(actor: TeamLibraryActor, draft: BrandPolicyDraft) {
    const validatedDraft = validateBrandPolicyDraft(draft);
    const artifacts = await this.teamLibrary.listArtifacts(actor, { artifactType: "brand_policy", state: "all" });
    const versions = artifacts.filter((artifact) => artifact.artifactId === validatedDraft.policyId).sort((left, right) => compareVersions(right.version, left.version));
    const existing = versions.find((artifact) => artifact.version === validatedDraft.version);
    const parent = existing ? versions.find((artifact) => artifact.version === (existing.content as BrandPolicyVersion).provenance.parentVersion) : versions[0];
    const existingPolicy = existing ? policyFromArtifact(existing) : undefined;
    const timestamp = existingPolicy?.provenance.createdAt ?? this.now();
    const policy = createBrandPolicyVersion({
      tenantId: actor.tenantId,
      teamId: actor.teamId,
      createdBy: existingPolicy?.provenance.createdBy ?? actor.userId,
      createdAt: timestamp,
      parentVersion: existingPolicy?.provenance.parentVersion ?? parent?.version ?? null,
      parentContentHash: existingPolicy?.provenance.parentContentHash ?? (parent?.content as BrandPolicyVersion | undefined)?.contentHash ?? null,
      exemptionAuthorizedBy: actor.userId,
      exemptionAuthorizedAt: timestamp,
      existingExemptions: existingPolicy?.exemptions,
      draft: validatedDraft
    });
    return this.teamLibrary.publishBrandPolicy(actor, policy, { sourceProjectId: validatedDraft.sourceProjectId });
  }

  async enforce(actor: TeamLibraryActor, policyId: string, version: string | undefined, projectId: string, deckVersionId: string) {
    if (!this.resolveInput) throw new TeamLibraryError("Authoritative Brand Governance input resolver is required", "INVALID");
    const artifact = await this.teamLibrary.getArtifact(actor, "brand_policy", policyId, version);
    if (artifact.tenantId !== actor.tenantId || artifact.teamId !== actor.teamId) throw new TeamLibraryError("Brand Policy scope mismatch", "FORBIDDEN");
    const input = await this.resolveInput(actor, projectId, deckVersionId);
    if (input.deckBinding.projectId !== projectId || input.deckVersionId !== deckVersionId) {
      throw new TeamLibraryError("Resolved Brand Governance input identity mismatch", "INVALID");
    }
    return evaluateBrandGovernance(artifact, input, this.now());
  }
}
