from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_session
from backend.schemas import KPIResponse

router = APIRouter()


@router.get("/kpi", response_model=KPIResponse)
async def get_kpi(session: AsyncSession = Depends(get_session)) -> KPIResponse:
    """
    Return the four KPI summary metrics used by the dashboard header cards.
    """
    week_start = date.today() - timedelta(days=7)
    month_start = date.today() - timedelta(days=30)

    # --- Deals & capital this week ---
    deals_sql = text(
        """
        SELECT
            COUNT(d.id)                         AS deals_this_week,
            COALESCE(SUM(d.amount_usd), 0)      AS capital_this_week_usd
        FROM deals d
        WHERE d.announced_date >= :week_start
        """
    )
    deals_result = await session.execute(deals_sql, {"week_start": week_start})
    deals_row = deals_result.fetchone()

    deals_this_week = int(deals_row.deals_this_week) if deals_row else 0
    capital_this_week_usd = int(deals_row.capital_this_week_usd) if deals_row else 0

    # --- Top sector this week (by deal count, unnested) ---
    top_sector_sql = text(
        """
        SELECT
            unnest(c.sector)    AS sector_value,
            COUNT(d.id)         AS deal_count
        FROM deals d
        JOIN companies c ON d.company_id = c.id
        WHERE d.announced_date >= :week_start
        GROUP BY sector_value
        ORDER BY deal_count DESC
        LIMIT 1
        """
    )
    top_sector_result = await session.execute(
        top_sector_sql, {"week_start": week_start}
    )
    top_sector_row = top_sector_result.fetchone()
    top_sector_this_week = top_sector_row.sector_value if top_sector_row else ""

    # --- Total companies tracked ---
    companies_sql = text("SELECT COUNT(id) AS total FROM companies")
    companies_result = await session.execute(companies_sql)
    companies_row = companies_result.fetchone()
    total_companies_tracked = int(companies_row.total) if companies_row else 0

    return KPIResponse(
        deals_this_week=deals_this_week,
        capital_this_week_usd=capital_this_week_usd,
        top_sector_this_week=top_sector_this_week,
        total_companies_tracked=total_companies_tracked,
    )
