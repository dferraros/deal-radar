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


def _alter_if_text(table: str, column: str) -> str:
    """DO block: clean bad values and alter column only if it's still TEXT."""
    return f"""
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = '{table}' AND column_name = '{column}'
      AND data_type IN ('text', 'character varying')
  ) THEN
    UPDATE {table} SET {column} = NULL
    WHERE {column} IS NOT NULL AND {column}::text !~ '^[0-9]+(\\.[0-9]+)?$';
    EXECUTE 'ALTER TABLE {table} ALTER COLUMN {column} TYPE double precision USING {column}::double precision';
  END IF;
END $$;
"""


def upgrade() -> None:
    op.execute(_alter_if_text("intel_observations", "confidence"))
    op.execute(_alter_if_text("intel_company_profiles", "profile_confidence"))
    for col in ("capital_weighted_score", "growth_rate", "novelty_score", "co_occurrence_density"):
        op.execute(_alter_if_text("intel_technology_scores", col))


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
