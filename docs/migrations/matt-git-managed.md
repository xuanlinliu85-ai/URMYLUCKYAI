# MATT Git-Managed Migration Report

## Scope

- Project: MATT
- Canonical path: `projects/MATT`
- Migration branch: `codex/migrate-matt-git-managed`
- Migration type: governance-only canonicalization
- Base: merged Research OS main tree after PR #4
- Target mode: `git_managed`

This migration makes the existing MATT snapshot canonical in the URMYLUCKYAI
repository. It preserves the current application, research framework, data
snapshots, tests, and deployment structure.

## Source workspace verification

- Candidate source workspace: verified
- Matching directories reviewed: legacy source workspace and repository snapshot
- Source Git branch: `master`
- Source Git commit: `d49a955177ad455c4d52b1a50df49f6fa9908b4a`
- Source tracked changes: 0
- Source untracked files: 3 files under `skill-build/`
- Source remotes: 0
- Source worktrees: 1
- Latest tracked source commit date: 2026-08-09

The source commit is not verifiable in
`xuanlinliu85-ai/URMYLUCKYAI`, so the manifest keeps
`source_commit: null`.

## Required project documents and commands

Reviewed before migration:

- `README.md`
- `package.json`
- `tests/rendered-html.test.mjs`
- `app/framework-data.ts`
- `app/TradingOS.tsx`
- MATT Skill instructions and `references/matt-framework.md`

Applicable package commands:

- `build`
- `test`

`typecheck` and `self-check` are not defined in the current project, so they
are not applicable to this migration.

## Full inventory and comparison

| Item | Result |
|---|---:|
| Source Git-tracked files | 31 |
| Source untracked candidate files | 3 |
| Repository tracked files | 33 |
| Relative paths compared | 34 |
| Byte-identical files | 17 |
| Line-ending-only differences | 16 |
| Semantic content differences | 0 |
| Source-only files | 1 |
| Repository-only files | 0 |
| Imported files | 0 |
| Unresolved conflicts | 0 |

The 16 line-ending-only results include the three existing `skill-build/`
files. The source-only file is `next-env.d.ts`, which declares itself
framework-generated and references generated `.next/types` output. It remains
outside the canonical source snapshot.

The three source-untracked `skill-build/` files already exist in the repository
with equivalent content:

- `skill-build/urmylucky-narrative-judgment/SKILL.md`
- `skill-build/urmylucky-narrative-judgment/agents/openai.yaml`
- `skill-build/urmylucky-narrative-judgment/references/matt-framework.md`

## Framework preservation

The compared MATT source and repository snapshot have zero semantic differences.
The following fixed responsibilities remain unchanged:

- OB fact layer, TB judgment layer, and execution layer
- payer and budget tracing
- macro-to-industry-to-company transmission
- seven-stage narrative transmission rate
- industry stage and trading-stage separation
- valuation, catalysts, falsification, and observable action conditions
- MATT's unique A-share narrative mapping and execution responsibility

Router additions: 0.

Daily Review market-data system copies: 0.

MATT business-logic changes: 0.

## Public-safety and generated-data gate

- Environment files found in the source workspace: 0
- Secret-like file names among candidate source files: 0
- Credential-content pattern hits among candidate source files: 0
- Office, archive, and licensed-document candidates: 0
- Private files imported: 0
- Generated files imported: 0

The legacy workspace retains ignored build and runtime trees including
`node_modules/`, `.next/`, `.vinext/`, `.wrangler/`, `dist/`,
`tmp/`, `work/`, `.pnpm-store/`, and `tsconfig.tsbuildinfo`. These
generated files remain outside Git.

## Project validation

Dependency preparation:

- `pnpm install --frozen-lockfile`
- pnpm supply-chain checks passed
- required esbuild, sharp, and workerd install scripts were explicitly enabled
  in a temporary local-only test configuration
- temporary dependency configuration is excluded from the migration commit

Project build:

- Command: `pnpm run build`
- Result: PASS
- vinext environments built: client references, server references, RSC, client,
  and SSR

Project test:

- Command: `pnpm run test`
- Result: PASS
- Tests: 2 passed, 0 failed
- Assertions cover server-rendered MATT output, validated data snapshots, and
  starter-asset exclusion

## Root validation

| Check | Result |
|---|---|
| Root build | PASS |
| Root tests | PASS, 11 passed and 0 failed |
| Root lint | PASS, 0 errors and 23 existing warnings |
| Research Artifact validation | PASS, 4 artifacts |
| Macro offline contract | PASS |
| Governance validation | PASS, 8 projects and 9 active Skills |
| PPT contract smoke | PASS, 1 passed and 0 failed |

GitHub Actions Research OS Governance runs again on the migration branch and PR.

## Boundary verification

- Analyst Dream Team changes: 0
- earnings-analysis changes: 0
- PPT changes: 0
- MIKKO changes: 0
- Fund Manager changes: 0
- AA20 functional changes: 0
- DeerFlow runtime changes: 0
- Research Artifact version changes: 0

## Manifest result

`matt` changes from:

`snapshot_managed` to `git_managed`.

The canonical source becomes:

`github:xuanlinliu85-ai/URMYLUCKYAI`.

## Remaining risks

- MATT retains dated public-safe research snapshots by design.
- Runtime market refresh remains outside MATT and continues to belong to the
  Daily Review data system.
- The legacy local workspace remains available as a backup and is no longer the
  canonical source after this PR is merged.
