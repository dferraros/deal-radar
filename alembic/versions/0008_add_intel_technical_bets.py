"""add intel_technical_bets table

Revision ID: 0008
Revises: 0007
Create Date: 2026-04-05
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "intel_technical_bets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("queue_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("intel_queue.id", ondelete="CASCADE"),
                  nullable=False, index=True),
        sa.Column("bet_index", sa.Integer(), nullable=False),
        sa.Column("thesis", sa.Text(), nullable=False),
        sa.Column("implication", sa.Text(), nullable=True),
        sa.Column("signals", postgresql.ARRAY(sa.Text()), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("model_version", sa.String(100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("intel_technical_bets")
