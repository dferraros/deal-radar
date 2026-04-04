"""add alert_rules table

Revision ID: 0003
Revises: 0002
Create Date: 2026-04-05

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = '0003'
down_revision = '0002'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'alert_rules',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('min_amount_usd', sa.BigInteger(), nullable=True),
        sa.Column('deal_type', sa.String(), nullable=True),
        sa.Column('sector', sa.String(), nullable=True),
        sa.Column('geo', sa.String(), nullable=True),
        sa.Column('investor_name', sa.String(), nullable=True),
        sa.Column('webhook_url', sa.String(), nullable=True),
        sa.Column('label', sa.String(), nullable=True),
        sa.Column('last_triggered_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('is_active', sa.Boolean(), default=True),
    )


def downgrade():
    op.drop_table('alert_rules')
