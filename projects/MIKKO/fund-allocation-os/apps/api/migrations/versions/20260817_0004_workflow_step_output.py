"""Persist structured workflow step outputs.

Revision ID: 20260817_0004
Revises: 20260817_0003
"""
from typing import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect


revision: str = "20260817_0004"
down_revision: str | Sequence[str] | None = "20260817_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    columns = {column["name"] for column in inspect(op.get_bind()).get_columns("workflow_step_runs")}
    if "structured_output" not in columns:
        with op.batch_alter_table("workflow_step_runs") as batch:
            batch.add_column(sa.Column("structured_output", sa.JSON(), nullable=True))


def downgrade() -> None:
    columns = {column["name"] for column in inspect(op.get_bind()).get_columns("workflow_step_runs")}
    if "structured_output" in columns:
        with op.batch_alter_table("workflow_step_runs") as batch:
            batch.drop_column("structured_output")
