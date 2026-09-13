# Fund Manager Git-Managed Migration Report

## Scope

- Project: Fund Manager
- Canonical path: `projects/fund-manager`
- Migration branch: `codex/migrate-fund-manager-git-managed`
- Migration type: governance-only canonicalization
- Base: merged Research OS main tree after PR #6
- Product status: `prototype`
- Target mode: `git_managed`

This migration makes the existing public-safe Fund Manager snapshot canonical in
the URMYLUCKYAI repository. The product remains a prototype. Its current MCP
client helpers and analysis snapshot remain unchanged.

## Source workspace verification

- Candidate source workspace: `C:\Users\urmylucky\Documents\基金经理`
- Matching Fund Manager workspaces: 1
- Root Git branch: `master`
- Root Git commits: 0
- Root Git tracked files: 0
- Root workspace content: untracked experimental material
- Root remotes: 0
- Root worktrees: 1

The source workspace has no commit that can be verified in
`xuanlinliu85-ai/URMYLUCKYAI`. The manifest therefore keeps
`source_commit: null`.

## Current capability boundary

The maintainable prototype boundary contains four MCP client files:

- `call-tool.mjs` connects to the configured iFinD MCP endpoint, calls one named
  tool, and optionally writes the JSON response to a caller-selected path.
- `list-tools.mjs` connects to the same endpoint and lists available MCP tools.
- `package.json` declares the Model Context Protocol SDK dependency.
- `pnpm-lock.yaml` fixes the current dependency graph.

The client reads `IFIND_API_KEY` from the process environment. The repository
contains the environment-variable reference and contains no credential value.

`analysis_data/csi500_mcp.json` is an existing analysis snapshot. It remains an
experimental data artifact rather than application source. Future private fund
data, licensed iFinD responses, runtime results, caches, and bulk analysis data
remain outside the canonical source boundary.

The prototype currently has no Web UI, Skill, Router, database, Research
Artifact producer, portfolio-management workflow, or production service.

## Full inventory and comparison

Dependency, licensed runtime, Git metadata, and data artifacts were inventoried
separately from maintainable source candidates.

| Item | Result |
|---|---:|
| Effective candidate files | 5 |
| Repository tracked files | 5 |
| Common files compared | 5 |
| Byte-identical files | 0 |
| Line-ending-only differences | 5 |
| Semantic content differences | 0 |
| Source-only candidate files | 0 |
| Repository-only files | 0 |
| Imported files | 0 |
| Unresolved conflicts | 0 |

The source files use LF and the repository snapshot uses CRLF. Normalized
content is identical for all five files.

## Local-only and generated inventory

| Class | Files | Bytes | Migration treatment |
|---|---:|---:|---|
| iFinD/Python runtime trees | 186 | 287,044,274 | retained locally |
| MCP `node_modules` dependencies | 3,496 | 15,330,487 | retained locally |
| Source workspace Git metadata | 181 | 26,287,335 | retained locally |
| Existing analysis snapshot | 1 | 627,865 | compared; no new import |

- Imported files: 0
- Source-only skipped files: 3,863
- Private or licensed runtime files selected for import: 0
- Generated or dependency files selected for import: 0
- New analysis/output/history files selected for import: 0

## Public-safety gate

- Real environment files selected for import: 0
- Secret-like credential values in candidate files: 0
- OpenAI key patterns in candidate files: 0
- Bearer token patterns in candidate files: 0
- Private fund records selected for import: 0
- New iFinD data selected for import: 0
- Runtime results, caches, temporary files, and bulk analysis data selected for
  import: 0

Two credential-name matches are the intended
`process.env.IFIND_API_KEY` references. They contain no value.

## Project validation

`projects/fund-manager/.mcp-client/package.json` defines dependencies only. The
current Fund Manager prototype defines no test, build, self-check, or validator
command. Project-specific command execution is therefore not applicable to this
migration. Live MCP connectivity remains credential-gated runtime activity.

## Root validation

| Check | Result |
|---|---|
| Root build | PASS |
| Root tests | PASS, 11 passed and 0 failed |
| Root lint | PASS, 0 errors and 23 existing warnings |
| Research Artifact validation | PASS, 4 artifacts |
| Macro offline contract | PASS |
| Governance validation | PASS, 8 projects and 9 active Skills |
| PPT contract | PASS, 1 passed and 0 failed |

GitHub Actions Research OS Governance runs again on the migration branch and PR.

## Boundary verification

- Fund Manager product status: `prototype`
- Fund Manager business-logic changes: 0
- New product capabilities: 0
- Daily Review changes: 0
- PPT changes: 0
- earnings-analysis changes: 0
- Analyst Dream Team changes: 0
- MATT changes: 0
- MIKKO+KEVIN changes: 0
- AA20 functional changes: 0
- DeerFlow runtime changes: 0
- Research Artifact version changes: 0

## Manifest result

`fund-manager.sync_mode` changes from `snapshot_managed` to `git_managed`.

`fund-manager.status` remains `prototype`.

The canonical source becomes:

`github:xuanlinliu85-ai/URMYLUCKYAI`.

## Remaining risks

- Live iFinD connectivity depends on an environment-provided credential and the
  current endpoint.
- The existing CSI 500 JSON is an experimental snapshot and does not define the
  product's canonical application logic.
- The prototype has helper-level MCP capability and requires separate,
  explicitly scoped product work before any production designation.
