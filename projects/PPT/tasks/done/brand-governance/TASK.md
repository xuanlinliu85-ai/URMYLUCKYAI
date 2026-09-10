# TASK — Brand Governance local core

Status: `MISSING` for policy/evaluation/enforcement; dependencies classified below.

## Goal

Add a bounded local Phase 3 Brand Governance core on top of the immutable Team
Style Library. Publish versioned tenant/team brand policies, evaluate immutable
deck/style evidence deterministically, and fail closed before release without
changing Storyline, Slide Plans, renderer output, or editable PPTX content.

## Current State and Migration Classification

| Capability | Status | Decision | Evidence / boundary |
| --- | --- | --- | --- |
| Team Style Library | `PARTIAL`; local foundation `DONE` | `WRAP / extend` | Existing tenant/team RBAC, immutable version chains, canonical hashes, CAS repository and fail-closed local identity boundary remain authoritative. |
| Saved Style Packs and Style Mix | `DONE` for local core | `KEEP / consume` | Complete immutable Style Pack snapshots, eight dimension locks and provenance already exist. |
| Deck versions | `PARTIAL`; output core existed, governance authority gap found | `WRAP / extend` | Generation/update outputs retain their version model; create-once manifests, strict resolution and a separate immutable evidence binding close the release-authority gap. |
| Native inspect/layout/chart manifests | `DONE / PARTIAL` but operational | `KEEP / consume` | Renderer already emits inspect NDJSON, per-slide layout JSON, font/image evidence and chart-pack manifests. |
| Technical and visual QA | `PARTIAL` but operational | `WRAP as evidence` | Existing QA reports are evaluated and hash-bound; Governance does not replace QA or repair. |
| Brand policy artifact | `MISSING` | `ADD` | No versioned rules, policy provenance, exemptions or policy hash contract exists. |
| Governance evaluator and release gate | `MISSING` | `ADD` | No deterministic findings/report/decision artifacts bind exact policy, deck and style hashes. |
| Live shared backend/Auth | `PARTIAL / unconfigured` | `KEEP boundary; do not claim` | Ownership and authorization stay inside Team Style Library. No fake Supabase persistence or Auth claim. |

The working modules do not require `REFACTOR`, `MIGRATE`, or `REWRITE`.

## Expected Behavior

- Owner/editor publishes a complete immutable Brand Policy version through the
  Team Style Library boundary; viewer may read/evaluate but may not publish.
- Policy rules cover allowed/required fonts, colors, logo IDs, asset IDs and
  chart-pack IDs, plus required typography/layout/visual-tone locks.
- Every rule has `warning` or `blocking` severity. Narrow immutable exemptions
  name rule IDs, deck-version scope and an auditable non-empty reason.
- The evaluator consumes Style DNA, Style Mix, Slide Plans, native PPTX inspect
  and layout artifacts, renderer evidence/manifests, and the existing QA report.
- An owner/editor publishes a create-once deck-evidence manifest that binds the
  deck manifest/SHA-256 to every persisted evidence hash. Viewer enforcement
  reads expected hashes from this manifest and ignores caller-reported hashes.
- The release gate recomputes all authoritative hashes, binds the exact immutable
  Team Policy artifact hash, Brand Policy content hash, deck SHA-256, Style DNA
  hash and Style Mix hash, and fails closed on missing/malformed/mismatched
  evidence.
- Output artifacts are `BRAND_GOVERNANCE_REPORT.json` and
  `BRAND_GOVERNANCE_DECISION.json`. A blocking unexempted finding or integrity
  failure yields `BLOCKED`; warnings may yield `ALLOW_WITH_WARNINGS`.

## Scope

### In scope

- Brand Policy TypeScript contract, JSON Schema, canonical hashing and runtime
  validation.
- Immutable Team Style Library publication/list/get support for Brand Policies.
- Deterministic evidence collection and rule evaluator.
- Fail-closed enforcement service and hash-bound report/decision artifacts.
- Local API using the existing explicit trusted-local identity mode and Team
  Style Library authorization.
- Unit/integration tests plus a two-case artifact acceptance (one compliant,
  one violating).

### Out of scope

- Renderer, Storyline, Slide Plan, QA scoring/repair or PPTX content changes.
- Inventing/replacing text, fonts, colors, logos, images, assets or chart packs.
- Collaboration, approval workflow, billing, enterprise governance UI or a new
  top-level orchestrator.
- Live Supabase/Auth/RLS/object-storage implementation or acceptance.
- Regenerating the legacy 85-slide deck.

## Inputs

- Immutable Team Brand Policy artifact.
- Immutable deck version ID plus exact PPTX bytes/SHA-256 and authoritative
  deck/evidence manifests.
- Style DNA and Style Mix with expected hashes from the evidence manifest.
- Slide Plans, inspect NDJSON records, per-slide layout records, renderer font,
  image and chart-pack evidence, and QA report as exact hash-bound artifacts.

## Outputs

- Team Style Library Brand Policy artifact versions.
- `BRAND_GOVERNANCE_REPORT.json` with deterministic evidence, findings,
  exemptions, integrity status and exact input bindings.
- `BRAND_GOVERNANCE_DECISION.json` with `ALLOW`, `ALLOW_WITH_WARNINGS`, or
  `BLOCKED`, the report hash and identical release bindings.

## Requirements

- `ppt-factory` remains the only top-level orchestrator.
- Native PPTX remains editable and unchanged.
- Policy hashes and Team artifact hashes are immutable and canonical.
- Unknown fields, invalid rule combinations, duplicate IDs, malformed colors,
  empty reasons, broad unscoped exemptions and broken policy lineage fail.
- Allowed rules evaluate every observed value; required rules prove every named
  value exists. Missing evidence never passes silently.
- Exemptions suppress only their named rule/deck scope and remain visible in the
  report with reason/actor/time provenance.
- Decision timestamps do not affect deterministic report findings/hashes; tests
  inject a clock.

## Edge Cases

- Same policy version with different content conflicts; identical publication
  is idempotent.
- A policy from another tenant/team is rejected.
- Expected vs computed policy/deck/style/evidence hashes mismatch.
- Required fonts/colors/assets/chart packs are absent.
- Unknown fonts/colors/assets/chart packs violate allowlists.
- Lock requirements are false or missing.
- QA status is not `PASS`, inspect/layout artifacts are empty, or native evidence
  cannot be parsed.
- An exemption has an expired timestamp, another deck-version scope, an unknown
  rule ID or an empty audit reason.

## Acceptance Criteria

- Focused tests cover schemas, publication authorization/immutability, every
  rule family, warning/blocking behavior, exemptions, tenant isolation,
  deterministic ordering, hash mismatch and fail-closed missing evidence.
- Artifact acceptance writes one compliant report/decision and one violating
  report/decision; compliant is `ALLOW` or `ALLOW_WITH_WARNINGS`, violating is
  `BLOCKED`.
- `pnpm test`, `pnpm typecheck` and `pnpm build` pass.
- Git diff is reviewed and no generated acceptance output is committed.
- `RESULT.md` records technical and visual artifact inspection evidence.

## Visual Acceptance

Renderer and PPTX content behavior remain unchanged. Acceptance reuses the
existing real editable eight-slide PPTX plus its persisted render/layout/QA
evidence, verifies the source hash remains unchanged, and records derived
evidence explicitly. No long-deck regeneration is required.

## Deliverables

- Brand Policy and governance report/decision schemas.
- Brand Governance library/service and Team Style Library extension.
- Local `/api/team/brand-governance` route.
- Focused tests and bounded two-case acceptance runner.
- `RESULT.md`, full verification evidence and committed implementation.

## Worktree

- Branch: `feature/brand-governance`
- Path: `.worktrees/brand-governance`
