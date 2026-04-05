"""indexes and float columns

Revision ID: 0005
Revises: 0004
Create Date: 2026-04-05

Changes:
  - ALTER confidence/score TEXT columns → FLOAT in intel tables
  - GIN indexes on all ARRAY(Text) columns
  - B-tree indexes on high-frequency query columns
"""
from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── 1. TEXT → FLOAT for confidence and score columns ─────────────────────
    op.alter_column(
        "intel_company_profiles",
        "profile_confidence",
        existing_type=sa.Text(),
        type_=sa.Float(),
        postgresql_using="profile_confidence::double precision",
        nullable=True,
    )
    op.alter_column(
        "intel_observations",
        "confidence",
        existing_type=sa.Text(),
        type_=sa.Float(),
        postgresql_using="confidence::double precision",
        nullable=True,
    )
    op.alter_column(
        "intel_technology_scores",
        "capital_weighted_score",
        existing_type=sa.Text(),
        type_=sa.Float(),
        postgresql_using="capital_weighted_score::double precision",
        nullable=True,
    )
    op.alter_column(
        "intel_technology_scores",
        "growth_rate",
        existing_type=sa.Text(),
        type_=sa.Float(),
        postgresql_using="growth_rate::double precision",
        nullable=True,
    )
    op.alter_column(
        "intel_technology_scores",
        "novelty_score",
        existing_type=sa.Text(),
        type_=sa.Float(),
        postgresql_using="novelty_score::double precision",
        nullable=True,
    )
    op.alter_column(
        "intel_technology_scores",
        "co_occurrence_density",
        existing_type=sa.Text(),
        type_=sa.Float(),
        postgresql_using="co_occurrence_density::double precision",
        nullable=True,
    )

    # ── 2. GIN indexes on ARRAY columns ──────────────────────────────────────
    op.create_index(
        "idx_companies_sector_gin",
        "companies",
        ["sector"],
        postgresql_using="gin",
    )
    op.create_index(
        "idx_companies_tech_stack_gin",
        "companies",
        ["tech_stack"],
        postgresql_using="gin",
    )
    op.create_index(
        "idx_deals_all_investors_gin",
        "deals",
        ["all_investors"],
        postgresql_using="gin",
    )
    op.create_index(
        "idx_intel_profiles_target_user_gin",
        "intel_company_profiles",
        ["target_user"],
        postgresql_using="gin",
    )
    op.create_index(
        "idx_intel_profiles_workflow_gin",
        "intel_company_profiles",
        ["workflow"],
        postgresql_using="gin",
    )
    op.create_index(
        "idx_intel_profiles_claimed_diff_gin",
        "intel_company_profiles",
        ["claimed_differentiators"],
        postgresql_using="gin",
    )

    # ── 3. B-tree indexes on high-frequency query columns ────────────────────
    # deals — most heavily queried table
    op.create_index("idx_deals_announced_date", "deals", ["announced_date"])
    op.create_index("idx_deals_deal_type", "deals", ["deal_type"])
    op.create_index("idx_deals_amount_usd", "deals", ["amount_usd"])
    op.create_index("idx_deals_company_id", "deals", ["company_id"])
    op.create_index("idx_deals_created_at", "deals", ["created_at"])

    # companies
    op.create_index("idx_companies_geo", "companies", ["geo"])
    op.create_index("idx_companies_name", "companies", ["name"])

    # intel — bridge query joins on these
    op.create_index("idx_intel_obs_queue_id", "intel_observations", ["queue_id"])
    op.create_index("idx_intel_obs_node_id", "intel_observations", ["node_id"])
    op.create_index(
        "idx_intel_obs_queue_node",
        "intel_observations",
        ["queue_id", "node_id"],
    )
    op.create_index("idx_intel_obs_confidence", "intel_observations", ["confidence"])

    # intel_sources — content_hash lookup
    op.create_index(
        "idx_intel_sources_content_hash",
        "intel_sources",
        ["queue_id", "content_hash"],
    )

    # investors
    op.create_index("idx_investors_name", "investors", ["name"])


def downgrade() -> None:
    # Drop indexes
    op.drop_index("idx_investors_name", table_name="investors")
    op.drop_index("idx_intel_sources_content_hash", table_name="intel_sources")
    op.drop_index("idx_intel_obs_confidence", table_name="intel_observations")
    op.drop_index("idx_intel_obs_queue_node", table_name="intel_observations")
    op.drop_index("idx_intel_obs_node_id", table_name="intel_observations")
    op.drop_index("idx_intel_obs_queue_id", table_name="intel_observations")
    op.drop_index("idx_companies_name", table_name="companies")
    op.drop_index("idx_companies_geo", table_name="companies")
    op.drop_index("idx_deals_created_at", table_name="deals")
    op.drop_index("idx_deals_company_id", table_name="deals")
    op.drop_index("idx_deals_amount_usd", table_name="deals")
    op.drop_index("idx_deals_deal_type", table_name="deals")
    op.drop_index("idx_deals_announced_date", table_name="deals")
    op.drop_index("idx_intel_profiles_claimed_diff_gin", table_name="intel_company_profiles")
    op.drop_index("idx_intel_profiles_workflow_gin", table_name="intel_company_profiles")
    op.drop_index("idx_intel_profiles_target_user_gin", table_name="intel_company_profiles")
    op.drop_index("idx_deals_all_investors_gin", table_name="deals")
    op.drop_index("idx_companies_tech_stack_gin", table_name="companies")
    op.drop_index("idx_companies_sector_gin", table_name="companies")

    # Revert float → text
    for table, col in [
        ("intel_technology_scores", "co_occurrence_density"),
        ("intel_technology_scores", "novelty_score"),
        ("intel_technology_scores", "growth_rate"),
        ("intel_technology_scores", "capital_weighted_score"),
        ("intel_observations", "confidence"),
        ("intel_company_profiles", "profile_confidence"),
    ]:
        op.alter_column(table, col, existing_type=sa.Float(), type_=sa.Text(), nullable=True)
