"""Skill Adapter registry and run metadata.

Revision ID: 20260817_0002
Revises: 20260817_0001
"""
from typing import Sequence

from alembic import op
from sqlalchemy import inspect

from fund_allocation_api.database import Base
from fund_allocation_api import models  # noqa: F401


revision: str = "20260817_0002"
down_revision: str | Sequence[str] | None = "20260817_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = set(inspector.get_table_names())
    if "skill_definitions" not in tables:
        Base.metadata.tables["skill_definitions"].create(bind=bind)

    columns = {column["name"] for column in inspect(bind).get_columns("skill_runs")}
    with op.batch_alter_table("skill_runs") as batch:
        if "error_code" not in columns:
            batch.add_column(models.SkillRun.__table__.c.error_code.copy())
        if "model_version" not in columns:
            batch.add_column(models.SkillRun.__table__.c.model_version.copy())
        if "prompt_hash" not in columns:
            batch.add_column(models.SkillRun.__table__.c.prompt_hash.copy())


def downgrade() -> None:
    bind = op.get_bind()
    columns = {column["name"] for column in inspect(bind).get_columns("skill_runs")}
    with op.batch_alter_table("skill_runs") as batch:
        for name in ("prompt_hash", "model_version", "error_code"):
            if name in columns:
                batch.drop_column(name)
    if "skill_definitions" in inspect(bind).get_table_names():
        op.drop_table("skill_definitions")

