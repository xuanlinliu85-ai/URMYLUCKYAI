# SKILLS_AND_REFERENCES.md

## Tier 0 — Our Own Orchestrator
### ppt-factory
Status: BUILD
Purpose: single entry point for all PPT work.

---

## Tier 1 — Recommended Integration

### slides-grab
Repository:
https://github.com/NomaDamas/slides-grab

Why:
- Codex support
- ~1.2k stars at verification time
- visual editor
- linting
- template import
- 95 resolvable bundled styles
- PNG/PDF
- HTML/CSS style experimentation

Use for:
- style previews
- template/reference experiments
- visual editing
- QA support

---

### pptx-design-styles
Repository:
https://github.com/corazzon/pptx-design-styles

Why:
- 30 style definitions
- MIT
- HEX/font/layout/signature-element specs
- Codex-compatible skill placement documented

Use for:
- seed style library

---

### ppt-agent-skill
Repository:
https://github.com/Akxan/ppt-agent-skill

Why:
- 26 styles
- 18 charts
- typography rules
- failure modes
- gallery

Use for:
- design rules
- chart rules
- anti-patterns
- style system reference

---

## Tier 2 — Engineering / Optional

### MiMo-Code `pptx-official`
Repository:
https://github.com/XiaomiMiMo/MiMo-Code

Use for:
- PPTX engineering
- masters/layouts
- XML
- diagnostics
- chart/object handling

Do not use as primary visual style engine.

---

### gpt-image2-ppt-skills
Repository:
https://github.com/JuneYaooo/gpt-image2-ppt-skills

Why:
- ~1.1k stars at verification time
- supports reference PPT mimic
- strong image-first aesthetics
- Apache-2.0

Use for:
- optional visual hero mode
- cover style exploration
- image-first concept preview

Caution:
image-first slides are less editable; never make this the default business workflow.

---

## Tier 3 — Study Only

### Anthropic PPTX Skill
Repository:
https://github.com/anthropics/skills/tree/main/skills/pptx

Study:
- thumbnail workflow
- visual QA
- template editing concepts
- design anti-patterns

Do not copy restricted/source-available code into production.

---

## Selection Rule

When user requests:
- strict editability -> native PptxGenJS path
- complex diagram -> SVG path
- art-directed cover -> optional image path
- style exploration -> slides-grab preview path
- strict reference fidelity -> reference learner + native rebuild
