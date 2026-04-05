from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_session
from backend.schemas import SectorBar, TrendsResponse, WeekPoint

router = APIRouter()


@router.get("/trends", response_model=TrendsResponse)
async def get_trends(
    weeks: int = Query(12, ge=1, le=52),
    session: AsyncSession = Depends(get_session),
) -> TrendsResponse:
    """
    Return week-by-week capital broken down by deal type, plus the top 10
    sectors by deal count for the last 30 days.
    """
    date_to = date.today()
    date_from = date_to - timedelta(weeks=weeks)
    last_30_from = date_to - timedelta(days=30)

    # --- Weekly breakdown by deal type ---
    weekly_sql = text(
        """
        SELECT
            date_trunc('week', d.announced_date)::date  AS week_start,
            d.deal_type,
            COUNT(d.id)                                  AS deal_count,
            COALESCE(SUM(d.amount_usd), 0)               AS total_capital_usd
        FROM deals d
        WHERE d.announced_date >= :date_from
          AND d.announced_date <= :date_to
        GROUP BY week_start, d.deal_type
        ORDER BY week_start ASC, d.deal_type
        """
    )

    weekly_result = await session.execute(weekly_sql, {"date_from": date_from, "date_to": date_to})
    weekly_rows = weekly_result.fetchall()

    weekly_by_type: list[WeekPoint] = [
        WeekPoint(
            week_start=row.week_start,
            deal_type=row.deal_type or "",
            deal_count=int(row.deal_count),
            total_capital_usd=int(row.total_capital_usd),
        )
        for row in weekly_rows
    ]

    # --- Top sectors by deal count (last 30 days) ---
    sectors_sql = text(
        """
        SELECT
            unnest(c.sector)                    AS sector_value,
            COUNT(d.id)                         AS deal_count,
            COALESCE(SUM(d.amount_usd), 0)      AS total_capital_usd
        FROM deals d
        JOIN companies c ON d.company_id = c.id
        WHERE d.announced_date >= :date_from
        GROUP BY sector_value
        ORDER BY deal_count DESC
        LIMIT 10
        """
    )

    sectors_result = await session.execute(sectors_sql, {"date_from": last_30_from})
    sectors_rows = sectors_result.fetchall()

    top_sectors: list[SectorBar] = [
        SectorBar(
            sector=row.sector_value or "",
            deal_count=int(row.deal_count),
            total_capital_usd=int(row.total_capital_usd),
        )
        for row in sectors_rows
    ]

    return TrendsResponse(
        weeks=weeks,
        date_from=date_from,
        weekly_by_type=weekly_by_type,
        top_sectors=top_sectors,
    )
