# CODEX_SETUP.md

## Goal
Set up Codex to build `PPT Factory / Style OS`.

## Important Rule
Do NOT install every PPT skill and let them all independently trigger.

Use:
- one top-level orchestrator: `ppt-factory`
- adapters around external tools
- external skills as references or bounded subsystems

---

# 1. Required Local Runtime

Recommended:
- Node.js >= 20
- npm / pnpm
- Python 3.11+
- LibreOffice
- Playwright + Chromium
- Git

Suggested JS packages:
- pptxgenjs
- zod
- sharp
- fast-xml-parser
- uuid

Suggested Python packages:
- python-pptx
- lxml
- pillow

---

# 2. Recommended Skills / Repositories

## A. slides-grab — install first
Why:
- Codex installation instructions
- 1k+ stars
- visual editor
- slide linter
- template import
- 90+ styles
- PNG/PDF export

Preferred installation path:
```bash
npm install slides-grab
npx playwright install chromium
npx slides-grab install-skills --target all --scope user
```

Alternative shared skill install:
```bash
npx skills add ./node_modules/slides-grab -g -a codex --yes --copy --full-depth
```

Use it behind:
`adapters/slides-grab/`

Do not make its HTML model the only rendering path.

---

## B. pptx-design-styles
Clone/read into project references:
```bash
git clone https://github.com/corazzon/pptx-design-styles.git external/pptx-design-styles
```

Extract design presets into:
`references/system-styles/`

Do not depend on the repository at runtime after normalization.

---

## C. ppt-agent-skill
```bash
git clone https://github.com/Akxan/ppt-agent-skill.git external/ppt-agent-skill
```

Study and normalize:
- style categories
- typography rules
- chart patterns
- failure modes
- gallery logic

Import concepts into our schemas, not as uncontrolled runtime prompts.

---

## D. MiMo-Code pptx-official
Optional:
```bash
git clone https://github.com/XiaomiMiMo/MiMo-Code.git external/MiMo-Code
```

Study:
`packages/opencode/src/skill/builtin/.bundle/pptx-official/`

Use for:
- Office XML ideas
- PPTX diagnostics
- masters/layouts
- charts
- notes
- rendering workflows

Do not use MiMo as the style engine.

---

## E. gpt-image2-ppt-skills — optional visual mode
```bash
git clone https://github.com/JuneYaooo/gpt-image2-ppt-skills.git external/gpt-image2-ppt-skills
```

Use only for:
- reference-style visual exploration
- hero cover
- highly art-directed slides
- optional image-first mode

Default output path remains editable PPT.

---

## F. Anthropic skills/pptx — study only
Do not vendor/copy restricted code into production.
Study workflow and QA philosophy only.

---

# 3. Create Our Main Skill

Path:
`.codex/skills/ppt-factory/`

Required:
```text
ppt-factory/
├── SKILL.md
├── workflows/
├── references/
├── schemas/
├── scripts/
├── assets/
└── adapters/
```

The top-level skill decides:
- mode
- input validation
- which workflow to call
- which style source to use
- whether to use slides-grab
- whether to use native PPTX
- whether to use optional image mode

---

# 4. Build Order

## Milestone 1
- project shell
- upload
- PPT parser
- slide rendering
- contact sheet

## Milestone 2
- Style DNA schema
- Style Inspector
- sliders
- style presets

## Milestone 3
- materials parser
- Storyline JSON
- Slide Plan JSON

## Milestone 4
- 3-style preview
- style mixing
- save style

## Milestone 5
- editable PPTX renderer
- render-after-generate
- visual QA
- auto repair

## Milestone 6
- reference fidelity
- lock system
- update old PPT

---

# 5. Engineering Rule

Every stage writes a JSON artifact.

Example:
```text
input/
analysis/
style/
storyline/
slide-plans/
render/
qa/
output/
```

Never rely on hidden prompt state as the only record of a decision.

---

# 6. Recommended First Demo

Use one real reference deck.

Demonstrate:
1. upload reference
2. extract style
3. change reference-strength slider from 90 to 50
4. upload unrelated new content
5. generate A/B/C previews
6. select B
7. export editable PPTX
8. visually compare with requested style
