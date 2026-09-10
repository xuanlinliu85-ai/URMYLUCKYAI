# RESULT — Reference slide role inference

Status: PASS / MERGED
Recommendation: COMPLETE; merged after API/schema and visual-evidence review.

## Outcome

- Extended the existing OOXML reference analyzer; no module was replaced.
- Every reference slide now receives one deterministic semantic role from:
  `cover`, `agenda_section`, `summary`, `evidence_data`, `comparison`,
  `process_timeline`, `closing`, or honest low-confidence `other`.
- Each result persists `confidence`, an explainable evidence list, and source
  signals: title/text volume, numeric tokens, native charts/tables/images,
  shapes/connectors, deck position, and optional rendered-page luminance,
  whitespace proxy, and entropy.
- The reference API now renders first and then supplies `renderDir` to the
  analyzer, so XML and rendered-page facts are combined in one artifact.
- `reference-analysis.json` and reference Style DNA both persist the per-slide
  results. Older Style DNA producers remain compatible through the optional
  field and `analysis.slideRoles ?? []` default.
- Compatibility-only uploads still activate the selected system style, not the
  analyzed deck's reference Style DNA.
- Rendered page measurement loads Sharp only when `renderDir` is supplied, so
  XML-only analysis remains a lightweight supported path.

## Lightweight real-deck acceptance

Fixed sample:

- `generated/showcase/rendered-fidelity-score/fidelity-acceptance.pptx`
- `generated/showcase/rendered-fidelity-score/contact-sheet.webp`
- Existing manifest confirms 8/8 reopened slides, editable ratio 1.0, intact
  CJK, QA `PASS`, overall 92.

Role smoke report:

- Slides analyzed: 8
- Role records: 8/8
- Slides with non-empty explainable evidence: 8/8
- Distribution: `cover=1`, `evidence_data=5`,
  `process_timeline=1`, `other=1`
- Determinism and ambiguous-page fallback are covered by committed tests.

Manual contact-sheet spot-check:

- Slide 1 is correctly represented by the `cover` family.
- Slide 4 is a native data/evidence page with a column chart and KPI callout.
- Slide 6 is a two-stage process/timeline composition.
- Slide 8 is a sparse concluding recommendation page; `other` is an honest
  result because it contains no explicit closing keyword.

An already-generated local milestone artifact also contains 85/85 rendered
page measurements and role records, including detected covers and low-entropy
section dividers. It was not rerun for this final review. The legacy deck is an
engineering compatibility sample only and does not define or activate the
user's desired style.

## Checks

- `pnpm test`: PASS, 42/42.
- `pnpm typecheck`: PASS.
- `pnpm build`: PASS; production routes include `/api/reference/analyze`.
- JSON schema parse/contract checks: PASS.
- `git diff --check`: PASS (line-ending notices only).
- Generated probes and user files: not staged for commit.

## Limitations

- Role inference is deterministic local heuristics, not semantic vision. It can
  prefer `evidence_data` in dense, metric-heavy decks and deliberately returns
  `other` when evidence is weak.
- Render statistics are coarse page-level evidence; layout-family clustering,
  typography hierarchy measurement and Golden Slides remain deferred.
- The lightweight archived 8-slide sample retains a contact sheet but not its
  individual PNG files; its final smoke used OOXML roles plus the existing
  visual contact sheet. Render-evidence wiring is covered by the API contract
  test and the pre-existing local milestone artifact.

## Resource policy

Ordinary iterations should use unit/contract tests plus one fixed deck of no
more than eight slides. The 85-slide legacy deck is reserved for a single
milestone regression and must not be rerun for routine changes.

## Merge hotspots

- `adapters/reference-analyzer/index.ts`
- `app/api/reference/analyze/route.ts`
- `lib/types.ts`
- `lib/style/style-dna.ts`
- `schemas/style-dna.schema.json`

Preserve render-first ordering in the API, the compatibility-only active-style
boundary, and the optional Style DNA field when resolving later Step 5 work.
Do not fold layout-family clustering or Golden Slide selection into this merge.
