import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { brandArtifactHash } from "../lib/brand-policy.ts";
import { BrandGovernanceService, evaluateBrandGovernance } from "../lib/brand-governance.ts";
import { publishDeckEvidenceManifest, publishGeneratedDeckVersion } from "../lib/deck-version-binding.ts";
import { LocalTeamStyleLibraryRepository, TeamStyleLibraryService } from "../lib/team-style-library.ts";

const output = path.join(process.cwd(), "generated", "probes", "brand-governance");
const primaryRepo = path.resolve(process.cwd(), "..", "..");
const sourceProject = path.join(primaryRepo, "generated", "projects", "project_8effec2a-4629-4945-b65c-41c4b6a0947c");
const sourcePptx = path.join(sourceProject, "output", "final.pptx");
const sourceManifestPath = path.join(sourceProject, "output", "acceptance-manifest.json");
await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(output, { recursive: true });

const sha256 = async (file) => createHash("sha256").update(await fs.readFile(file)).digest("hex");
const sourceHashBefore = await sha256(sourcePptx);
const sourceAcceptance = JSON.parse(await fs.readFile(sourceManifestPath, "utf8"));
if (sourceAcceptance.status !== "PASS" || sourceAcceptance.checks?.reopenedSlides < 1 || sourceAcceptance.checks.reopenedSlides > 8
  || sourceAcceptance.checks?.editableRatio < 0.8 || sourceAcceptance.checks?.qaStatus !== "PASS") {
  throw new Error("Existing bounded editable PPTX acceptance is not suitable for governance acceptance");
}

const readJson = async (...parts) => JSON.parse(await fs.readFile(path.join(sourceProject, ...parts), "utf8"));
const styleDna = await readJson("style", "final-style.json");
const styleMix = await readJson("style", "style-mix.json");
const slidePlans = await readJson("slide-plans", "slide-plans.json");
const qaReport = await readJson("qa", "qa-report.json");
const inspect = (await fs.readFile(path.join(sourceProject, "render", "final", "inspect.ndjson"), "utf8"))
  .split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const layouts = await Promise.all(Array.from({ length: sourceAcceptance.checks.reopenedSlides }, (_, index) =>
  readJson("render", "final", `slide-${String(index + 1).padStart(3, "0")}.layout.json`)));
const fontObjects = layouts.flatMap((layout, slideIndex) => (layout.elements ?? []).filter((element) =>
  typeof element?.text === "string" || element?.resolvedTextStyle).map((element, objectIndex) => {
    const typeface = element.resolvedTextStyle?.typeface || layout.theme?.typefaces?.[0];
    if (typeof typeface !== "string" || !typeface.trim()) throw new Error(`Persisted native font evidence is missing on slide ${slideIndex + 1}`);
    return {
      slide: slideIndex + 1,
      objectName: String(element.name || element.id || `text-${objectIndex + 1}`),
      requestedTypeface: typeface,
      appliedTypeface: typeface,
      evidenceSource: "persisted-native-layout"
    };
  }));
const imageEvidence = inspect.filter((record) => record.kind === "image").map((record) => ({
  slide: record.slide,
  objectName: String(record.name || record.id),
  assetId: String(record.assetId || record.name || record.id),
  role: /logo/i.test(String(record.role || record.name || "")) ? "logo" : "image"
}));
const chartPackManifest = {
  schema: "ppt-factory/chart-pack-manifest/v1",
  source: "derived-from-persisted-native-inspect",
  charts: inspect.filter((record) => record.kind === "chart").map((record) => ({ slide: record.slide,
    objectName: String(record.name || record.id), resolvedId: "unclassified-native" }))
};
const fontEvidence = { version: 1, source: "persisted-native-layout", objects: fontObjects };

const stagedProjects = path.join(output, "projects");
const projectId = "brand_governance_real_deck";
const stagedProject = path.join(stagedProjects, projectId);
await fs.mkdir(path.join(stagedProject, "output"), { recursive: true });
const stagedFinal = path.join(stagedProject, "output", "final.pptx");
await fs.copyFile(sourcePptx, stagedFinal);
const publishedDeck = await publishGeneratedDeckVersion({ projectsRoot: stagedProjects, projectId, finalPptxPath: stagedFinal,
  slides: sourceAcceptance.checks.reopenedSlides, direction: "B" });

const now = () => "2026-08-24T10:00:00.000Z";
const owner = { tenantId: "tenant_acceptance", teamId: "team_brand", userId: "owner_brand" };
const viewer = { ...owner, userId: "viewer_brand" };
const team = new TeamStyleLibraryService(new LocalTeamStyleLibraryRepository(path.join(output, "team-library")), now);
const governance = new BrandGovernanceService(team, now);
await team.createTeam(owner, "Brand Acceptance Team");
await team.setMember(owner, viewer.userId, "viewer");
const policyArtifact = await governance.publishPolicy(owner, {
  policyId: "policy_acceptance",
  version: "1.0.0",
  name: "Acceptance Brand Policy",
  rules: [
    { id: "font_required", kind: "font", effect: "required", severity: "blocking", values: ["Microsoft YaHei"] }
  ],
  exemptions: []
});

const base = { styleDna, styleMix, slidePlans, inspect, layouts, fontEvidence, imageEvidence, chartPackManifest, qaReport };
const evidenceHashes = Object.fromEntries(Object.entries(base).map(([name, content]) => [name, brandArtifactHash(content)]));
const publishedEvidence = await publishDeckEvidenceManifest({ projectsRoot: stagedProjects,
  deck: { projectId, versionId: publishedDeck.manifest.versionId, sha256: publishedDeck.manifest.output.sha256,
    slides: publishedDeck.manifest.output.slides, manifestType: "generation", manifestName: publishedDeck.manifestName,
    manifestHash: publishedDeck.manifestHash, pptxName: publishedDeck.manifest.output.filename },
  evidenceHashes, tenantId: owner.tenantId, teamId: owner.teamId, publishedBy: owner.userId, publishedAt: now() });
const bind = (contents, expectedHashes) => Object.fromEntries(Object.entries(contents)
  .map(([name, content]) => [name, { expectedHash: expectedHashes?.[name] ?? brandArtifactHash(content), content }]));
async function runCase(name, contents, expectedHashes) {
  const result = evaluateBrandGovernance(policyArtifact, {
    deckVersionId: publishedDeck.manifest.versionId,
    deckBinding: { projectId, versionId: publishedDeck.manifest.versionId, sha256: publishedDeck.manifest.output.sha256,
      slides: publishedDeck.manifest.output.slides, manifestType: "generation", manifestName: publishedDeck.manifestName,
      manifestHash: publishedDeck.manifestHash, pptxName: publishedDeck.manifest.output.filename,
      evidenceManifestName: publishedEvidence.manifestName, evidenceManifestHash: publishedEvidence.manifestHash },
    deckBytes: new Uint8Array(await fs.readFile(publishedDeck.versionPath)),
    evidence: bind(contents, expectedHashes)
  }, now());
  const directory = path.join(output, name);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, "BRAND_GOVERNANCE_REPORT.json"), `${JSON.stringify(result.report, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(directory, "BRAND_GOVERNANCE_DECISION.json"), `${JSON.stringify(result.decision, null, 2)}\n`, "utf8");
  return result;
}

const compliant = await runCase("compliant", base, publishedEvidence.manifest.evidenceHashes);
const violating = await runCase("violating", { ...base,
  qaReport: { ...qaReport, status: "FAIL" }
});
const sourceHashAfter = await sha256(sourcePptx);
const checks = {
  existingRealEditablePptx: sourceAcceptance.checks.editableRatio >= 0.8 && sourceAcceptance.checks.reopenedSlides <= 8,
  persistedNativeEvidence: inspect.length > 0 && layouts.length === sourceAcceptance.checks.reopenedSlides && qaReport.status === "PASS",
  sourceHashUnchanged: sourceHashBefore === sourceHashAfter,
  authoritativeManifestBound: compliant.report.binding.deck.manifestHash === publishedDeck.manifestHash
    && compliant.report.binding.deck.actualSha256 === sourceHashBefore,
  authoritativeEvidenceManifestPublished: publishedEvidence.manifest.deckManifestHash === publishedDeck.manifestHash
    && publishedEvidence.manifest.deckSha256 === sourceHashBefore,
  compliantAllowed: compliant.report.status === "COMPLIANT" && compliant.decision.decision === "ALLOW",
  violatingBlocked: violating.report.status === "VIOLATING" && violating.decision.decision === "BLOCKED",
  exactReportDecisionBinding: compliant.decision.binding.reportHash === compliant.report.reportHash
    && violating.decision.binding.reportHash === violating.report.reportHash
};
const manifest = {
  schema: "ppt-factory/brand-governance-acceptance/v1",
  status: Object.values(checks).every(Boolean) ? "PASS" : "FAIL",
  source: { projectId: sourceAcceptance.projectId, pptx: sourcePptx, sha256Before: sourceHashBefore, sha256After: sourceHashAfter,
    slides: sourceAcceptance.checks.reopenedSlides, editableRatio: sourceAcceptance.checks.editableRatio, qaStatus: sourceAcceptance.checks.qaStatus },
  policy: { artifactId: policyArtifact.artifactId, version: policyArtifact.version, teamArtifactHash: policyArtifact.contentHash },
  evidence: { manifestName: publishedEvidence.manifestName, manifestHash: publishedEvidence.manifestHash,
    persisted: ["styleDna", "styleMix", "slidePlans", "inspect", "layouts", "qaReport"],
    derived: ["fontEvidence", "imageEvidence", "chartPackManifest"], chartClassification: "unclassified-native" },
  cases: [
    { id: "compliant", reportStatus: compliant.report.status, decision: compliant.decision.decision, reportHash: compliant.report.reportHash },
    { id: "violating", reportStatus: violating.report.status, decision: violating.decision.decision, reportHash: violating.report.reportHash }
  ],
  checks,
  artifacts: ["compliant/BRAND_GOVERNANCE_REPORT.json", "compliant/BRAND_GOVERNANCE_DECISION.json",
    "violating/BRAND_GOVERNANCE_REPORT.json", "violating/BRAND_GOVERNANCE_DECISION.json"]
};
await fs.writeFile(path.join(output, "ACCEPTANCE_MANIFEST.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify(manifest, null, 2));
if (manifest.status !== "PASS") process.exitCode = 1;
