import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { brandArtifactHash, createBrandPolicyVersion, validateBrandPolicyVersion } from "../lib/brand-policy.ts";
import { BrandGovernanceService, evaluateBrandGovernance } from "../lib/brand-governance.ts";
import { publishGeneratedDeckVersion, resolveAuthoritativeDeckVersion, resolveDeckEvidenceManifest } from "../lib/deck-version-binding.ts";
import { LocalTeamStyleLibraryRepository, TeamLibraryError, TeamStyleLibraryService } from "../lib/team-style-library.ts";
import { handleBrandGovernanceGet as GET, handleBrandGovernancePost as POST } from "../lib/brand-governance-api.ts";

const NOW = "2026-08-24T08:00:00.000Z";
const owner = { tenantId: "tenant_brand", teamId: "team_brand", userId: "owner_brand" };
const editor = { ...owner, userId: "editor_brand" };
const viewer = { ...owner, userId: "viewer_brand" };

function rules() {
  return [
    { id: "font_allowed", kind: "font", effect: "allowed", severity: "blocking", values: ["Microsoft YaHei"] },
    { id: "font_required", kind: "font", effect: "required", severity: "blocking", values: ["Microsoft YaHei"] },
    { id: "color_allowed", kind: "color", effect: "allowed", severity: "warning", values: ["#112233"] },
    { id: "color_required", kind: "color", effect: "required", severity: "blocking", values: ["#112233"] },
    { id: "logo_allowed", kind: "logo_asset_id", effect: "allowed", severity: "blocking", values: ["logo_primary"] },
    { id: "logo_required", kind: "logo_asset_id", effect: "required", severity: "blocking", values: ["logo_primary"] },
    { id: "asset_allowed", kind: "asset_id", effect: "allowed", severity: "blocking", values: ["logo_primary"] },
    { id: "chart_allowed", kind: "chart_pack_id", effect: "allowed", severity: "blocking", values: ["chart_restrained_business_v1"] },
    { id: "chart_required", kind: "chart_pack_id", effect: "required", severity: "blocking", values: ["chart_restrained_business_v1"] },
    { id: "locks_required", kind: "lock", effect: "required", severity: "blocking", values: ["typography", "layout", "visualTone"] }
  ];
}

function policyDraft(overrides = {}) {
  return { policyId: "policy_corporate", version: "1.0.0", name: "Corporate Brand Policy", rules: rules(), exemptions: [], ...overrides };
}

function evidence(overrides = {}) {
  const styleDna = { styleId: "style_corporate", typography: { body: { fontFamily: "Microsoft YaHei" } },
    colors: { primary: "#112233" }, charts: { chartPackId: "chart_restrained_business_v1" } };
  const content = {
    styleDna,
    styleMix: { finalStyleId: styleDna.styleId, locks: { typography: true, layout: true, visualTone: true } },
    slidePlans: [{ slideIndex: 1, chartPackRef: "chart_restrained_business_v1" }],
    inspect: [{ kind: "slide", id: "slide_1", slide: 1 }, { kind: "textbox", id: "title", name: "title", slide: 1 },
      { kind: "image", id: "logo", name: "corporate-logo", slide: 1, role: "logo", assetId: "logo_primary" },
      { kind: "chart", id: "chart", name: "chart", slide: 1 }],
    layouts: [{ slide: 1, elements: [{ name: "title", text: "Title", resolvedTextStyle: { typeface: "Microsoft YaHei", color: "#112233" } }] }],
    fontEvidence: { objects: [{ slide: 1, objectName: "title", requestedTypeface: "Microsoft YaHei", appliedTypeface: "Microsoft YaHei" }] },
    imageEvidence: [{ slide: 1, objectName: "corporate-logo", role: "logo", assetId: "logo_primary" }],
    chartPackManifest: { schema: "ppt-factory/chart-pack-manifest/v1", charts: [{ slide: 1, objectName: "chart", resolvedId: "chart_restrained_business_v1" }] },
    qaReport: { status: "PASS" }, ...overrides
  };
  return Object.fromEntries(Object.entries(content).map(([name, value]) => [name, { expectedHash: brandArtifactHash(value), content: value }]));
}

function deckInput(versionId = "deck_v1", text = "bounded-editable-pptx-version-1", evidenceInput = evidence()) {
  const deckBytes = new TextEncoder().encode(text);
  const sha256 = createHash("sha256").update(deckBytes).digest("hex");
  return { deckVersionId: versionId, deckBinding: { projectId: "project_brand", versionId, sha256, slides: 1, manifestType: "generation",
    manifestName: `deck-generation-manifest-${versionId}.json`, manifestHash: brandArtifactHash({ versionId, sha256 }), pptxName: `versions/${versionId}.pptx`,
    evidenceManifestName: `deck-evidence-manifest-${versionId}.json`, evidenceManifestHash: brandArtifactHash({ versionId, evidence: "fixture" }) },
  deckBytes, evidence: evidenceInput };
}

async function fixture(now = () => NOW) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "ppt-brand-governance-"));
  const team = new TeamStyleLibraryService(new LocalTeamStyleLibraryRepository(root), now);
  await team.createTeam(owner, "Brand Team");
  await team.setMember(owner, editor.userId, "editor");
  await team.setMember(owner, viewer.userId, "viewer");
  return { root, team, governance: new BrandGovernanceService(team, now) };
}

function headers(actor) {
  return { "content-type": "application/json", "x-ppt-tenant-id": actor.tenantId, "x-ppt-team-id": actor.teamId, "x-ppt-user-id": actor.userId };
}

test("Brand Policy validates raw drafts before normalization and protects canonical content", () => {
  const common = { tenantId: owner.tenantId, teamId: owner.teamId, createdBy: owner.userId, createdAt: NOW,
    parentVersion: null, parentContentHash: null, exemptionAuthorizedBy: owner.userId, exemptionAuthorizedAt: NOW };
  const policy = createBrandPolicyVersion({ ...common, draft: policyDraft({ rules: [...rules()].reverse() }) });
  assert.deepEqual(policy.rules.map((rule) => rule.id), [...policy.rules.map((rule) => rule.id)].sort());
  assert.equal(validateBrandPolicyVersion(policy).contentHash, policy.contentHash);
  assert.throws(() => validateBrandPolicyVersion({ ...policy, name: "Tampered" }), /content hash mismatch/);
  assert.throws(() => createBrandPolicyVersion({ ...common, draft: policyDraft({ unsupported: true }) }), /unsupported fields/);
  assert.throws(() => createBrandPolicyVersion({ ...common, draft: policyDraft({ rules: [{ id: "broken", kind: "font", effect: "allowed", severity: "blocking" }] }) }), /values/);
});

test("Team library keeps independent policy-content and Team-artifact lineages and idempotency", async () => {
  let tick = 0;
  const { governance, team } = await fixture(() => `2026-08-24T08:00:0${tick++}.000Z`);
  const first = await governance.publishPolicy(editor, policyDraft());
  const same = await governance.publishPolicy(editor, policyDraft());
  assert.equal(same.contentHash, first.contentHash);
  await assert.rejects(() => governance.publishPolicy(viewer, policyDraft({ policyId: "viewer_policy" })), (error) => error instanceof TeamLibraryError && error.code === "FORBIDDEN");
  const second = await governance.publishPolicy(editor, policyDraft({ version: "1.0.1", name: "Corporate Brand Policy v1.0.1" }));
  assert.equal(second.provenance.parentContentHash, first.contentHash);
  assert.equal(second.content.provenance.parentContentHash, first.content.contentHash);
  assert.notEqual(second.provenance.parentContentHash, second.content.provenance.parentContentHash);
  assert.equal((await team.getArtifact(viewer, "brand_policy", "policy_corporate", "1.0.1")).contentHash, second.contentHash);
});

test("Authenticated publisher supplies exemption audit provenance and raw claims are rejected", async () => {
  const { governance } = await fixture();
  const draft = policyDraft({ rules: [rules()[0]], exemptions: [{ exemptionId: "temporary_font", ruleIds: ["font_allowed"],
    deckVersionIds: ["deck_exempt"], auditReason: "Legacy regulator template." }] });
  const artifact = await governance.publishPolicy(editor, draft);
  assert.equal(artifact.content.exemptions[0].authorizedBy, editor.userId);
  assert.equal(artifact.content.exemptions[0].authorizedAt, NOW);
  await assert.rejects(() => governance.publishPolicy(editor, policyDraft({ policyId: "forged", exemptions: [{ exemptionId: "forged",
    ruleIds: ["font_allowed"], deckVersionIds: ["deck_v1"], auditReason: "Forged", authorizedBy: owner.userId, authorizedAt: NOW }] })), /unsupported fields/);
});

test("Compliant authoritative evidence produces deterministic hash-bound ALLOW", async () => {
  const { governance } = await fixture();
  const artifact = await governance.publishPolicy(editor, policyDraft());
  const input = deckInput();
  const first = evaluateBrandGovernance(artifact, input, NOW);
  const second = evaluateBrandGovernance(artifact, input, NOW);
  assert.equal(first.decision.decision, "ALLOW");
  assert.deepEqual(first, second);
  assert.equal(first.report.binding.deck.manifestHash, input.deckBinding.manifestHash);
  assert.equal(first.report.binding.deck.actualSha256, input.deckBinding.sha256);
  assert.equal(first.decision.binding.reportHash, first.report.reportHash);
});

test("Malformed hash-matching evidence and requested/authoritative version mismatch fail closed", async () => {
  const { governance } = await fixture();
  const artifact = await governance.publishPolicy(editor, policyDraft({ rules: [rules()[0]] }));
  const malformed = evidence({ fontEvidence: {}, imageEvidence: {}, chartPackManifest: {} });
  const result = evaluateBrandGovernance(artifact, deckInput("deck_v1", "deck", malformed), NOW);
  assert.equal(result.report.status, "INTEGRITY_FAILURE");
  assert.equal(result.decision.decision, "BLOCKED");
  assert.ok(result.decision.reasonCodes.some((reason) => reason.includes("fontEvidence.contract")));
  const mismatch = deckInput();
  mismatch.deckVersionId = "deck_other";
  const mismatchResult = evaluateBrandGovernance(artifact, mismatch, NOW);
  assert.equal(mismatchResult.decision.decision, "BLOCKED");
  assert.ok(mismatchResult.decision.reasonCodes.includes("INTEGRITY:deck.versionId"));
});

test("Evidence coverage requires exact unique native object identities", async () => {
  const { governance } = await fixture();
  const artifact = await governance.publishPolicy(editor, policyDraft({ rules: [rules()[0]] }));
  const duplicateFont = { objects: [
    { slide: 1, objectName: "title", requestedTypeface: "Microsoft YaHei" },
    { slide: 1, objectName: "title", requestedTypeface: "Microsoft YaHei" }
  ] };
  const result = evaluateBrandGovernance(artifact,
    deckInput("deck_v1", "deck-with-duplicate-coverage", evidence({ fontEvidence: duplicateFont })), NOW);
  assert.equal(result.decision.decision, "BLOCKED");
  assert.ok(result.decision.reasonCodes.includes("INTEGRITY:evidence.crossCoverage"));
});

test("Authoritative update versions require strict manifest and project identity", async () => {
  const projectsRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "ppt-deck-update-binding-"));
  const projectId = "project_update";
  const versionId = "update_v1";
  const outputRoot = path.join(projectsRoot, projectId, "output");
  await fsp.mkdir(path.join(outputRoot, "versions"), { recursive: true });
  const bytes = new TextEncoder().encode("immutable-update-pptx");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  await fsp.writeFile(path.join(outputRoot, "versions", `${versionId}.pptx`), bytes, { flag: "wx" });
  const manifest = { schema: "ppt-factory/deck-update-manifest/v1", updateId: versionId, status: "applied",
    source: { versionId: "source_v1", filename: "source.pptx", sha256, slides: 1, projectId },
    output: { versionId, filename: `versions/${versionId}.pptx`, sha256, slides: 1, projectId }, planHash: sha256,
    lockedDimensions: [], changes: [{ targetId: "title", status: "applied" }], preservation: { untouchedObjectsStable: true } };
  const manifestPath = path.join(outputRoot, `deck-update-manifest-${versionId}.json`);
  await fsp.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  const resolved = await resolveAuthoritativeDeckVersion(projectsRoot, projectId, versionId);
  assert.equal(resolved.binding.manifestType, "update");
  assert.equal(resolved.binding.sha256, sha256);
  await fsp.writeFile(manifestPath, `${JSON.stringify({ ...manifest, output: { ...manifest.output, projectId: "other_project" } })}\n`);
  await assert.rejects(() => resolveAuthoritativeDeckVersion(projectsRoot, projectId, versionId), /project identity is invalid/);
});

test("Deck-scoped exemption uses the authoritative version identity only", async () => {
  const { governance } = await fixture();
  const artifact = await governance.publishPolicy(editor, policyDraft({ rules: [rules()[0]], exemptions: [{ exemptionId: "temporary_font",
    ruleIds: ["font_allowed"], deckVersionIds: ["deck_exempt"], auditReason: "Legacy regulator template." }] }));
  const badStyle = { styleId: "style_corporate", typography: { body: { fontFamily: "Arial" } }, colors: { primary: "#112233" } };
  const bad = evidence({ styleDna: badStyle, styleMix: { finalStyleId: badStyle.styleId, locks: { typography: true, layout: true, visualTone: true } },
    layouts: [{ slide: 1, elements: [{ name: "title", text: "Title", resolvedTextStyle: { typeface: "Arial", color: "#112233" } }] }],
    fontEvidence: { objects: [{ slide: 1, objectName: "title", requestedTypeface: "Arial", appliedTypeface: "Arial" }] } });
  const allowed = evaluateBrandGovernance(artifact, deckInput("deck_exempt", "immutable-exempt-deck", bad), NOW);
  assert.equal(allowed.decision.decision, "ALLOW");
  const other = evaluateBrandGovernance(artifact, deckInput("deck_other", "immutable-other-deck", bad), NOW);
  assert.equal(other.decision.decision, "BLOCKED");
});

test("Required native rules cannot be satisfied by Style DNA or Slide Plan declarations", async () => {
  const { governance } = await fixture();
  const artifact = await governance.publishPolicy(editor, policyDraft({ rules: [rules()[1], rules()[3], rules()[8]] }));
  const nativeMismatch = evidence({
    layouts: [{ slide: 1, elements: [{ name: "title", text: "Title", resolvedTextStyle: { typeface: "Arial", color: "#FFFFFF" } }] }],
    fontEvidence: { objects: [{ slide: 1, objectName: "title", requestedTypeface: "Arial", appliedTypeface: "Arial" }] },
    chartPackManifest: { schema: "ppt-factory/chart-pack-manifest/v1", charts: [{ slide: 1, objectName: "chart", resolvedId: "unclassified-native" }] }
  });
  const result = evaluateBrandGovernance(artifact, deckInput("deck_v1", "native-mismatch", nativeMismatch), NOW);
  assert.equal(result.decision.decision, "BLOCKED");
  assert.ok(result.decision.reasonCodes.includes("BLOCKING:font_required"));
  assert.ok(result.decision.reasonCodes.includes("BLOCKING:color_required"));
  assert.ok(result.decision.reasonCodes.includes("BLOCKING:chart_required"));
});

test("Executable API fails closed for identity, remote backend, roles, raw fields, and deck binding", { concurrency: false }, async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "ppt-brand-api-"));
  const projectsRoot = path.join(root, "projects");
  const libraryRoot = path.join(root, "library");
  const keys = ["PPT_FACTORY_TEAM_LIBRARY_BACKEND", "PPT_FACTORY_TEAM_LIBRARY_ALLOW_LOCAL_IDENTITY", "PPT_FACTORY_PROJECTS_ROOT", "PPT_FACTORY_TEAM_LIBRARY_ROOT"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  process.env.PPT_FACTORY_PROJECTS_ROOT = projectsRoot;
  process.env.PPT_FACTORY_TEAM_LIBRARY_ROOT = libraryRoot;
  try {
    delete process.env.PPT_FACTORY_TEAM_LIBRARY_ALLOW_LOCAL_IDENTITY;
    process.env.PPT_FACTORY_TEAM_LIBRARY_BACKEND = "local";
    let response = await POST(new Request("http://local/api/team/brand-governance", { method: "POST", headers: headers(owner), body: JSON.stringify({ action: "publish-policy", policy: policyDraft() }) }));
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, "LOCAL_IDENTITY_DISABLED");
    process.env.PPT_FACTORY_TEAM_LIBRARY_ALLOW_LOCAL_IDENTITY = "true";
    process.env.PPT_FACTORY_TEAM_LIBRARY_BACKEND = "supabase";
    response = await GET(new Request("http://local/api/team/brand-governance", { headers: headers(owner) }));
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, "REMOTE_ADAPTER_UNAVAILABLE");
    process.env.PPT_FACTORY_TEAM_LIBRARY_BACKEND = "local";
    const team = new TeamStyleLibraryService(new LocalTeamStyleLibraryRepository(libraryRoot), () => NOW);
    await team.createTeam(owner, "API Team");
    await team.setMember(owner, editor.userId, "editor");
    await team.setMember(owner, viewer.userId, "viewer");
    response = await POST(new Request("http://local/api/team/brand-governance", { method: "POST", headers: headers(editor), body: "{" }));
    assert.equal(response.status, 400);
    response = await POST(new Request("http://local/api/team/brand-governance", { method: "POST", headers: headers(viewer), body: JSON.stringify({ action: "publish-policy", policy: policyDraft() }) }));
    assert.equal(response.status, 403);
    response = await POST(new Request("http://local/api/team/brand-governance", { method: "POST", headers: headers(editor), body: JSON.stringify({ action: "publish-policy", policy: policyDraft({ unknown: true }) }) }));
    assert.equal(response.status, 400);
    response = await POST(new Request("http://local/api/team/brand-governance", { method: "POST", headers: headers(editor), body: JSON.stringify({ action: "publish-policy", policy: policyDraft({ policyId: "api_policy" }) }) }));
    assert.equal(response.status, 201);
    const projectId = "project_api";
    const project = path.join(projectsRoot, projectId);
    await fsp.mkdir(path.join(project, "output"), { recursive: true });
    const finalPptx = path.join(project, "output", "final.pptx");
    await fsp.writeFile(finalPptx, new TextEncoder().encode("real-api-pptx-bytes"));
    const published = await publishGeneratedDeckVersion({ projectsRoot, projectId, finalPptxPath: finalPptx, slides: 1, direction: "B" });
    const apiEvidence = evidence();
    const files = { "style/final-style.json": apiEvidence.styleDna.content, "style/style-mix.json": apiEvidence.styleMix.content,
      "slide-plans/slide-plans.json": apiEvidence.slidePlans.content, "render/final/font-evidence.json": apiEvidence.fontEvidence.content,
      "render/final/image-metadata.json": apiEvidence.imageEvidence.content, "render/final/chart-pack-manifest.json": apiEvidence.chartPackManifest.content,
      "qa/qa-report.json": apiEvidence.qaReport.content, "render/final/slide-001.layout.json": apiEvidence.layouts.content[0] };
    for (const [name, value] of Object.entries(files)) { const file = path.join(project, ...name.split("/")); await fsp.mkdir(path.dirname(file), { recursive: true }); await fsp.writeFile(file, JSON.stringify(value), "utf8"); }
    await fsp.writeFile(path.join(project, "render", "final", "inspect.ndjson"), `${apiEvidence.inspect.content.map((item) => JSON.stringify(item)).join("\n")}\n`, "utf8");
    response = await POST(new Request("http://local/api/team/brand-governance", { method: "POST", headers: headers(viewer), body: JSON.stringify({ action: "enforce",
      projectId, policyId: "api_policy", policyVersion: "1.0.0", deckVersionId: published.manifest.versionId }) }));
    assert.equal(response.status, 400);
    response = await POST(new Request("http://local/api/team/brand-governance", { method: "POST", headers: headers(viewer), body: JSON.stringify({ action: "publish-evidence",
      projectId, deckVersionId: published.manifest.versionId }) }));
    assert.equal(response.status, 403);
    response = await POST(new Request("http://local/api/team/brand-governance", { method: "POST", headers: headers(editor), body: JSON.stringify({ action: "publish-evidence",
      projectId, deckVersionId: published.manifest.versionId }) }));
    const evidencePublication = await response.json();
    assert.equal(response.status, 201, JSON.stringify(evidencePublication));
    assert.equal(evidencePublication.manifest.tenantId, owner.tenantId);
    assert.equal(evidencePublication.manifest.teamId, owner.teamId);
    await assert.rejects(() => resolveDeckEvidenceManifest(projectsRoot, {
      projectId, versionId: published.manifest.versionId, sha256: published.manifest.output.sha256, slides: 1,
      manifestType: "generation", manifestName: published.manifestName, manifestHash: published.manifestHash,
      pptxName: published.manifest.output.filename
    }, { tenantId: "tenant_other", teamId: "team_other" }), /identity is invalid/);
    response = await POST(new Request("http://local/api/team/brand-governance", { method: "POST", headers: headers(viewer), body: JSON.stringify({ action: "enforce",
      projectId, policyId: "api_policy", policyVersion: "1.0.0", deckVersionId: published.manifest.versionId,
      hashes: { deck: "0".repeat(64), styleDna: "0".repeat(64) } }) }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).decision.decision, "ALLOW");
    await fsp.writeFile(path.join(project, "qa", "qa-report.json"), JSON.stringify({ status: "FAIL" }), "utf8");
    response = await POST(new Request("http://local/api/team/brand-governance", { method: "POST", headers: headers(viewer), body: JSON.stringify({ action: "enforce",
      projectId, policyId: "api_policy", policyVersion: "1.0.0", deckVersionId: published.manifest.versionId,
      hashes: { qaReport: brandArtifactHash({ status: "FAIL" }) } }) }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).decision.decision, "BLOCKED");
    assert.ok(fs.existsSync(path.join(project, "qa", "BRAND_GOVERNANCE_DECISION.json")));
  } finally {
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  }
});

test("Schemas expose strict draft, immutable generation, report and decision contracts", () => {
  const root = process.cwd();
  for (const name of ["brand-policy", "brand-policy-draft", "brand-governance-report", "brand-governance-decision", "deck-generation-manifest", "deck-evidence-manifest"]) {
    const schema = JSON.parse(fs.readFileSync(path.join(root, `schemas/${name}.schema.json`), "utf8"));
    assert.equal(schema.additionalProperties, false);
  }
  const draft = JSON.parse(fs.readFileSync(path.join(root, "schemas/brand-policy-draft.schema.json"), "utf8"));
  assert.equal(draft.properties.exemptions.items.additionalProperties, false);
  assert.equal(draft.properties.exemptions.items.properties.authorizedBy, undefined);
});
