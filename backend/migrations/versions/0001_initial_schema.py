"""Initial application schema baseline.

Revision ID: 0001
Revises:
Create Date: 2026-09-18

This baseline creates every app-owned table directly from the SQLAlchemy
models (app.db.models.Base.metadata), which are the single source of
truth for schema in this repo. Future changes should use
`alembic revision --autogenerate -m "..."` against a running database so
subsequent migrations get normal, reviewable op.create_table/op.add_column
diffs — this file exists once, as the starting point.

Note: this only creates the APP schema (public). The `datahub` schema —
the read-only, RLS-protected, masked-view warehouse simulation — is
created separately by sample_data/db_init/02-datahub-schema.sql at
container bootstrap, not by Alembic, because it deliberately needs to be
owned and populated before the read-only role's grants are issued (see
sample_data/db_init/README.md).
"""
from __future__ import annotations

from alembic import op

from app.db.models import Base

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind, checkfirst=True)


def downgrade() -> None:
    bind = op.get_bind()
    Base.metadata.drop_all(bind=bind)
