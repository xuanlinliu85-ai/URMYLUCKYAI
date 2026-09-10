# TASK — AI Design Memory guarded local core

Status: `MISSING` after repository search on 2026-08-28.

## Goal

Build the final documented V3 local core by composing existing immutable Style
Pack, semantic search, explicit preference-event and accepted manual-edit
learning artifacts into deterministic, explainable design-memory snapshots and
recommendations. `ppt-factory` remains the only top-level orchestrator.

## Classification

| Capability | Status | Decision |
| --- | --- | --- |
| Saved Style Packs | `DONE` local | `KEEP / consume` |
| Semantic Search | `DONE` local | `KEEP / consume` |
| Explicit Preference Events | `DONE` local | `KEEP / consume` |
| Manual-edit Preference Learning | `DONE` guarded local | `KEEP / consume` |
| AI Design Memory snapshot/recommendation contract | `MISSING` | `ADD` |
| Automatic deck mutation or new orchestration layer | `MISSING` | `OUT OF SCOPE` |

Repository search found no Design Memory module, API, schema or artifact. The
existing source modules remain working inputs and will not be rewritten.

## Required behavior

- Consume only strict, versioned and hash-valid persisted source artifacts.
- Bind each memory snapshot to its project/user scope and exact source hashes.
- Keep explicit favorite/use/reject evidence separate from trusted manual-edit
  recommendations and retain negative, withheld and conflicting evidence.
- Authorize a learned recommendation only when its exact proposal has an
  explicit accepted decision; rejected, missing or mismatched decisions remain
  ineligible.
- Produce deterministic ranked reusable Style Pack/Golden Slide candidates and
  explainable style-dimension recommendations without mutating Style Mix,
  Slide Plan or PPTX.
- Require explicit downstream opt-in and preserve compatibility-only reference
  exclusion through the existing semantic-search boundary.
- Reject cross-scope, mutable, forged, stale, unknown-version and hash-mismatched
  inputs. Caller-provided scores or recommendation authority have no effect.
- Local file persistence uses immutable snapshot identities, atomic writes and
  canonical idempotency. Remote/shared memory remains a later adapter boundary.

## Artifacts

- `DESIGN_MEMORY_PROFILE.json`
- `DESIGN_MEMORY_RECOMMENDATION.json`
- JSON Schemas and framework-neutral executable API handlers

## Acceptance

- Unit/API tests cover exact lineage, scope isolation, accepted/rejected learned
  evidence, explicit preference ranking, deterministic replay, idempotency,
  tamper detection and automatic-mutation prohibition.
- Reuse the existing real 8-slide editable acceptance deck and persisted render/
  inspect evidence only as bounded source context. Keep its SHA-256 unchanged;
  do not regenerate the deck or run any long-deck job.
- Run full tests, typecheck, production build, bounded artifact acceptance,
  diff review and independent read-only audit.
- Finish with `RESULT.md` containing `PASS`, `PARTIAL` or `FAIL` and a merge
  recommendation.

## Worktree

- Branch: `feature/ai-design-memory`
- Path: `.worktrees/ai-design-memory`
