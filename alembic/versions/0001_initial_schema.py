"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-04-04 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- companies ---
    op.create_table(
        "companies",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("sector", postgresql.ARRAY(sa.Text()), nullable=True),
        sa.Column("geo", sa.Text(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("crunchbase_url", sa.Text(), nullable=True),
        sa.Column("website", sa.Text(), nullable=True),
        sa.Column("founded_year", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            postgresql.TIMESTAMPTZ(),
            nullable=True,
            server_default=sa.text("now()"),
        ),
    )

    # --- deals ---
    op.create_table(
        "deals",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "company_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("companies.id"),
            nullable=True,
        ),
        sa.Column("deal_type", sa.Text(), nullable=True),
        sa.Column("amount_usd", sa.BigInteger(), nullable=True),
        sa.Column("currency", sa.Text(), nullable=True),
        sa.Column("round_label", sa.Text(), nullable=True),
        sa.Column("announced_date", sa.Date(), nullable=True),
        sa.Column("closed_date", sa.Date(), nullable=True),
        sa.Column("lead_investor", sa.Text(), nullable=True),
        sa.Column("all_investors", postgresql.ARRAY(sa.Text()), nullable=True),
        sa.Column("source_url", sa.Text(), nullable=True),
        sa.Column("source_name", sa.Text(), nullable=True),
        sa.Column("raw_text", sa.Text(), nullable=True),
        sa.Column("ai_summary", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            postgresql.TIMESTAMPTZ(),
            nullable=True,
            server_default=sa.text("now()"),
        ),
    )

    # --- investors ---
    op.create_table(
        "investors",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("type", sa.Text(), nullable=True),
        sa.Column("website", sa.Text(), nullable=True),
    )

    # --- watchlist ---
    op.create_table(
        "watchlist",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "company_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("companies.id"),
            nullable=False,
        ),
        sa.Column(
            "added_at",
            postgresql.TIMESTAMPTZ(),
            nullable=True,
            server_default=sa.text("now()"),
        ),
        sa.Column("notes", sa.Text(), nullable=True),
    )

    # --- ingestion_runs ---
    op.create_table(
        "ingestion_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("source", sa.Text(), nullable=True),
        sa.Column("status", sa.Text(), nullable=True),
        sa.Column("deals_found", sa.Integer(), nullable=True),
        sa.Column("deals_added", sa.Integer(), nullable=True),
        sa.Column(
            "run_at",
            postgresql.TIMESTAMPTZ(),
            nullable=True,
            server_default=sa.text("now()"),
        ),
        sa.Column("error_log", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("ingestion_runs")
    op.drop_table("watchlist")
    op.drop_table("investors")
    op.drop_table("deals")
    op.drop_table("companies")
