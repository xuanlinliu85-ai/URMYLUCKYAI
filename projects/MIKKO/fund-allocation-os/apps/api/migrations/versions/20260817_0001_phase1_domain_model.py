"""Phase 1 domain model bootstrap.

Revision ID: 20260817_0001
Revises: None
"""
from typing import Sequence

from alembic import op

from fund_allocation_api.database import Base
from fund_allocation_api import models  # noqa: F401


revision: str = "20260817_0001"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    Base.metadata.create_all(bind=op.get_bind())


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind())

