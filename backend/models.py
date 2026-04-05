import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    ARRAY,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from backend.database import Base

TIMESTAMPTZ = DateTime(timezone=True)
_now = lambda: datetime.now(timezone.utc)  # noqa: E731


class Company(Base):
    __tablename__ = "companies"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(Text, nullable=False)
    sector = Column(ARRAY(Text))          # e.g. ['crypto', 'fintech']
    tech_stack = Column(ARRAY(Text))      # e.g. ['Python', 'AWS', 'React']
    geo = Column(Text)                    # e.g. 'latam', 'spain', 'global'
    description = Column(Text)
    crunchbase_url = Column(Text)
    website = Column(Text)
    founded_year = Column(Integer)
    created_at = Column(TIMESTAMPTZ, default=_now)

    deals = relationship("Deal", back_populates="company")
    watchlist_entries = relationship("Watchlist", back_populates="company")


class Deal(Base):
    __tablename__ = "deals"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=True)
    deal_type = Column(Text)              # 'vc', 'ma', 'crypto', 'ipo'
    amount_usd = Column(BigInteger)       # in USD, nullable if undisclosed
    currency = Column(Text)
    round_label = Column(Text)            # 'Series A', 'Seed', 'Acquisition', etc.
    announced_date = Column(Date)
    closed_date = Column(Date)
    lead_investor = Column(Text)
    all_investors = Column(ARRAY(Text))
    source_url = Column(Text)
    source_name = Column(Text)            # 'crunchbase', 'techcrunch', 'tavily', etc.
    raw_text = Column(Text)               # original source text for re-extraction
    ai_summary = Column(Text)             # 2-3 sentence LLM summary
    created_at = Column(TIMESTAMPTZ, default=_now)

    company = relationship("Company", back_populates="deals")


class Investor(Base):
    __tablename__ = "investors"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(Text, nullable=False)
    type = Column(Text)                   # 'vc', 'corporate', 'angel', 'pe'
    website = Column(Text)


class Watchlist(Base):
    __tablename__ = "watchlist"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=False)
    added_at = Column(TIMESTAMPTZ, default=_now)
    notes = Column(Text)

    company = relationship("Company", back_populates="watchlist_entries")


class IngestionRun(Base):
    __tablename__ = "ingestion_runs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source = Column(Text)                 # 'crunchbase', 'tavily', 'firecrawl', 'rss', 'manual'
    status = Column(Text)                 # 'success', 'partial', 'failed'
    deals_found = Column(Integer)
    deals_added = Column(Integer)
    run_at = Column(TIMESTAMPTZ, default=_now)
    error_log = Column(Text)


class AlertRule(Base):
    __tablename__ = "alert_rules"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Filter criteria (all optional — null means "any")
    min_amount_usd = Column(BigInteger, nullable=True)      # e.g. 10_000_000 = $10M+
    deal_type = Column(String, nullable=True)               # vc/ma/crypto/ipo
    sector = Column(String, nullable=True)                  # single sector filter
    geo = Column(String, nullable=True)                     # latam/spain/europe/us/asia/global
    investor_name = Column(String, nullable=True)           # e.g. "Sequoia Capital"
    # Notification config
    webhook_url = Column(String, nullable=True)             # POST JSON payload here
    label = Column(String, nullable=True)                   # user-defined name for rule
    # State
    last_triggered_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    is_active = Column(Boolean, default=True)


# ─────────────────────────────────────────────
# Tech Bet Intelligence Engine models
# ─────────────────────────────────────────────

class IntelQueue(Base):
    __tablename__ = "intel_queue"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=True)
    company_name = Column(Text, nullable=False)
    website = Column(Text, nullable=False)
    status = Column(Text, default="queued")  # queued|crawling|extracting|normalizing|done|failed
    queued_at = Column(TIMESTAMPTZ, default=_now)
    started_at = Column(TIMESTAMPTZ, nullable=True)
    completed_at = Column(TIMESTAMPTZ, nullable=True)
    error_log = Column(Text, nullable=True)

    sources = relationship("IntelSource", back_populates="queue_entry", cascade="all, delete-orphan")
    profile = relationship("IntelCompanyProfile", back_populates="queue_entry", uselist=False, cascade="all, delete-orphan")
    observations = relationship("IntelObservation", back_populates="queue_entry", cascade="all, delete-orphan")


class IntelSource(Base):
    __tablename__ = "intel_sources"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    queue_id = Column(UUID(as_uuid=True), ForeignKey("intel_queue.id"), nullable=False)
    url = Column(Text, nullable=False)
    source_type = Column(Text)  # homepage|product|docs|blog|careers|github|other
    raw_text = Column(Text)
    clean_text = Column(Text)
    content_hash = Column(Text)
    fetched_at = Column(TIMESTAMPTZ, default=_now)
    http_status = Column(Integer, nullable=True)

    queue_entry = relationship("IntelQueue", back_populates="sources")
    chunks = relationship("IntelSourceChunk", back_populates="source", cascade="all, delete-orphan")


class IntelSourceChunk(Base):
    __tablename__ = "intel_source_chunks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_id = Column(UUID(as_uuid=True), ForeignKey("intel_sources.id"), nullable=False)
    chunk_index = Column(Integer, nullable=False)
    clean_text = Column(Text, nullable=False)
    token_count = Column(Integer, default=0)

    source = relationship("IntelSource", back_populates="chunks")


class IntelCompanyProfile(Base):
    __tablename__ = "intel_company_profiles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    queue_id = Column(UUID(as_uuid=True), ForeignKey("intel_queue.id"), nullable=False, unique=True)
    summary = Column(Text)
    target_user = Column(ARRAY(Text), default=list)
    workflow = Column(ARRAY(Text), default=list)
    inputs = Column(ARRAY(Text), default=list)
    outputs = Column(ARRAY(Text), default=list)
    claimed_differentiators = Column(ARRAY(Text), default=list)
    jtbd = Column(Text)
    profile_confidence = Column(Text)  # stored as string float e.g. "0.85"
    generated_at = Column(TIMESTAMPTZ, default=_now)
    model_version = Column(Text)

    queue_entry = relationship("IntelQueue", back_populates="profile")


class IntelOntologyNode(Base):
    __tablename__ = "intel_ontology_nodes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    canonical_name = Column(Text, unique=True, nullable=False)
    node_type = Column(Text)  # domain|system_class|primitive
    parent_id = Column(UUID(as_uuid=True), ForeignKey("intel_ontology_nodes.id"), nullable=True)
    description = Column(Text)
    status = Column(Text, default="active")  # active|pending_review
    created_at = Column(TIMESTAMPTZ, default=_now)

    aliases = relationship("IntelOntologyAlias", back_populates="node", cascade="all, delete-orphan")
    observations = relationship("IntelObservation", back_populates="node")
    scores = relationship("IntelTechnologyScore", back_populates="node", cascade="all, delete-orphan")


class IntelOntologyAlias(Base):
    __tablename__ = "intel_ontology_aliases"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    node_id = Column(UUID(as_uuid=True), ForeignKey("intel_ontology_nodes.id"), nullable=False)
    alias = Column(Text, nullable=False)
    alias_type = Column(Text, default="extracted")  # extracted|manual

    node = relationship("IntelOntologyNode", back_populates="aliases")


class IntelObservation(Base):
    __tablename__ = "intel_observations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    queue_id = Column(UUID(as_uuid=True), ForeignKey("intel_queue.id"), nullable=False)
    node_id = Column(UUID(as_uuid=True), ForeignKey("intel_ontology_nodes.id"), nullable=False)
    layer = Column(Text)  # model|application_logic|infra|interface|hardware
    confidence = Column(Text)  # stored as string float e.g. "0.78"
    is_explicit = Column(Boolean, default=False)
    inference_method = Column(Text)
    generated_at = Column(TIMESTAMPTZ, default=_now)
    model_version = Column(Text)

    queue_entry = relationship("IntelQueue", back_populates="observations")
    node = relationship("IntelOntologyNode", back_populates="observations")
    evidence = relationship("IntelObservationEvidence", back_populates="observation", cascade="all, delete-orphan")


class IntelObservationEvidence(Base):
    __tablename__ = "intel_observation_evidence"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    observation_id = Column(UUID(as_uuid=True), ForeignKey("intel_observations.id"), nullable=False)
    source_id = Column(UUID(as_uuid=True), ForeignKey("intel_sources.id"), nullable=True)
    evidence_text = Column(Text, nullable=False)
    evidence_reason = Column(Text)
    evidence_type = Column(Text)  # product_page|docs|careers|blog|github

    observation = relationship("IntelObservation", back_populates="evidence")


class IntelTechnologyScore(Base):
    __tablename__ = "intel_technology_scores"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    node_id = Column(UUID(as_uuid=True), ForeignKey("intel_ontology_nodes.id"), nullable=False)
    period_start = Column(Date, nullable=False)
    period_end = Column(Date, nullable=False)
    company_count = Column(Integer, default=0)
    capital_weighted_score = Column(Text, default="0.0")
    growth_rate = Column(Text, default="0.0")
    novelty_score = Column(Text, default="0.0")
    co_occurrence_density = Column(Text, default="0.0")

    node = relationship("IntelOntologyNode", back_populates="scores")
