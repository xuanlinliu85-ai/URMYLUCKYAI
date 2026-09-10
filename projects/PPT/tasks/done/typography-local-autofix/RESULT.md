# RESULT — Typography Local AutoFix

## Status

`PASS` — merged and archived.

## Summary

MIGRATION_PLAN Step 4 now has a real object-local typography repair path. QA
issues carry the failed dimension, named native text families and a measured
font-scale hint. The renderer changes only those objects and the API retains
the attempt only when the target dimension improves; otherwise it restores the
original PPTX/render.

## Implementation

- Corrected typography evidence to read actual paragraph runs instead of the
  element-level default size.
- Weighted display-size runs so title/KPI hierarchy is not hidden by body text.
- Added dimension, object names and bounded adjustment to QA/Repair Plan.
- Derived the adjustment direction from reference/output mean size.
- Applied scaling only to title/value/label/claim/answer/lead/callout families.
- Preserved global controls for typography-only repair.
- Retained failed attempt PPTX/render before rollback for auditability.
- Rolled back when target score was unchanged or overall score declined.

## Verification

- 22 tests passed; TypeScript and production build passed.
- Normal project `project_d8fd39d6-604a-4724-8c77-ba1c98cee29e`: PASS.
- QA overall 93; readability 96; measured fidelity 96.
- Final/reopened 8 / 8 slides; 108 native objects; editability 1.0; CJK intact.

## Strict Lock Exercise

- Project: `project_6f39296c-09d6-4e15-95dc-1231dae820b5`.
- Typography lock target: 97; measured score: 96.1.
- Suggested local scale: 0.93.
- Retained attempt proves `cover-title` changed from 46 to 43 while position,
  color, layout and body text remained unchanged.
- Target score did not improve, so the system preserved attempt evidence and
  restored the original deck. This satisfies the documented rollback rule.

## Visual QA

Original and attempted contact sheets were reviewed. The attempted hierarchy
was slightly weaker, so rollback was the correct aesthetic decision.

## Handoff

- Editable acceptance deck: `generated/showcase/typography-local-autofix/typography-autofix-acceptance.pptx`
- Normal contact sheet: `generated/showcase/typography-local-autofix/contact-sheet.webp`
- QA and acceptance evidence: `qa-report.json`, `acceptance-manifest.json`
- Rollback evidence: `repair-plan.json`, `repair-event-1.json`,
  `repair-original.webp`, `repair-attempt.webp`, `repair-attempt.pptx`

## Next Step

Continue MIGRATION_PLAN Step 4 in order with rendered contrast measurement and
local contrast repair. Do not start Step 5 Reference Learner yet.
