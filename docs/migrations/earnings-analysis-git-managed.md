# Earnings Analysis Git-Managed Migration Report

Date: 2026-09-13  
Project: `earnings-analysis`  
Canonical path: `projects/earnings-images`  
Migration branch: `codex/migrate-earnings-analysis-git-managed`  
Baseline: `6a05c89da412e778ea7a06c988dbc9485429365d`

## Source verification

- Source workspace: `<LOCAL_WORKSPACE>`
- Source repository: clean local Git repository with no configured remote
- Source branch: `master`
- Source commit: `a1ae95685a031cbaccf996ff75569ae22196e457`
- Source status: clean
- Alternate source candidates: none
- Manifest `source_commit`: `null`, because the local source commit is not resolvable in `xuanlinliu85-ai/URMYLUCKYAI`

## Inventory and comparison

- Source Git-tracked files: 42
- Repository snapshot Git-tracked files: 42
- Raw-hash identical files: 9
- Line-ending-only differences: 32
- Repository-newer files: 1
- Source-only files: 0
- Repository-only files: 0
- Missing repository source files: 0

The only semantic difference was retained from the repository. In
`scripts/export_research_artifact.py`, the repository version records direct
Research OS orchestration and a null orchestrator instead of declaring DeerFlow.
This is the V1.1 canonical governance boundary.

No earnings-analysis business source file required copying.

## Public-safety gate

- Files scanned: 42
- Total tracked size: 209,921 bytes
- Environment files: 0
- Binary presentation or document files: 0
- OpenAI, GitHub, AWS, bearer-token, private-key or generic credential pattern hits: 0
- Newly imported licensed data or research documents: 0

The snapshot contains 11 small, already tracked Baofeng Energy run artifacts used
as the existing validation fixture. They were identical to the source workspace
apart from line endings and were not re-imported. No bulk iFinD corpus, paid
research text, customer information or private runtime data was added.

## Skill boundary

- Active production Skill: `.agents/skills/earnings-analysis`
- Active `earnings-analysis` Skill count: 1
- `earnings-company-research` directories: 0
- `earnings-research` directories: 0
- `analyst-consensus` directories: 0

## Migration changes

- Updated `projects/SNAPSHOT_MANIFEST.json` for `earnings-analysis`
- Set `source` to `github:xuanlinliu85-ai/URMYLUCKYAI`
- Set `canonical` to `true`
- Set `sync_mode` to `git_managed`
- Added this migration report
- Imported business files: 0
- Modified earnings-analysis business files: 0

## Project validation

- `scripts/validate_bundle.py`: PASS
- `scripts/preflight.py`: PASS; optional EdgarTools and `jsonschema` remain absent
- Sample fact-pack verification: PASS, 0 errors and 0 warnings
- Existing Baofeng Energy fact-pack verification: PASS, 0 errors and 1 existing reporting-basis warning
- Existing research lint: PASS, 0 errors and 1 existing evidence-cue warning
- Research Artifact export: PASS
- Exported artifact canonical contract: PASS, `RESEARCH_ARTIFACT 1.0.0` / `earnings_analysis`

The existing warnings remain unresolved by design. This migration does not invent
consensus data or alter research evidence to remove warnings.

## Root validation

- Root `npm ci`: PASS
- Root `npm run build`: PASS
- Root `npm test`: PASS, 11/11
- Root `npm run lint`: PASS with 23 pre-existing warnings and 0 errors
- Root `npm run macro:test:offline`: PASS
- Root `npm run artifact:validate`: PASS, 4 artifacts
- Root `npm run governance:validate`: PASS, 8 projects and 9 active Skills
- Root `npm run ppt:contract:test`: PASS, 1/1

## Boundaries and remaining risk

- Analyst Dream Team changes: 0
- AA20 functional changes: 0
- DeerFlow runtime changes: 0
- Nested Git repositories added: 0
- Submodules or subtrees added: 0
- Research Artifact version: unchanged at `1.0.0`
- Conflict status: none
- Remaining risk: the legacy local workspace remains as a backup; GitHub becomes canonical after this PR is reviewed and merged
