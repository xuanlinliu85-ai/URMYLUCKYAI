# MIKKO+KEVIN Git-Managed Migration Report

## Scope

- Project: MIKKO+KEVIN
- Canonical path: `projects/MIKKO`
- Migration branch: `codex/migrate-mikko-kevin-git-managed`
- Migration type: governance-only canonicalization
- Base: merged Research OS main tree after PR #5
- Target mode: `git_managed`

This migration makes the existing MIKKO+KEVIN source snapshot canonical in the
URMYLUCKYAI repository. It preserves the current research framework, Fund
Allocation OS implementation, historical artifacts, and directory structure.

## Source workspace verification

- Candidate source workspace: verified
- Matching top-level MIKKO workspaces: 1
- Root Git branch: `master`
- Root Git commits: 0
- Root Git tracked files: 0
- Root workspace content: untracked working material
- Root remotes: 0
- Root worktrees: 1

Two nested source repositories were reviewed as inventory boundaries:

| Boundary | Git state | Commit | Remote |
|---|---|---|---|
| Fund Allocation OS | clean, `main` | `7c4c2c52b18efbe00e469c14e0826cc8b22659ee` | none |
| OPC Skill upstream | clean, `main` | `e7803189a81d7f2cf927feaaeea882f4143b3430` | external upstream |

The root MIKKO workspace has no source commit. The nested commits are not the
canonical commit of the complete MIKKO project in URMYLUCKYAI. The manifest
therefore keeps `source_commit: null`.

## Responsibility boundaries

### MIKKO+KEVIN macro research system

Canonical research framework:

`skills/mikko-kevin-research-system/`

Tracked files: 8.

Framework hierarchy remains:

`facts → Mikko main analysis → optional Kevin overlay → four-step output`

- Mikko remains the single always-on analytical backbone.
- Kevin remains a conditional China/Hong Kong credit, policy, flow, and pricing
  overlay.
- The four-step system remains an output and decision discipline.
- Router additions: 0.

### Fund Allocation OS

Canonical application boundary:

`fund-allocation-os/`

Tracked files in the repository snapshot: 124.

It remains an independent client-first fund-allocation application with its own
API, web app, domain model, migrations, provider adapter, and test suites. It
does not become the Mikko macro framework, and Mikko outputs do not become Fund
Allocation application source.

The nested `upstream/OPC-skill` checkout remains an external, read-only audit
source. Its 219 files are excluded from the canonical repository snapshot.

### Historical outputs and generated artifacts

The repository already contains 34 historical-output files under:

- `fund-aftercare-output/`
- `output/`

They remain historical artifacts and examples. They do not define canonical
MIKKO research logic. This migration imports no new output, history, preview,
database, cache, or generated artifact.

The source-only `outputs/` directory contains three private/generated
spreadsheet-conversion artifacts. All three remain local.

### Cross-project artifacts

One existing MATT narrative document is retained as a cross-project historical
artifact. It is not classified as MIKKO canonical source and is not copied into
the MIKKO Skill or Fund Allocation application.

Daily Review, Analyst Dream Team, and MATT outputs remain outside the MIKKO
canonical source definition.

## Full inventory and comparison

Dependency, cache, nested Git metadata, and build trees were inventoried
separately from effective source candidates.

| Item | Result |
|---|---:|
| Effective source candidate files | 392 |
| Repository tracked files | 168 |
| Common files compared | 168 |
| Byte-identical files | 38 |
| Line-ending-only differences | 130 |
| Semantic content differences | 0 |
| Source-only files | 224 |
| Repository-only files | 0 |
| Imported files | 0 |
| Unresolved conflicts | 0 |

Source-only classification:

| Class | Files | Migration treatment |
|---|---:|---|
| External OPC Skill upstream | 219 | retained as external read-only source |
| Generated `next-env.d.ts` | 1 | retained as generated local file |
| Private runtime SQLite database | 1 | retained locally |
| Private/generated spreadsheet outputs | 3 | retained locally |
| Total | 224 | imported files: 0 |

Repository boundary inventory:

| Boundary | Tracked files |
|---|---:|
| MIKKO+KEVIN research Skill | 8 |
| Fund Allocation OS | 124 |
| Historical outputs | 34 |
| Cross-project MATT artifact | 1 |
| Shared conversion utility | 1 |

## Generated and runtime inventory

Generated trees remain outside Git:

| Path/class | Files |
|---|---:|
| Fund Allocation Python virtual environment | 3,972 |
| Fund Allocation Web `node_modules` | 21,005 |
| Fund Allocation Web `dist` | 75 |
| API pytest cache | 5 |
| API Python bytecode caches | 52 |
| Root runtime `node_modules` junction | external dependency |

Generated files imported: 0.

## Public-safety gate

- Real `.env` files selected for import: 0
- Placeholder `.env.example`: already tracked and contains no credential value
- Secret-like credential values selected for import: 0
- Private runtime databases selected for import: 0
- Private spreadsheet/output artifacts selected for import: 0
- External upstream files selected for import: 0
- New licensed or bulk-source material selected for import: 0

The existing public-safe documentation contains placeholder variable names and
instructions for environment-only credentials. It contains no real key value.

## Project validation

### Fund provider

- Existing command target: `test:providers`
- Executed test: `node --test tests/ifind-provider.test.mjs`
- Result: PASS
- Tests: 2 passed, 0 failed

The existing `ifind:check` command requires a real `IFIND_API_KEY` and is
kept credential-gated. No credential was added to the migration environment.

### Fund Allocation API

- Existing documented workflow: Alembic migration followed by pytest
- Test database: ephemeral local SQLite database
- Alembic revisions applied: 5
- Result: PASS
- Tests: 36 passed, 0 failed
- Existing warning: 1 Starlette/httpx deprecation warning

The ephemeral database and pytest directory were removed after validation.

### Fund Allocation Web

- Existing build target: `vinext build`
- Build result: PASS
- Existing rendered HTML tests: PASS
- Tests: 2 passed, 0 failed

### MIKKO Skill

The MIKKO+KEVIN Skill has no separate build, self-check, or validator command.
Its eight canonical files were included in the content hash comparison and have
zero semantic differences.

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

- MIKKO+KEVIN framework changes: 0
- Router additions: 0
- MATT changes: 0
- Analyst Dream Team changes: 0
- earnings-analysis changes: 0
- PPT changes: 0
- Fund Manager changes: 0
- AA20 functional changes: 0
- DeerFlow runtime changes: 0
- Research Artifact version changes: 0

## Manifest result

`mikko-kevin` changes from `snapshot_managed` to `git_managed`.

The canonical source becomes:

`github:xuanlinliu85-ai/URMYLUCKYAI`.

## Remaining risks

- Existing historical artifacts stay versioned but remain outside the canonical
  framework definition.
- Existing local-path literals in legacy helper/documentation files remain
  unchanged and may require separate portability work.
- The external OPC Skill checkout remains independently versioned and is not
  vendored into this repository.
- Live iFinD compatibility remains credential-gated and belongs to runtime
  operations rather than public migration CI.
