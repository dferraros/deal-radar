"""add tech_stack to companies

Revision ID: 0002
Revises: 0001
Create Date: 2026-04-05

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '0002'
down_revision = '0001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('companies',
        sa.Column('tech_stack', postgresql.ARRAY(sa.Text()), nullable=True)
    )


def downgrade() -> None:
    op.drop_column('companies', 'tech_stack')
