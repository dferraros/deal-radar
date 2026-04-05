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


_SAFE_CAST = "CASE WHEN {col} ~ E'^[+-]?[0-9]+(\\\\.[0-9]+)?$' THEN {col}::double precision ELSE NULL END"


def _safe(col: str) -> str:
    return _SAFE_CAST.format(col=col)


def upgrade() -> None:
    op.execute("SET lock_timeout = '5s'")

    op.execute(f"""
        ALTER TABLE intel_observations
            ALTER COLUMN confidence TYPE double precision
            USING {_safe('confidence')}
    """)

    op.execute(f"""
        ALTER TABLE intel_company_profiles
            ALTER COLUMN profile_confidence TYPE double precision
            USING {_safe('profile_confidence')}
    """)

    op.execute(f"""
        ALTER TABLE intel_technology_scores
            ALTER COLUMN capital_weighted_score TYPE double precision
            USING {_safe('capital_weighted_score')},
            ALTER COLUMN growth_rate TYPE double precision
            USING {_safe('growth_rate')},
            ALTER COLUMN novelty_score TYPE double precision
            USING {_safe('novelty_score')},
            ALTER COLUMN co_occurrence_density TYPE double precision
            USING {_safe('co_occurrence_density')}
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
