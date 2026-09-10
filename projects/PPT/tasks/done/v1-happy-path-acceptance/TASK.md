# TASK — V1 Happy Path Acceptance

## Goal

Produce one reproducible, app-driven Phase 1 acceptance run without rewriting
the existing architecture.

## Current State

Status: `PASS`

Every major stage exists, but the full chain and required 90-vs-50 evidence have
not been captured in one repeatable run.

## Expected Behavior

```text
Create Project
→ Learn an approved reference style
→ Render all reference slides
→ Generate Style DNA
→ Generate Reference Strength 90 preview
→ Generate Reference Strength 50 preview
→ Ingest unrelated new material
→ Generate Storyline and Slide Plan
→ Generate distinct A/B/C previews
→ Select B
→ Generate editable PPTX
→ Render all slides
→ Run QA
→ Run local Auto Fix only if needed
→ Export acceptance manifest
```

## Scope

### In scope

- Reuse existing APIs/adapters and artifact storage
- Add a reproducible local acceptance runner
- Persist all required JSON evidence
- Measure visible 90-vs-50 style differences
- Verify PPTX re-open, CJK text and editable-object ratio
- Fix only blockers exposed by this run

### Out of scope

- Golden Slide marketplace
- Collaboration, auth, billing or cloud storage
- Animation
- Advanced multi-agent orchestration
- Using the user's 85-slide practice deck as a style template

## Inputs

- Approved reference style deck: the generated bank-internal-report trial deck
- WPS compatibility-only regression deck: the 85-slide practice file
- Unrelated new material fixture committed under `tests/fixtures/`

## Outputs

- Editable PPTX
- All-slide PNG renders and contact sheet
- `STYLE_DNA.json`
- `CONTENT_ANALYSIS.json`
- `STORYLINE.json`
- `SLIDE_PLAN.json`
- `STYLE_MIX.json`
- `QA_REPORT.json`
- `REPAIR_PLAN.json` when repair is triggered
- `ACCEPTANCE_MANIFEST.json`
- 90-vs-50 comparison previews

## Requirements

- Keep `ppt-factory` as the only top-level orchestrator
- Keep Native PPT first and CJK business text editable
- Renderer follows Slide Plan rather than recreating the narrative
- A/B/C differ at composition level
- Maximum three local repair passes with rollback

## Edge Cases

- WPS-authored charts with negative axis identifiers
- Chinese filenames and CJK font fallback
- Reference upload used for compatibility-only rather than style learning
- No repair required after initial QA

## Acceptance Criteria

- Existing tests, typecheck and build pass
- Reference deck renders completely
- Strength 90 and 50 previews have a recorded measurable difference and are
  visually distinguishable
- A/B/C each contains cover, executive summary and data page with different
  composition systems
- Selected B generates an openable editable PPTX
- At least 80% of normal business elements are native/editable
- No obvious CJK corruption or slide overflow
- QA report is generated; Auto Fix runs when an auto-fixable issue is present

## Visual Acceptance

- One dominant attention anchor per slide
- No repetitive three-card default across more than 25% of pages
- AI-look score at most 20
- Overall QA at least 85 and readability at least 85

## Deliverables

- Code and tests in the task worktree
- Real PPT and rendered evidence in ignored generated storage
- Worktree `RESULT.md`

## Worktree

- Branch: `feature/v1-happy-path-acceptance`
- Path: `.worktrees/v1-happy-path-acceptance`
