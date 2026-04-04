import uuid
from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    Column,
    Date,
    ForeignKey,
    Integer,
    String,
    Text,
    ARRAY,
)
from sqlalchemy.dialects.postgresql import UUID, TIMESTAMPTZ
from sqlalchemy.orm import relationship

from backend.database import Base


class Company(Base):
    __tablename__ = "companies"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(Text, nullable=False)
    sector = Column(ARRAY(Text))          # e.g. ['crypto', 'fintech']
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
