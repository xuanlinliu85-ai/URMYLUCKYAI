# PPT Factory / Style OS — Master Specification

## 0. Product Goal

Build a reusable PowerPoint production system for Codex that supports two equally important workflows:

1. **Reference-driven reuse**  
   User supplies an existing `.pptx`. The system learns its visual DNA, layout families, chart style, density, typography and storytelling pattern, then reuses that style on new content.

2. **Prompt-driven creation**  
   User supplies materials + natural-language design intent. The system creates a new Style DNA, previews multiple visual directions, and generates a fresh presentation suited to the content and audience.

The product must optimize for:
- visual quality
- editable PPTX output
- Chinese/CJK robustness
- repeatable templates
- reusable style packs
- reference fidelity controls
- update-existing-deck workflow
- automated visual QA
- low “AI-looking deck” score

---

# 1. Core Product Modes

## 1.1 Learn Reference PPT
Input:
- reference `.pptx`
- optional user instruction such as:
  - "learn only the chart style"
  - "keep layout but ignore color"
  - "learn this as my macro research style"

Output:
- `STYLE_DNA.json`
- `LAYOUT_LIBRARY.json`
- `GOLDEN_SLIDES.json`
- `CHART_DNA.json`
- style preview
- style inspector report

## 1.2 Create From Materials
Input:
- Word / Excel / PDF / PPTX / images / URLs / text notes
- audience
- purpose
- page count
- style prompt
- optional system style

Output:
- storyline
- 3-direction style preview
- final editable PPTX
- PDF / PNG optional

## 1.3 Hybrid Reference + Prompt
Final style should be composed as:

`FinalStyle = ReferenceStyle × ReferenceStrength + PromptStyle × PromptStrength + SystemStyleBase`

All major style dimensions must be independently mixable:
- typography
- colors
- layout
- charts
- imagery
- cover
- density
- storytelling

## 1.4 Update Existing PPT
Input:
- previous deck
- new material/data

System:
- preserves locked slides/elements
- updates text/data/charts
- marks slides as `UPDATED`, `UNCHANGED`, or `REVIEW`
- runs regression visual QA

## 1.5 Infographic / Long Image
Transform selected deck content into:
- 9:16 long image
- 4K PNG
- optional social-card variants

---

# 2. Recommended Skill Stack

## 2.1 Primary Product Skill
Create our own:
`ppt-factory`

This is the orchestration layer and should be the only top-level presentation skill the product explicitly invokes.

## 2.2 Recommended Installed / Integrated Skills

### A. slides-grab — HIGH PRIORITY
Purpose:
- style gallery
- reference-template import
- HTML/CSS editing workflow
- slide linting
- PNG/PDF output
- rapid style experimentation
- 95 bundled/resolvable styles

Role in PPT Factory:
- visual prototyping layer
- style preview renderer
- design experimentation layer
- optional visual editor

Do not let slides-grab define the product architecture. Wrap it behind our own adapters.

### B. pptx-design-styles — HIGH PRIORITY
Purpose:
- 30 curated style definitions
- HEX palettes
- typography pairings
- layout rules
- signature visual elements

Role:
- seed `SYSTEM_STYLE_LIBRARY`
- source material for Style DNA presets

### C. ppt-agent-skill — HIGH PRIORITY
Purpose:
- 26 high-end styles
- 18 chart patterns
- typography rules
- failure modes
- style gallery
- content-driven layout ideas

Role:
- reference library for typography/chart/layout rules
- seed visual QA failure rules
- seed style preview patterns

### D. MiMo `pptx-official` — ENGINEERING REFERENCE / OPTIONAL TOOLING
Purpose:
- PPTX read/write
- master/layout handling
- chart support
- XML work
- render/conversion
- diagnostics

Role:
- low-level Office/PPTX engineering reference
- fallback for tricky PowerPoint structures
- not the main style engine

### E. gpt-image2-ppt-skills — OPTIONAL VISUAL MODE
Purpose:
- high-aesthetic slide-image generation
- template mimic from a reference deck
- 10 bundled styles
- image-first layout recreation

Role:
- optional “Visual Hero Mode”
- cover / campaign / highly art-directed deck
- reference-style exploration

Constraint:
Image-first output is NOT the default path because editable text/charts are a core product goal.

### F. Anthropic PPTX Skill — STUDY ONLY
Purpose:
- template analysis
- thumbnail/contact-sheet review
- editing workflow
- visual QA philosophy

Role:
- design and QA ideas only
- do not copy restricted/source-available code directly into the product

---

# 3. System Architecture

```text
INPUT
 ├─ Materials
 ├─ Reference PPT
 └─ Style Prompt
       ↓
PPT ROUTER
       ↓
CONTENT ANALYZER
       ↓
STORYLINE PLANNER
       ↓
REFERENCE STYLE LEARNER ─────┐
PROMPT STYLE INTERPRETER ─────┼─> STYLE MIXER
SYSTEM STYLE LIBRARY ─────────┘
                              ↓
                        FINAL STYLE DNA
                              ↓
                        SLIDE PLANNER
                              ↓
                   GOLDEN SLIDE RETRIEVER
                              ↓
                    VISUAL DIRECTOR
                              ↓
             ┌──────────┬──────────┬──────────┐
             ↓          ↓          ↓
          Native       SVG       Image
             └──────────┴──────────┘
                        ↓
                     PPTX
                        ↓
                     RENDER
                        ↓
                  MACHINE QA
                        ↓
                  VISUAL CRITIC
                        ↓
                   AUTO REPAIR
                        ↓
          PPTX / PDF / PNG / Long Image
```

---

# 4. Style OS

## 4.1 Style DNA
A style is not a fixed template. It is:
- rule set
- preferred ranges
- constraints
- context-dependent choices
- visual vector

Example dimensions:
- minimalism
- modernity
- boldness
- density
- editorial
- financial
- technology
- luxury
- playfulness
- visual impact
- whitespace
- asymmetry

## 4.2 Style Sources
A final style may be composed from:
- system preset
- reference PPT
- natural-language prompt
- saved user style
- custom slider overrides

## 4.3 Style Packs
Each saved style contains:
- `style.json`
- cover preview
- executive-summary preview
- data-slide preview
- preferred layouts
- chart rules
- typography
- image direction
- anti-pattern rules
- example prompts

---

# 5. UI / UX

## Home
Five primary actions:

1. **从材料生成**
2. **学习参考PPT**
3. **参考 + 创作**
4. **更新旧PPT**
5. **我的风格库**

## Style Preview
Before generating the full deck, generate 3 visual directions:
- Direction A
- Direction B
- Direction C

Each direction renders:
- Cover
- Executive Summary
- Data / Chart slide

User can:
- select one
- mix A/B/C
- modify sliders
- save style
- regenerate only one direction

## Style Inspector
After importing a reference PPT, show:
- color distribution
- typography hierarchy
- layout patterns
- chart style
- density
- storytelling model
- whitespace
- visual signature

Allow user to accept/edit each dimension independently.

---

# 6. Style Controls

## Core Sliders
- Reference Strength
- Minimal ↔ Rich
- Classic ↔ Modern
- Conservative ↔ Bold
- Analytical ↔ Emotional
- Dense ↔ Airy
- Grid ↔ Editorial
- Symmetric ↔ Asymmetric
- Text-heavy ↔ Visual-heavy
- Internal Report ↔ External Pitch
- Data-driven ↔ Opinion-driven
- Professional ↔ Marketing
- Low-impact ↔ High-impact
- Financial ↔ Tech
- Minimal ↔ Premium

## Advanced Mixer
Independent reference weights:
- Typography
- Colors
- Layout
- Charts
- Images
- Cover
- Storytelling
- Density

Each dimension supports:
- 0–100 weight
- lock state
- source selection

---

# 7. Reference PPT Learning Pipeline

## Step 1 — Mechanical Extraction
Extract:
- slide size
- fonts
- font sizes
- weights
- text colors
- shape fills
- lines
- positions
- margins
- image dimensions
- chart objects
- masters/layouts
- notes if useful

## Step 2 — Render All Slides
Render PNGs and contact sheet.

## Step 3 — Semantic Visual Analysis
For each slide infer:
- role
- visual hierarchy
- composition
- density
- focal point
- storytelling role
- chart intent
- visual family

## Step 4 — Layout Clustering
Reduce deck to reusable layout families.

Example:
- Cover
- Section
- Executive Summary
- KPI Dashboard
- Hero Chart
- Text + Chart
- 2-chart comparison
- Timeline
- Matrix
- Table
- Strategy
- Ending

## Step 5 — Golden Slide Selection
Score each slide:
- hierarchy 20
- alignment 15
- whitespace 15
- readability 15
- data viz 15
- reusability 10
- uniqueness 10

90+ => Golden Slide
80–89 => Normal reusable layout
<80 => Do not save by default

---

# 8. Golden Slide Library

Each golden slide stores:
- semantic tags
- best content types
- supported data shapes
- preferred density
- style compatibility
- text slots
- chart slots
- layout geometry
- reference preview
- editability level

Retriever score should combine:
- semantic content match
- layout match
- density match
- chart match
- style match
- audience match

If no candidate clears threshold, route to `GENERATIVE_LAYOUT`.

---

# 9. Rendering Strategy

## Native PowerPoint
Use for:
- text
- simple shapes
- tables
- KPI
- standard charts
- editable labels

## SVG
Use for:
- complex diagrams
- timelines
- process flows
- advanced infographics
- custom visualizations

## Image
Use for:
- hero visuals
- cover art
- atmospheric backgrounds
- decorative illustrations

Never use image-generated Chinese text as the default for business slides.

---

# 10. Visual QA

## Machine QA
Check:
- overflow
- overlap
- clipping
- missing fonts
- substituted fonts
- invalid images
- broken SVG
- bounds
- minimum font size
- contrast
- chart label collision
- page consistency

## Visual Critic
Review rendered slide images for:
- hierarchy
- whitespace
- readability
- visual polish
- chart readability
- style consistency
- excessive repetition
- inappropriate decoration
- AI-looking layout patterns

## Anti-AI PPT Score
Penalize:
- repetitive 3-card pages
- pill/badge overload
- excessive rounded rectangles
- blue-purple gradient defaulting
- unnecessary icons
- all-centered layouts
- repeated structure
- dashboard-for-everything
- decorative line clutter
- too many gradients/shadows

Target:
`AI_LOOK_SCORE < 15`

---

# 11. Reference Fidelity

When reference mode is enabled calculate:
- typography fidelity
- color fidelity
- layout fidelity
- chart fidelity
- density fidelity
- visual tone fidelity

Compare actual fidelity to requested `Reference Strength`.

If target is 90 and achieved fidelity is materially below threshold, run another repair pass.

---

# 12. Locks

Support:
- theme lock
- style-dimension lock
- slide lock
- element lock
- chart-style lock
- logo/footer lock
- position lock
- content lock

Locks must survive update workflows.

---

# 13. Data Binding

Support stable placeholders:
- `{{deposit.balance}}`
- `{{aum.total}}`
- `{{fund.return_1y}}`

Allow:
- Excel/CSV mapping
- JSON mapping
- manual input

Charts must be reproducible from bound data.

---

# 14. V1 Scope

V1 must deliver this full happy path:

1. Upload reference PPT
2. Analyze deck
3. Generate Style DNA
4. Show Style Inspector
5. Adjust sliders
6. Upload new materials
7. Generate Storyline
8. Generate 3 style previews
9. Select / mix direction
10. Generate full editable PPTX
11. Render slides
12. Run QA
13. Auto-fix
14. Download PPTX

Do NOT block V1 on:
- multi-user collaboration
- enterprise auth
- real-time coediting
- huge template marketplace
- complex billing
- animation engine

---

# 15. V2

- Golden Slide Library
- update-existing-deck
- data binding
- style mixer
- long-image export
- user preference learning
- saved Style Packs
- search by slide semantics

# 16. V3

- automatic preference learning from manual edits
- team style library
- brand governance
- reusable chart packs
- AI design memory
- collaborative review
- approval workflow

---

# 17. Suggested Tech Stack

Frontend:
- Next.js
- TypeScript
- Tailwind
- component library of Codex choice

Storage:
- Supabase or Postgres + object storage

PPT / slide tooling:
- PptxGenJS
- python-pptx as analysis/fallback
- SVG
- optional slides-grab adapter
- LibreOffice / headless rendering if needed
- Playwright for HTML-style preview workflows

AI contracts:
- structured JSON outputs
- schema validation
- deterministic intermediate artifacts

Main rule:
**The source of truth is structured data and slide plans, not the final PPTX binary.**
