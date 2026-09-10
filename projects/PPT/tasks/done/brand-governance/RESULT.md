# RESULT — Brand Governance local core

## Status

`PASS`

## Outcome

Brand Governance is implemented as a deterministic local Phase 3 release gate
over immutable Team Style Library Brand Policies, authoritative deck versions,
an immutable deck-evidence manifest and persisted QA evidence. `ppt-factory`
remains the only top-level orchestrator.

## Architecture

- Brand Policies are strict immutable Team artifacts with separate Policy
  content-hash and Team-artifact-hash lineages.
- Generation and update outputs have authoritative version manifests. Update
  PPTX files and manifests use create-once writes; the resolver validates exact
  schema, status, project, version, path, slide count and SHA-256 identity.
- An owner or editor publishes one create-once
  `deck-evidence-manifest-<version>.json`. It binds the deck manifest hash,
  deck SHA-256 and the complete Style DNA/Mix, Slide Plan, inspect, layout,
  font, image, chart and QA hash set.
- Viewer enforcement reads expected hashes only from that authoritative
  manifest. Caller-supplied hashes have no authority. Replaced evidence fails
  integrity and produces `BLOCKED`.
- The Next route is a thin adapter over a framework-neutral handler, so the
  executable identity, role and evidence-binding boundary is directly tested.
- Brand rules cover fonts, colors, logo/asset IDs, chart-pack IDs and required
  typography/layout/visual-tone locks. QA failure is a blocking system finding.
- Exemption authorizer and time come from the authenticated publisher and
  service clock; exemptions bind exact immutable deck version IDs.
- Evidence contracts require exact unique native `slide:object` coverage for
  fonts, images and charts across every authoritative slide.

## Root-cause corrections from audit

1. Deck exemptions now resolve against authoritative generation/update
   manifests and immutable PPTX bytes.
2. Evidence uses strict recursive contracts and exact object coverage.
3. Exemption provenance is server-derived.
4. Policy-content and Team-artifact lineages are independent and validated.
5. Raw drafts reject unknown nested fields through domain `INVALID` errors.
6. API security behavior is executable outside Next, and acceptance uses an
   existing real editable 8-slide PPTX.
7. Update manifests and outputs have create-once semantics and strict project
   identity.
8. A separate authoritative evidence manifest removes caller-reported hash and
   mutable-final-artifact TOCTOU authority.

## Verification

- Focused Brand Governance + Team Library tests: `19/19 PASS`.
- Full `pnpm test`: `134/134 PASS`.
- `pnpm typecheck`: `PASS`.
- `pnpm build`: `PASS`; Brand Governance, generate and update routes are in the
  production route manifest.
- `git diff --check`: `PASS`.
- Secret scan: no credential material introduced.
- Independent final read-only audit: `PASS`; authority resolution, native-only
  rule evidence, tenant/team binding and acceptance provenance were verified.

## Real PPT acceptance

`scripts/run-brand-governance-acceptance.mjs`: `PASS`.

- Reused the existing real 8-slide editable PPTX; editable ratio is `1.0`.
- Source SHA-256 before and after remained
  `280622daf4e8bf2bf9bb0d05b5195460ee65fd1a5d687280865164ed4d9a563a`.
- Existing persisted Style DNA, Style Mix, Slide Plans, inspect, layouts and QA
  were used. Missing renderer evidence was transparently derived from persisted
  native layout/inspect records and labelled `derived`.
- Derived chart records use `unclassified-native`; the compliant policy checks
  the evidenced Microsoft YaHei font and makes no Chart Pack compliance claim.
- Compliant case: `COMPLIANT / ALLOW`.
- QA-violating case: `VIOLATING / BLOCKED`.
- Report and decision hashes match exactly, and the compliant report binds the
  authoritative deck and evidence manifest hashes.
- No long deck or 85-slide rerun occurred.

## Files and contracts

- Core: `lib/brand-policy.ts`, `lib/brand-governance.ts`,
  `lib/brand-governance-api.ts`, `lib/deck-version-binding.ts`.
- Routes: Brand Governance plus authoritative generation/update publication.
- Schemas: Brand Policy draft/version, governance report/decision/acceptance,
  deck generation manifest and deck evidence manifest.
- Tests: policy hashing, lineage, roles, exemptions, strict evidence,
  immutable generation/update resolution, executable API and schema contracts.

## External boundary

Local Brand Governance is complete. Live Supabase/Auth/RLS deployment remains
pending until the user provides server-only Supabase configuration. The local
identity-header mode stays disabled by default and is intended for trusted local
development.

## Recommendation

`MERGE`

Next dependency-ordered worktree: Collaborative Review, followed by Approval
Workflow and AI Design Memory.
