# URMYLUCKY Research OS

URMYLUCKY Research OS is a Git-managed personal financial research system. It connects market data, specialist research frameworks, earnings analysis and presentation production through one canonical `RESEARCH_ARTIFACT 1.0.0` contract.

```text
data -> specialist research -> existing research router -> RESEARCH_ARTIFACT -> article / PPT / image / UI
```

The production path is directly orchestrated by Research OS. DeerFlow is a deferred optional orchestrator. AA20 remains an isolated frozen product.

## Project map

| System | Path | Status | Unique responsibility |
| --- | --- | --- | --- |
| Daily Review | `.` | active | A-share market data, snapshots and daily review |
| Analyst Dream Team | `projects/analyst-research` | active | Existing multi-framework research router |
| MIKKO+KEVIN | `projects/MIKKO` | active | Personal macro framework and conditional China/HK overlay |
| MATT | `projects/MATT` | active | A-share narrative mapping and execution |
| earnings-analysis | `projects/earnings-images` | active | Earnings facts, expectation gaps and company research |
| PPT Factory | `projects/PPT` | active | Presentation rendering and visual QA |
| Fund Manager | `projects/fund-manager` | prototype | Fund research prototype |
| AA20 | `projects/AA20` | isolated_frozen | Independent product; excluded from Research OS changes and CI |

The machine-readable source is [`PROJECT_REGISTRY.json`](PROJECT_REGISTRY.json). Snapshot provenance and migration state are recorded in [`projects/SNAPSHOT_MANIFEST.json`](projects/SNAPSHOT_MANIFEST.json).

## Research Artifact

The canonical contract lives in [`contracts/research-artifact`](contracts/research-artifact). Producers own research; consumers preserve the artifact and only transform presentation shape.

```bash
npm run artifact:validate
npm run macro:test:offline
npm run ppt:contract:test
```

## Develop and test

Requirements: Node.js `>=22.13.0`; root package manager: npm.

```bash
npm ci
npm run build
npm test
npm run lint
npm run governance:validate
```

Each nested snapshot keeps its own package manager and lockfile. Root lint and CI treat project snapshots as independent boundaries.

## Run Daily Review

```bash
npm run data:update
npm run artifact:export
npm run dev
```

Live iFinD access requires local environment credentials. Public source control contains configuration names and risk policy only.

## Run earnings-analysis

Invoke the canonical Skill at `projects/earnings-images/.agents/skills/earnings-analysis`. A completed run can export `RESEARCH_ARTIFACT.json` through its existing `scripts/export_research_artifact.py` entrypoint.

## Send research to PPT Factory

Generate a valid Research Artifact, then provide it to the existing PPT Factory Research Artifact consumer. The contract smoke test verifies that the consumer preserves the canonical input.

## Governance

- [Architecture](docs/ARCHITECTURE.md)
- [Project status](docs/PROJECT_STATUS.md)
- [Data source policy](docs/DATA_SOURCE_POLICY.md)
- [Development workflow](docs/DEVELOPMENT_WORKFLOW.md)
- [Generated data policy](docs/GENERATED_DATA_POLICY.md)
- [DeerFlow deferred status](docs/DEERFLOW_DEFERRED.md)
- [Hosting and starter details](docs/HOSTING.md)

Repository content is public-safe source code, Skills, schemas, prompts, tests, synthetic fixtures and governance documentation. Secrets, private business material, customer data, dynamic databases, caches and large generated outputs stay outside Git.
