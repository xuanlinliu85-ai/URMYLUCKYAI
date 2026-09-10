# Phase 6 delivery: monitoring and automation

Phase 6 adds deterministic monitoring jobs with human-review boundaries.

Delivered job types:

1. Full-market Universe update request.
2. Quarterly fund review.
3. Fund-manager change detection.
4. Portfolio drawdown threshold detection.
5. Strategic-allocation deviation detection.
6. Fund-rating change detection.

Every run has a globally unique idempotency key, persisted input/output, attempt count, lifecycle timestamps, and a terminal `dead_letter` state after three failed attempts. Handler writes use a savepoint so partial events/tasks are rolled back before retry.

Successful jobs create one deduplicated Event and one open `AutomationTask` assigned to the relevant human role. The output is explicitly `human_review_required`; no job places an order, approves a Recommendation, or sends a ClientCommunication.

Operations/admin-only API routes expose definitions, execute or retry a run, and list recent runs. Phase 6 adds five automation tests; the full API suite now contains 36 passing tests. Fresh and incremental Alembic upgrades both reach `20260818_0005`.
