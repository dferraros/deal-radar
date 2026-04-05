"""indexes and float columns

Revision ID: 0005
Revises: 0004
Create Date: 2026-04-05

Changes:
  - GIN indexes on all ARRAY(Text) columns
  - B-tree indexes on high-frequency query columns

NOTE: TEXT→FLOAT column migration removed — ALTER TABLE requires exclusive
lock that deadlocks with Railway's rolling deploy (old container holds
connections). Confidence/score columns remain TEXT; the pipeline writes
valid float strings and _safe_float() handles read-side conversion.
"""
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Use CONCURRENTLY so index creation doesn't lock writes.
    # CONCURRENTLY cannot run inside a transaction, so we must break
    # the implicit alembic transaction with isolation_level="AUTOCOMMIT".
    conn = op.get_bind()
    conn.execution_options(isolation_level="AUTOCOMMIT")

    # ── GIN indexes on ARRAY columns ─────────────────────────────────────────
    conn.execute(op.inline_literal(
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_companies_sector_gin "
        "ON companies USING gin(sector)"
    ))
    conn.execute(op.inline_literal(
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_companies_tech_stack_gin "
        "ON companies USING gin(tech_stack)"
    ))
    conn.execute(op.inline_literal(
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_deals_all_investors_gin "
        "ON deals USING gin(all_investors)"
    ))

    # ── B-tree indexes on high-frequency query columns ────────────────────────
    conn.execute(op.inline_literal(
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_deals_announced_date ON deals(announced_date)"
    ))
    conn.execute(op.inline_literal(
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_deals_deal_type ON deals(deal_type)"
    ))
    conn.execute(op.inline_literal(
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_deals_amount_usd ON deals(amount_usd)"
    ))
    conn.execute(op.inline_literal(
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_deals_company_id ON deals(company_id)"
    ))
    conn.execute(op.inline_literal(
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_deals_created_at ON deals(created_at)"
    ))
    conn.execute(op.inline_literal(
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_companies_geo ON companies(geo)"
    ))
    conn.execute(op.inline_literal(
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_companies_name ON companies(name)"
    ))
    conn.execute(op.inline_literal(
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_intel_obs_queue_id ON intel_observations(queue_id)"
    ))
    conn.execute(op.inline_literal(
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_intel_obs_node_id ON intel_observations(node_id)"
    ))
    conn.execute(op.inline_literal(
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_intel_obs_queue_node "
        "ON intel_observations(queue_id, node_id)"
    ))
    conn.execute(op.inline_literal(
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_intel_sources_content_hash "
        "ON intel_sources(queue_id, content_hash)"
    ))
    conn.execute(op.inline_literal(
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_investors_name ON investors(name)"
    ))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execution_options(isolation_level="AUTOCOMMIT")
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
        conn.execute(op.inline_literal(f"DROP INDEX CONCURRENTLY IF EXISTS {idx}"))
