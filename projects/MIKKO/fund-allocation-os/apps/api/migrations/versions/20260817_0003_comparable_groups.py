"""Comparable group taxonomy.

Revision ID: 20260817_0003
Revises: 20260817_0002
"""
from typing import Sequence

from alembic import op
from sqlalchemy import inspect

from fund_allocation_api.database import Base
from fund_allocation_api import models  # noqa: F401


revision: str = "20260817_0003"
down_revision: str | Sequence[str] | None = "20260817_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    if "comparable_groups" not in inspect(bind).get_table_names():
        Base.metadata.tables["comparable_groups"].create(bind=bind)


def downgrade() -> None:
    if "comparable_groups" in inspect(op.get_bind()).get_table_names():
        op.drop_table("comparable_groups")

