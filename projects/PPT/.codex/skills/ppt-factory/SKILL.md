---
name: ppt-factory
description: Build and operate the PPT Factory / Style OS workflow for reference-driven or prompt-driven editable PowerPoint generation. Use for PPT Factory projects, Style DNA extraction, A/B/C style previews, structured slide planning, reference-fidelity controls, and render/QA/repair pipelines; external PPT tools remain bounded adapters.
---

# PPT Factory

Act as the single top-level orchestrator. External slide skills, repositories, renderers, and image systems may provide bounded capabilities through adapters, but they must not independently choose the deck storyline, global style, or workflow.

## Phase routing

Before acting, identify whether the request is reference-driven, prompt-driven, or hybrid. Keep important decisions in JSON artifacts under the project stages `input`, `analysis`, `style`, `storyline`, `slide-plans`, `render`, `qa`, and `output`.

For the current V1 build, read [references/phase-1.md](references/phase-1.md). Do not implement V2/V3 features until the V1 happy path passes its quality gate.

When extracting a reference style or enforcing similarity, read [references/style-and-fidelity.md](references/style-and-fidelity.md). When generating or repairing a deck, read [references/render-and-qa.md](references/render-and-qa.md).

## Invariants

- Default to editable PowerPoint objects: Native PPT first, SVG second, raster images only for hero artwork, backgrounds, and decoration.
- Keep Chinese/CJK business text, numbers, tables, and chart labels native and validate them after rendering.
- Generate three visibly distinct directions, each with cover, executive-summary, and data slides, before a full deck.
- Expose Reference Strength, Phase 1 style sliders, advanced dimension weights, and locks. Locked dimensions must survive regeneration.
- Run Render -> Technical QA -> Visual QA -> Auto Repair, with at most three repair passes and rollback when a pass lowers the score.
- Do not use a hidden prompt as the only source of truth.

## Authorization boundary

Ask for credentials or external configuration only when the selected workflow actually needs them. Never expose API keys. A local file-backed prototype may proceed without Supabase; persistent multi-user storage requires explicit Supabase configuration.
