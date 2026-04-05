"""float confidence columns

Revision ID: 0006
Revises: 0005
Create Date: 2026-04-05

Converts all confidence/score columns from TEXT to DOUBLE PRECISION.
Uses USING clause to cast existing string values inline.
SET lock_timeout = '5s' ensures a fast, visible failure instead of a
silent hang if a lock cannot be acquired.
"""
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("SET lock_timeout = '5s'")

    # Null out any non-numeric strings before casting — safer than USING CASE
    op.execute("UPDATE intel_observations SET confidence = NULL WHERE confidence !~ '^[0-9]+(\\.[0-9]+)?$'")
    op.execute("UPDATE intel_company_profiles SET profile_confidence = NULL WHERE profile_confidence !~ '^[0-9]+(\\.[0-9]+)?$'")
    for col in ("capital_weighted_score", "growth_rate", "novelty_score", "co_occurrence_density"):
        op.execute(f"UPDATE intel_technology_scores SET {col} = NULL WHERE {col} !~ '^[0-9]+(\\.[0-9]+)?$'")

    op.execute("ALTER TABLE intel_observations ALTER COLUMN confidence TYPE double precision USING confidence::double precision")
    op.execute("ALTER TABLE intel_company_profiles ALTER COLUMN profile_confidence TYPE double precision USING profile_confidence::double precision")
    op.execute("""
        ALTER TABLE intel_technology_scores
            ALTER COLUMN capital_weighted_score TYPE double precision USING capital_weighted_score::double precision,
            ALTER COLUMN growth_rate TYPE double precision USING growth_rate::double precision,
            ALTER COLUMN novelty_score TYPE double precision USING novelty_score::double precision,
            ALTER COLUMN co_occurrence_density TYPE double precision USING co_occurrence_density::double precision
    """)


def downgrade() -> None:
    op.execute("SET lock_timeout = '5s'")

    op.execute("""
        ALTER TABLE intel_technology_scores
            ALTER COLUMN capital_weighted_score TYPE text USING capital_weighted_score::text,
            ALTER COLUMN growth_rate TYPE text USING growth_rate::text,
            ALTER COLUMN novelty_score TYPE text USING novelty_score::text,
            ALTER COLUMN co_occurrence_density TYPE text USING co_occurrence_density::text
    """)

    op.execute("""
        ALTER TABLE intel_company_profiles
            ALTER COLUMN profile_confidence TYPE text USING profile_confidence::text
    """)

    op.execute("""
        ALTER TABLE intel_observations
            ALTER COLUMN confidence TYPE text USING confidence::text
    """)
