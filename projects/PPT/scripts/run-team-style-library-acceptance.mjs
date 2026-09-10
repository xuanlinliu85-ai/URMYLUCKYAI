import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import {
  canonicalize, LocalTeamStyleLibraryRepository, TEAM_GOLDEN_SNAPSHOT_SCHEMA, TeamStyleLibraryService
} from "../lib/team-style-library.ts";
import { validateSupabaseTeamLibraryConfig } from "../adapters/supabase/team-style-library.ts";

const output = path.join(process.cwd(), "generated", "probes", "team-style-library");
await fs.rm(output, { recursive: true, force: true });
let tick = 0;
const service = new TeamStyleLibraryService(
  new LocalTeamStyleLibraryRepository(path.join(output, "repository")),
  () => `2026-08-24T0${tick++}:00:00.000Z`
);
const owner = { tenantId: "tenant_acceptance", teamId: "team_design", userId: "owner_1" };
const editor = { ...owner, userId: "editor_1" };
const viewer = { ...owner, userId: "viewer_1" };
await service.createTeam(owner, "Acceptance Design Team");
await service.setMember(owner, editor.userId, "editor");
await service.setMember(owner, viewer.userId, "viewer");

const dimensions = ["typography", "color", "layout", "chart", "density", "composition", "storytelling", "visualTone"];
const weights = Object.fromEntries(dimensions.map((dimension) => [dimension, { reference: .5, system: .3, prompt: .2 }]));
const locks = Object.fromEntries(dimensions.map((dimension) => [dimension, false]));
const resolvedOwnership = Object.fromEntries(dimensions.map((dimension) => [dimension, { owner: "reference", weights: weights[dimension], locked: false }]));
const style = {
  styleId: "style_acceptance", name: "Acceptance Style", sourceType: "hybrid", version: "1.0.0", styleVector: {},
  typography: {}, colors: {}, grid: {}, composition: {}, charts: {}, visuals: {}, storytelling: {}, density: {},
  preferredLayouts: ["EXEC_SUMMARY"], antiPatterns: []
};
const styleMix = {
  previewSet: "team-acceptance", sources: { referenceStyleId: "reference_acceptance", systemStyleId: "system_professional" },
  controls: { referenceStrength: 60, minimalism: 70, modernity: 65, airiness: 68, visualWeight: 55, technologyTone: 15, visualImpact: 45, locks: { typography: false, colors: false, layout: false }, advancedMixer: { weights, locks } },
  weights, locks, resolvedOwnership, finalStyleId: style.styleId, finalStyle: style,
  generatedAt: "2026-08-24T00:00:00.000Z"
};
const stylePackPayload = {
  schema: "ppt-factory/style-pack/v1", id: "pack_acceptance", version: "1.0.0", name: "Acceptance Pack",
  styleId: style.styleId, tags: [], roles: ["summary"], layoutFamilies: ["EXEC_SUMMARY"], densities: ["balanced"],
  hasCharts: false, chartTypes: [], audienceTags: [], active: true,
  previews: { cover: "cover.png", executiveSummary: "summary.png", dataSlide: "data.png" }, preferredLayouts: ["EXEC_SUMMARY"],
  chartRules: {}, typography: {}, imageDirection: {}, antiPatterns: [], examplePrompts: [],
  provenance: { previewSet: styleMix.previewSet, sources: styleMix.sources, weights, locks, resolvedOwnership }, styleMix, style
};
const stylePack = {
  ...stylePackPayload,
  contentHash: createHash("sha256").update(JSON.stringify(canonicalize(stylePackPayload))).digest("hex")
};
const goldenSnapshot = {
  schema: TEAM_GOLDEN_SNAPSHOT_SCHEMA, referenceStyleId: "style_acceptance", sourceFile: "bounded-3-slide-reference.pptx",
  candidate: {
    id: "golden_acceptance", sourceSlide: 2, role: "summary", layoutFamily: "EXEC_SUMMARY", density: "balanced",
    hasChart: false, score: 90, candidateThreshold: 68, eligible: true,
    dimensionScores: { layoutQuality: 91, clarity: 90, reusability: 92, styleRepresentativeness: 88, hierarchy: 91, balance: 89 },
    evidence: ["bounded-acceptance"]
  }
};
const publishedStyle = await service.publishStylePack(editor, stylePack, { sourceProjectId: "project_acceptance" });
const stylePackV2Payload = { ...stylePackPayload, version: "1.0.1" };
const stylePackV2 = {
  ...stylePackV2Payload,
  contentHash: createHash("sha256").update(JSON.stringify(canonicalize(stylePackV2Payload))).digest("hex")
};
const publishedStyleV2 = await service.publishStylePack(editor, stylePackV2, { sourceProjectId: "project_acceptance" });
const publishedGolden = await service.publishGoldenSlide(editor, goldenSnapshot, "1.0.0", { sourceProjectId: "project_acceptance" });
const archivedGolden = await service.archiveArtifact(owner, "golden_slide", "golden_acceptance", "1.0.0");
const visible = await service.listArtifacts(viewer);
let viewerMutationBlocked = false;
try { await service.publishStylePack(viewer, { ...stylePack, version: "1.0.1" }); } catch { viewerMutationBlocked = true; }
let crossTenantBlocked = false;
try { await service.getLibrary({ ...viewer, tenantId: "tenant_other" }); } catch { crossTenantBlocked = true; }
const config = validateSupabaseTeamLibraryConfig({});
const persisted = path.join(output, "repository", owner.tenantId, owner.teamId, "TEAM_STYLE_LIBRARY.json");
const checks = {
  localIdentityFlagExplicit: process.env.PPT_FACTORY_TEAM_LIBRARY_ALLOW_LOCAL_IDENTITY === "true",
  stylePackPublished: publishedStyle.state === "published",
  stylePackLineage: publishedStyleV2.provenance.parentVersion === publishedStyle.version
    && publishedStyleV2.provenance.parentContentHash === publishedStyle.contentHash,
  goldenPublishedThenArchived: archivedGolden.state === "archived" && archivedGolden.contentHash === publishedGolden.contentHash,
  archivedHiddenByDefault: visible.length === 2 && visible.every((artifact) => artifact.artifactType === "style_pack" && artifact.state === "published"),
  viewerMutationBlocked,
  crossTenantBlocked,
  remoteConfigHonestlyIncomplete: !config.valid && config.missing.length === 2,
  noCredentialMaterial: !JSON.stringify(config).includes("service_role_key")
};
const manifest = {
  schema: "ppt-factory/team-style-library-acceptance/v1",
  status: Object.values(checks).every(Boolean) ? "PASS" : "FAIL",
  scope: { tenantId: owner.tenantId, teamId: owner.teamId },
  checks,
  artifacts: [path.relative(output, persisted).replaceAll("\\", "/"), "ACCEPTANCE_MANIFEST.json"]
};
await fs.mkdir(output, { recursive: true });
await fs.writeFile(path.join(output, "ACCEPTANCE_MANIFEST.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify(manifest, null, 2));
if (manifest.status !== "PASS") process.exitCode = 1;
