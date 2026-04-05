"""indexes

Revision ID: 0005
Revises: 0004
Create Date: 2026-04-05

Adds GIN indexes on ARRAY columns and B-tree indexes on high-frequency
query columns. Uses IF NOT EXISTS so re-runs are safe.
"""
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # GIN indexes on ARRAY columns
    op.execute("CREATE INDEX IF NOT EXISTS idx_companies_sector_gin ON companies USING gin(sector)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_companies_tech_stack_gin ON companies USING gin(tech_stack)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_deals_all_investors_gin ON deals USING gin(all_investors)")

    # B-tree indexes on high-frequency query columns
    op.execute("CREATE INDEX IF NOT EXISTS idx_deals_announced_date ON deals(announced_date)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_deals_deal_type ON deals(deal_type)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_deals_amount_usd ON deals(amount_usd)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_deals_company_id ON deals(company_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_deals_created_at ON deals(created_at)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_companies_geo ON companies(geo)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_companies_name ON companies(name)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_intel_obs_queue_id ON intel_observations(queue_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_intel_obs_node_id ON intel_observations(node_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_intel_obs_queue_node ON intel_observations(queue_id, node_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_intel_sources_content_hash ON intel_sources(queue_id, content_hash)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_investors_name ON investors(name)")


def downgrade() -> None:
    for idx in [
        "idx_investors_name",
        "idx_intel_sources_content_hash",
        "idx_intel_obs_queue_node",
        "idx_intel_obs_node_id",
        "idx_intel_obs_queue_id",
        "idx_companies_name",
        "idx_companies_geo",
        "idx_deals_created_at",
        "idx_deals_company_id",
        "idx_deals_amount_usd",
        "idx_deals_deal_type",
        "idx_deals_announced_date",
        "idx_deals_all_investors_gin",
        "idx_companies_tech_stack_gin",
        "idx_companies_sector_gin",
    ]:
        op.execute(f"DROP INDEX IF EXISTS {idx}")
