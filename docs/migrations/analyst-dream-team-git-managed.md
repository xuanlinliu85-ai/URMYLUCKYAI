# Analyst Dream Team Git-Managed Migration Report

Date: 2026-09-13  
Project: `analyst-dream-team`  
Canonical path: `projects/analyst-research`  
Migration branch: `codex/migrate-analyst-dream-team-git-managed`  
Baseline: `c4a5901cd8661d95433274bea43818b1e21172a9`

## Source verification

- Source workspace: `<LOCAL_WORKSPACE>`
- Source repository: clean local Git repository with no configured remote
- Source branch: `master`
- Source commit: `e422767785fd35db69ce2041af8355e7a5d92e02`
- Source status: clean
- Additional source worktrees: 0
- Alternate source candidates: none
- Manifest `source_commit`: `null`, because the local source commit is not resolvable in `xuanlinliu85-ai/URMYLUCKYAI`

## Inventory and comparison

- Source Git-tracked files: 221
- Repository snapshot Git-tracked files: 221
- Raw-hash identical files: 11
- Line-ending-only differences: 207
- Repository-newer files: 3
- Source-only files: 0
- Repository-only files: 0
- Missing repository source files: 0

The three semantic differences were retained from the repository because they are
the V1.1 canonical Research Artifact and direct Research OS orchestration updates:

- `integration_sources/earnings/export_research_artifact.py`
- `integration_sources/ppt/research-artifact.mjs`
- `integration_sources/ppt/research-artifact.test.mjs`

The repository versions remove DeerFlow from the active artifact path, consume the
root canonical validator and verify that the PPT consumer does not mutate an
artifact. No Analyst Dream Team business source file required copying.

## Public-safety gate

- Files scanned: 221
- Total tracked size: 1,381,925 bytes
- Tracked environment templates: `.env.example` only
- Local `.env.local`: ignored and retained outside Git
- Binary office or archive files: 0
- OpenAI, GitHub, AWS, bearer-token, private-key or generic credential pattern hits: 0
- Newly imported corpus or research files: 0

The 16 existing JSONL corpus files are the already tracked, corpus-audited public
source dataset in the repository snapshot. This migration does not add paid
research text, customer information, internal operating data or private runtime
material.

## Active discovery, Registry and Corpus boundaries

- Unique active discovery root: `.agents/skills`
- Active Skills: 8
- Registered analysts: 7
- Active routers: 1 (`analyst-dream-team-router`)
- Corpus audit entries: 7
- Active DeerFlow Skills: 0
- Non-active template, legacy and staging `SKILL.md` files: 7, all outside the active discovery root

The active Skill set, project manifest, Analyst Registry and Corpus Audit resolve
to the same seven analysts plus the single Router. Historical DeerFlow reports,
blueprints and integration evidence remain outside `.agents/skills` and receive no
runtime change.

## Migration changes

- Updated `projects/SNAPSHOT_MANIFEST.json` for `analyst-dream-team`
- Set `source` to `github:xuanlinliu85-ai/URMYLUCKYAI`
- Set `canonical` to `true`
- Set `sync_mode` to `git_managed`
- Added this migration report
- Imported business files: 0
- Modified Analyst Dream Team business files: 0

## Project validation

- `tools/self_check.py`: PASS
- Self-check analysts: 7
- Self-check Router: ready
- Self-check Corpus Gate: ready
- Registry / manifest / corpus set audit: PASS
- Pytest: PASS, 14/14
- Ruff baseline: 2 existing fixable findings in historical integration mirrors

The first pytest invocation passed 12 tests and encountered two fixture setup
errors because the shared Windows pytest temporary directory was inaccessible.
Re-running all tests with an isolated worktree-local `--basetemp` passed 14/14.

The Ruff findings are an import-order rule in the historical DeerFlow integration
runner and a `datetime.UTC` style rule in the earnings integration mirror. This
migration preserves both files because it changes neither business logic nor
historical integration evidence.

## Root validation

- Root `npm ci`: PASS; lockfile unchanged
- Root dependency audit notice: 24 existing findings (1 low, 6 moderate, 16 high, 1 critical)
- Root `npm run build`: PASS
- Root `npm test`: PASS, 11/11
- Root `npm run lint`: PASS with 23 pre-existing warnings and 0 errors
- Root `npm run macro:test:offline`: PASS
- Root `npm run artifact:validate`: PASS, 4 artifacts
- Root `npm run governance:validate`: PASS, 8 projects and 9 active Skills
- Root `npm run ppt:contract:test`: PASS, 1/1

Dependency upgrades and lint rewrites are outside this migration-only PR.

## Boundaries and remaining risk

- earnings-analysis changes: 0
- PPT Factory changes: 0
- MATT changes: 0
- MIKKO changes: 0
- Fund Manager changes: 0
- AA20 functional changes: 0
- DeerFlow runtime changes: 0
- Nested Git repositories added: 0
- Submodules or subtrees added: 0
- Research Artifact version: unchanged at `1.0.0`
- Conflict status: none
- Remaining risk: the legacy local workspace remains as a backup; GitHub becomes canonical after this PR is reviewed and merged
