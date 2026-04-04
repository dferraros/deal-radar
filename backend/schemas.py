from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class CompanyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    sector: Optional[list[str]] = None
    geo: Optional[str] = None
    description: Optional[str] = None
    crunchbase_url: Optional[str] = None
    website: Optional[str] = None
    founded_year: Optional[int] = None
    created_at: Optional[datetime] = None


class DealResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: Optional[uuid.UUID] = None
    deal_type: Optional[str] = None
    amount_usd: Optional[int] = None
    currency: Optional[str] = None
    round_label: Optional[str] = None
    announced_date: Optional[date] = None
    closed_date: Optional[date] = None
    lead_investor: Optional[str] = None
    all_investors: Optional[list[str]] = None
    source_url: Optional[str] = None
    source_name: Optional[str] = None
    ai_summary: Optional[str] = None
    created_at: Optional[datetime] = None

    # Denormalized for convenience in list views
    company_name: Optional[str] = None
    company_geo: Optional[str] = None


class WatchlistItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    added_at: Optional[datetime] = None
    notes: Optional[str] = None
    company: Optional[CompanyResponse] = None


class HeatmapCell(BaseModel):
    sector: str
    geo: str
    capital_usd: int
    deal_count: int


class TrendPoint(BaseModel):
    week: str          # ISO week string, e.g. "2026-W14"
    deal_type: str     # 'vc', 'ma', 'crypto', 'ipo'
    capital_usd: int
    deal_count: int


class IngestRunResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    source: Optional[str] = None
    status: Optional[str] = None
    deals_found: Optional[int] = None
    deals_added: Optional[int] = None
    run_at: Optional[datetime] = None
    error_log: Optional[str] = None
