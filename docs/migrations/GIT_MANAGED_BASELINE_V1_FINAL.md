# Git Managed Baseline V1 Final Governance Report

## Result

`URMYLUCKY Research OS — Git Managed Baseline V1: PASS`

This hardening locks the completed V1 migration state into executable governance
assertions. It adds no product capability and changes no business code.

## Final project state matrix

| Project | Status | Sync mode | Canonical |
|---|---|---|---:|
| Daily Review | `active` | `git_managed` | `true` |
| Analyst Dream Team | `active` | `git_managed` | `true` |
| earnings-analysis | `active` | `git_managed` | `true` |
| Fund Manager | `prototype` | `git_managed` | `true` |
| MATT | `active` | `git_managed` | `true` |
| MIKKO+KEVIN | `active` | `git_managed` | `true` |
| PPT Factory | `active` | `git_managed` | `true` |
| AA20 | `isolated_frozen` | `frozen_snapshot` | `false` |

## Hard assertions

`scripts/validate-governance.mjs` enforces the following baseline:

- all seven active or prototype managed projects use `git_managed`;
- all seven git-managed projects are canonical;
- Fund Manager remains `prototype`;
- AA20 remains `isolated_frozen` and `frozen_snapshot`;
- the production orchestrator remains `null`;
- DeerFlow remains `deferred`;
- the canonical Research Artifact schema remains version `1.0.0`;
- the active Skill and repository safety checks continue to apply.

## Validation

| Check | Result |
|---|---|
| `npm ci` | PASS |
| `npm run build` | PASS |
| `npm test` | PASS, 11 passed and 0 failed |
| `npm run lint` | PASS, 0 errors and 23 existing warnings |
| `npm run artifact:validate` | PASS, 4 artifacts |
| `npm run macro:test:offline` | PASS |
| `npm run governance:validate` | PASS, 8 projects and 9 active Skills |
| `npm run ppt:contract:test` | PASS, 1 passed and 0 failed |

## Scope lock

- Business-code changes: 0
- Product-feature changes: 0
- Research Artifact version changes: 0
- AA20 functional changes: 0
- DeerFlow runtime integration: 0
- V2 work: 0

Existing Ruff findings, npm audit findings, lint warnings, and legacy local-path
items remain outside this final V1 governance-hardening scope.
