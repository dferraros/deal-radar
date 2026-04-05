"""make intel_observation_evidence.source_id nullable

Revision ID: 0007
Revises: 0006
Create Date: 2026-04-05

The pipeline inserts IntelObservationEvidence without a source_id when
evidence is derived from assembled context rather than a single source page.
The model already has nullable=True; this migration aligns the DB constraint.
"""
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE intel_observation_evidence "
        "ALTER COLUMN source_id DROP NOT NULL"
    )


def downgrade() -> None:
    # Only safe if no NULLs exist
    op.execute(
        "ALTER TABLE intel_observation_evidence "
        "ALTER COLUMN source_id SET NOT NULL"
    )
