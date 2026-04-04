import uuid
from datetime import date, datetime, timezone

from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    Date,
    ForeignKey,
    Integer,
    String,
    Text,
    ARRAY,
)
from sqlalchemy import DateTime
from sqlalchemy.dialects.postgresql import UUID

TIMESTAMPTZ = DateTime(timezone=True)
from sqlalchemy.orm import relationship

from backend.database import Base


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
    created_at = Column(TIMESTAMPTZ, default=datetime.utcnow)

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
    created_at = Column(TIMESTAMPTZ, default=datetime.utcnow)

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
    added_at = Column(TIMESTAMPTZ, default=datetime.utcnow)
    notes = Column(Text)

    company = relationship("Company", back_populates="watchlist_entries")


class IngestionRun(Base):
    __tablename__ = "ingestion_runs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source = Column(Text)                 # 'crunchbase', 'tavily', 'firecrawl', 'rss', 'manual'
    status = Column(Text)                 # 'success', 'partial', 'failed'
    deals_found = Column(Integer)
    deals_added = Column(Integer)
    run_at = Column(TIMESTAMPTZ, default=datetime.utcnow)
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
