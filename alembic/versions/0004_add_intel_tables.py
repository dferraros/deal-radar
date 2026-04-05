"""add intel tables for tech bet intelligence engine

Revision ID: 0004
Revises: 0003
Create Date: 2026-04-05

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, ARRAY

revision = '0004'
down_revision = '0003'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'intel_queue',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('company_id', UUID(as_uuid=True), sa.ForeignKey('companies.id', ondelete='SET NULL'), nullable=True),
        sa.Column('company_name', sa.Text(), nullable=False),
        sa.Column('website', sa.Text(), nullable=False),
        sa.Column('status', sa.Text(), nullable=False, server_default='queued'),
        sa.Column('queued_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('error_log', sa.Text(), nullable=True),
    )

    op.create_table(
        'intel_sources',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('company_id', UUID(as_uuid=True), sa.ForeignKey('companies.id', ondelete='SET NULL'), nullable=True),
        sa.Column('queue_id', UUID(as_uuid=True), sa.ForeignKey('intel_queue.id', ondelete='CASCADE'), nullable=False),
        sa.Column('url', sa.Text(), nullable=False),
        sa.Column('source_type', sa.Text(), nullable=True),
        sa.Column('raw_text', sa.Text(), nullable=True),
        sa.Column('clean_text', sa.Text(), nullable=True),
        sa.Column('content_hash', sa.Text(), nullable=True),
        sa.Column('fetched_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('http_status', sa.Integer(), nullable=True),
    )

    op.create_table(
        'intel_source_chunks',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('source_id', UUID(as_uuid=True), sa.ForeignKey('intel_sources.id', ondelete='CASCADE'), nullable=False),
        sa.Column('chunk_index', sa.Integer(), nullable=False),
        sa.Column('clean_text', sa.Text(), nullable=True),
        sa.Column('token_count', sa.Integer(), nullable=True),
    )

    op.create_table(
        'intel_company_profiles',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('company_id', UUID(as_uuid=True), sa.ForeignKey('companies.id', ondelete='SET NULL'), nullable=True),
        sa.Column('queue_id', UUID(as_uuid=True), sa.ForeignKey('intel_queue.id', ondelete='CASCADE'), nullable=False),
        sa.Column('summary', sa.Text(), nullable=True),
        sa.Column('target_user', ARRAY(sa.Text()), nullable=True),
        sa.Column('workflow', ARRAY(sa.Text()), nullable=True),
        sa.Column('inputs', ARRAY(sa.Text()), nullable=True),
        sa.Column('outputs', ARRAY(sa.Text()), nullable=True),
        sa.Column('claimed_differentiators', ARRAY(sa.Text()), nullable=True),
        sa.Column('jtbd', sa.Text(), nullable=True),
        sa.Column('profile_confidence', sa.Text(), nullable=True),
        sa.Column('generated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('model_version', sa.Text(), nullable=True),
    )

    op.create_table(
        'intel_ontology_nodes',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('canonical_name', sa.Text(), unique=True, nullable=False),
        sa.Column('node_type', sa.Text(), nullable=True),
        sa.Column('parent_id', UUID(as_uuid=True), sa.ForeignKey('intel_ontology_nodes.id', ondelete='SET NULL'), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('status', sa.Text(), nullable=False, server_default='active'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
    )

    op.create_table(
        'intel_ontology_aliases',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('node_id', UUID(as_uuid=True), sa.ForeignKey('intel_ontology_nodes.id', ondelete='CASCADE'), nullable=False),
        sa.Column('alias', sa.Text(), nullable=False),
        sa.Column('alias_type', sa.Text(), nullable=True),
    )

    op.create_table(
        'intel_observations',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('company_id', UUID(as_uuid=True), sa.ForeignKey('companies.id', ondelete='SET NULL'), nullable=True),
        sa.Column('queue_id', UUID(as_uuid=True), sa.ForeignKey('intel_queue.id', ondelete='CASCADE'), nullable=False),
        sa.Column('node_id', UUID(as_uuid=True), sa.ForeignKey('intel_ontology_nodes.id', ondelete='CASCADE'), nullable=False),
        sa.Column('layer', sa.Text(), nullable=True),
        sa.Column('confidence', sa.Text(), nullable=True),
        sa.Column('is_explicit', sa.Boolean(), nullable=True),
        sa.Column('inference_method', sa.Text(), nullable=True),
        sa.Column('generated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('model_version', sa.Text(), nullable=True),
    )

    op.create_table(
        'intel_observation_evidence',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('observation_id', UUID(as_uuid=True), sa.ForeignKey('intel_observations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('source_id', UUID(as_uuid=True), sa.ForeignKey('intel_sources.id', ondelete='CASCADE'), nullable=False),
        sa.Column('chunk_id', UUID(as_uuid=True), sa.ForeignKey('intel_source_chunks.id', ondelete='SET NULL'), nullable=True),
        sa.Column('evidence_text', sa.Text(), nullable=True),
        sa.Column('evidence_reason', sa.Text(), nullable=True),
        sa.Column('evidence_type', sa.Text(), nullable=True),
    )

    op.create_table(
        'intel_technology_scores',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('node_id', UUID(as_uuid=True), sa.ForeignKey('intel_ontology_nodes.id', ondelete='CASCADE'), nullable=False),
        sa.Column('period_start', sa.Date(), nullable=True),
        sa.Column('period_end', sa.Date(), nullable=True),
        sa.Column('company_count', sa.Integer(), nullable=True),
        sa.Column('capital_weighted_score', sa.Text(), nullable=True),
        sa.Column('growth_rate', sa.Text(), nullable=True),
        sa.Column('novelty_score', sa.Text(), nullable=True),
        sa.Column('co_occurrence_density', sa.Text(), nullable=True),
    )

    # Indexes for common query patterns
    op.create_index('ix_intel_queue_status', 'intel_queue', ['status'])
    op.create_index('ix_intel_sources_queue_id', 'intel_sources', ['queue_id'])
    op.create_index('ix_intel_observations_node_id', 'intel_observations', ['node_id'])
    op.create_index('ix_intel_observations_queue_id', 'intel_observations', ['queue_id'])
    op.create_index('ix_intel_technology_scores_node_id', 'intel_technology_scores', ['node_id'])


def downgrade() -> None:
    op.drop_table('intel_technology_scores')
    op.drop_table('intel_observation_evidence')
    op.drop_table('intel_observations')
    op.drop_table('intel_ontology_aliases')
    op.drop_table('intel_ontology_nodes')
    op.drop_table('intel_company_profiles')
    op.drop_table('intel_source_chunks')
    op.drop_table('intel_sources')
    op.drop_table('intel_queue')
