# TASK — Rendered Reference Fidelity Score

## Goal

Replace the current input-strength-derived fidelity score with a measured,
dimension-level comparison between the approved reference render and the final
generated render, while preserving the existing Phase 1 APIs and QA loop.

## Current State

- Status: `DONE`
- Reference Fidelity is currently inferred only from `referenceStrength`.
- Reference and final slide PNGs, layout JSON and Style DNA already exist.
- Visual QA and AutoFix already persist reports and bounded repair plans.

## Expected Behavior

QA reports measured typography, color, layout, density, composition and visual
tone scores, a weighted overall fidelity score, the applicable target, and only
the failing dimensions. Locked dimensions target at least 95.

## Scope

### In scope

- A bounded fidelity measurement module based on persisted render/layout data
- Dimension weights from the Phase 1 style-fidelity contract
- Target resolution from Reference Strength and locks
- QA report, schema and UI integration
- Object/dimension-local repair issues for failed fidelity dimensions
- Unit tests plus one real reference-driven PPTX/render acceptance run

### Out of scope

- Golden Slides
- Vision-model/API dependency
- Prompt Style Interpreter
- Collaboration, Supabase or V2/V3 features
- Replacing the existing native renderer

## Acceptance Criteria

- Fidelity is not calculated solely from requested Reference Strength.
- At least six measured dimensions are persisted with score, target, weight and evidence.
- Overall score follows the documented semantic dimension weights.
- Locks raise the relevant dimension target to at least 95.
- Only failed dimensions create fidelity repair issues.
- Existing V1 acceptance, CJK, editability and QA gates remain passing.
- A real final PPTX is generated, rendered, reopened and visually reviewed.

## Worktree

- Branch: `feature/rendered-fidelity-score`
- Path: `.worktrees/rendered-fidelity-score`

## Verification

- Tests: 19 passed
- TypeScript: passed
- Production build: passed
- Real acceptance project: `project_1c2ae0b5-f586-4dd1-9b3b-62fb525e1c48`
- Acceptance: PASS
- Measured fidelity: 88 / target 70
- Weak dimension correctly isolated: typography 59 / target 70
- Final PPTX reopened: 8 / 8 slides
- Native editability ratio: 1.0
