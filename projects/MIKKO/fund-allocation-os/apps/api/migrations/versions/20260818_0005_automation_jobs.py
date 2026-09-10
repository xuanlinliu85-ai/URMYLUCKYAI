"""Add idempotent automation jobs and review tasks.

Revision ID: 20260818_0005
Revises: 20260817_0004
"""
from typing import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect


revision: str = "20260818_0005"
down_revision: str | Sequence[str] | None = "20260817_0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    tables = set(inspect(op.get_bind()).get_table_names())
    if "job_definitions" not in tables:
        op.create_table(
            "job_definitions",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("key", sa.String(64), nullable=False),
            sa.Column("handler_name", sa.String(128), nullable=False),
            sa.Column("schedule", sa.String(64)),
            sa.Column("max_attempts", sa.Integer(), nullable=False),
            sa.Column("enabled", sa.Boolean(), nullable=False),
            sa.UniqueConstraint("key"),
        )
        op.create_index("ix_job_definitions_key", "job_definitions", ["key"])
    if "job_runs" not in tables:
        op.create_table(
            "job_runs",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column(
                "job_definition_id",
                sa.String(36),
                sa.ForeignKey("job_definitions.id"),
                nullable=False,
            ),
            sa.Column("idempotency_key", sa.String(256), nullable=False),
            sa.Column("subject_type", sa.String(64), nullable=False),
            sa.Column("subject_id", sa.String(128), nullable=False),
            sa.Column("status", sa.String(32), nullable=False),
            sa.Column("attempt_count", sa.Integer(), nullable=False),
            sa.Column("input_payload", sa.JSON(), nullable=False),
            sa.Column("output_payload", sa.JSON()),
            sa.Column("last_error", sa.Text()),
            sa.Column("started_at", sa.DateTime(timezone=True)),
            sa.Column("finished_at", sa.DateTime(timezone=True)),
            sa.UniqueConstraint("idempotency_key"),
        )
        op.create_index("ix_job_runs_job_definition_id", "job_runs", ["job_definition_id"])
        op.create_index("ix_job_runs_idempotency_key", "job_runs", ["idempotency_key"])
        op.create_index("ix_job_runs_subject_id", "job_runs", ["subject_id"])
        op.create_index("ix_job_runs_status", "job_runs", ["status"])
    if "automation_tasks" not in tables:
        op.create_table(
            "automation_tasks",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("job_run_id", sa.String(36), sa.ForeignKey("job_runs.id"), nullable=False),
            sa.Column("event_id", sa.String(36), sa.ForeignKey("events.id")),
            sa.Column("task_type", sa.String(64), nullable=False),
            sa.Column("subject_type", sa.String(64), nullable=False),
            sa.Column("subject_id", sa.String(128), nullable=False),
            sa.Column("title", sa.String(256), nullable=False),
            sa.Column("payload", sa.JSON(), nullable=False),
            sa.Column("status", sa.String(32), nullable=False),
            sa.Column("assigned_role", sa.String(32), nullable=False),
            sa.Column("dedup_key", sa.String(256), nullable=False),
            sa.UniqueConstraint("dedup_key"),
        )
        op.create_index("ix_automation_tasks_job_run_id", "automation_tasks", ["job_run_id"])
        op.create_index("ix_automation_tasks_event_id", "automation_tasks", ["event_id"])
        op.create_index("ix_automation_tasks_task_type", "automation_tasks", ["task_type"])
        op.create_index("ix_automation_tasks_subject_id", "automation_tasks", ["subject_id"])
        op.create_index("ix_automation_tasks_status", "automation_tasks", ["status"])


def downgrade() -> None:
    tables = set(inspect(op.get_bind()).get_table_names())
    if "automation_tasks" in tables:
        op.drop_table("automation_tasks")
    if "job_runs" in tables:
        op.drop_table("job_runs")
    if "job_definitions" in tables:
        op.drop_table("job_definitions")
