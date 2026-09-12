# Architecture

## Production flow

```text
Data sources
  -> Daily Review / Analyst Dream Team / MIKKO+KEVIN / MATT / earnings-analysis
  -> existing analyst-dream-team-router when routing is required
  -> RESEARCH_ARTIFACT 1.0.0
  -> article / PPT Factory / image / Research UI
```

Research routing is a logical role. The system reuses `analyst-dream-team-router`, selects the minimum required capabilities and creates one artifact. A market-only request stays in Daily Review; an earnings request stays in earnings-analysis; A-share mapping adds MATT only when required.

PPT Factory, articles, images and UI are consumers. They preserve facts, sources, quality flags and provenance and do not rediscover or rewrite the research conclusion.

## Boundaries

- Daily Review owns A-share market collection and daily market review.
- Analyst Dream Team owns multi-framework selection and synthesis.
- MIKKO+KEVIN owns the personal macro framework.
- MATT owns A-share narrative mapping and execution.
- earnings-analysis owns earnings and company research.
- PPT Factory owns presentation rendering and QA.
- Fund Manager remains a registered prototype.
- AA20 remains isolated and frozen.
- DeerFlow remains deferred and optional.

The canonical cross-project interface is `contracts/research-artifact/research-artifact.schema.json`. Direct production artifacts declare `orchestration_mode: direct_research_os` and `orchestrator: null`.
