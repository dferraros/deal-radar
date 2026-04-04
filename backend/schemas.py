from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class DealResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: Optional[uuid.UUID] = None
    company_name: Optional[str] = None      # joined from companies table
    deal_type: Optional[str] = None
    amount_usd: Optional[int] = None
    round_label: Optional[str] = None
    announced_date: Optional[date] = None
    lead_investor: Optional[str] = None
    all_investors: list[str] = []
    source_url: Optional[str] = None
    source_name: Optional[str] = None
    ai_summary: Optional[str] = None
    sector: list[str] = []                  # from company
    geo: Optional[str] = None               # from company

    # Kept for backwards-compat with any existing consumers
    currency: Optional[str] = None
    closed_date: Optional[date] = None
    created_at: Optional[datetime] = None


class CompanyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    sector: list[str] = []
    geo: Optional[str] = None
    description: Optional[str] = None
    website: Optional[str] = None
    founded_year: Optional[int] = None
    deals: list[DealResponse] = []
    in_watchlist: bool = False

    # Kept for backwards-compat
    crunchbase_url: Optional[str] = None
    created_at: Optional[datetime] = None


class DealsListResponse(BaseModel):
    deals: list[DealResponse]
    total: int
    page: int
    pages: int


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


# ---------------------------------------------------------------------------
# Heatmap endpoint schemas
# ---------------------------------------------------------------------------

class HeatmapCellV2(BaseModel):
    """Heatmap cell with total_capital_usd field (used by /api/heatmap)."""
    sector: str
    geo: str
    deal_count: int
    total_capital_usd: int


class HeatmapResponse(BaseModel):
    period: str
    date_from: date
    date_to: date
    cells: list[HeatmapCellV2]
    sectors: list[str]
    geos: list[str]


# ---------------------------------------------------------------------------
# Trends endpoint schemas
# ---------------------------------------------------------------------------

class WeekPoint(BaseModel):
    week_start: date
    deal_type: str
    deal_count: int
    total_capital_usd: int


class SectorBar(BaseModel):
    sector: str
    deal_count: int
    total_capital_usd: int


class TrendsResponse(BaseModel):
    weeks: int
    date_from: date
    weekly_by_type: list[WeekPoint]
    top_sectors: list[SectorBar]


# ---------------------------------------------------------------------------
# KPI endpoint schema
# ---------------------------------------------------------------------------

class KPIResponse(BaseModel):
    deals_this_week: int
    capital_this_week_usd: int
    top_sector_this_week: str
    total_companies_tracked: int
