# Image distortion local repair

Status: DONE

Merged to master and evidence archived under
`generated/showcase/image-distortion-local-repair/`.
Branch: `fix/image-distortion-local-repair`
Baseline: `a9a9fa0`
Classification: `PARTIAL`

## Goal

Extend the existing Step 4 QA/AutoFix loop with image-specific technical evidence. Detect invalid assets, implausible/stretching aspect ratios, and slide overflow from persisted layout/inspect metadata. Emit slide/object/dimension targets and repair only the named image fit/crop/position, with the existing three-pass cap and target-score rollback.

## Boundaries

- Keep `ppt-factory` as the only top-level orchestrator.
- Extend the working visual-QA and native-PPTX adapters; do not rewrite them.
- Preserve Storyline, Slide Plan, CJK business text and non-target objects.
- Do not rasterize business text.
- Use an explicit image QA fixture because the normal V1 acceptance deck contains no image objects.

## Acceptance

- `technical.imageDistortion` is persisted alongside `technical.contrast`.
- Findings name slide, image object, reason, source/display ratios and bounded repair.
- AutoFix targets `imageDistortion`, changes only the named image geometry/fit, and compares the target technical score before retaining a pass.
- Real editable PPTX generated, all slides rendered, technical QA run, and before/after previews visually inspected.
- `pnpm test`, `pnpm typecheck`, `pnpm build`, diff review and `RESULT.md` pass.
