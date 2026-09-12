# RESEARCH_ARTIFACT 1.0.0

This directory is the canonical cross-project research contract for URMYLUCKY Research OS.

Producers create immutable research facts, conclusions, quality flags and provenance. Consumers may transform presentation, article, image or UI shape while preserving the input artifact. The production path uses `provenance.orchestration_mode = direct_research_os` with a null orchestrator. Historical artifacts may retain their original provenance.

## Validate

```bash
npm run artifact:validate
npm run macro:test:offline
npm run ppt:contract:test
```

The examples are synthetic and safe for a public repository:

- `examples/market.json`
- `examples/earnings.json`
- `examples/macro.json`

Existing project-local validators remain compatibility entrypoints and delegate to `validate.mjs`.
