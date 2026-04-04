from __future__ import annotations

from datetime import date, timedelta
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_session
from backend.schemas import HeatmapCellV2, HeatmapResponse

router = APIRouter()

_PERIOD_DAYS: dict[str, int] = {
    "weekly": 7,
    "monthly": 30,
    "quarterly": 90,
}


@router.get("/heatmap", response_model=HeatmapResponse)
async def get_heatmap(
    period: Literal["weekly", "monthly", "quarterly"] = Query("weekly"),
    deal_type: Optional[str] = Query(None),
    session: AsyncSession = Depends(get_session),
) -> HeatmapResponse:
    """
    Return capital raised (SUM amount_usd) grouped by sector × geo for the
    selected period. Sector is unnested from the PostgreSQL TEXT[] array.
    """
    date_to = date.today()
    date_from = date_to - timedelta(days=_PERIOD_DAYS[period])

    deal_type_filter = "AND d.deal_type = :deal_type" if deal_type else ""
    params: dict = {"date_from": date_from, "date_to": date_to}
    if deal_type:
        params["deal_type"] = deal_type

    sql = text(
        f"""
        SELECT
            unnest(c.sector)                    AS sector_value,
            c.geo,
            COUNT(d.id)                         AS deal_count,
            COALESCE(SUM(d.amount_usd), 0)      AS total_capital_usd
        FROM deals d
        JOIN companies c ON d.company_id = c.id
        WHERE d.announced_date >= :date_from
          AND d.announced_date <= :date_to
          {deal_type_filter}
          AND d.amount_usd IS NOT NULL
        GROUP BY sector_value, c.geo
        ORDER BY total_capital_usd DESC
        """
    )

    result = await session.execute(sql, params)
    rows = result.fetchall()

    cells: list[HeatmapCellV2] = []
    sectors_seen: list[str] = []
    geos_seen: list[str] = []

    for row in rows:
        sector_val = row.sector_value or ""
        geo_val = row.geo or ""

        cells.append(
            HeatmapCellV2(
                sector=sector_val,
                geo=geo_val,
                deal_count=int(row.deal_count),
                total_capital_usd=int(row.total_capital_usd),
            )
        )

        if sector_val and sector_val not in sectors_seen:
            sectors_seen.append(sector_val)
        if geo_val and geo_val not in geos_seen:
            geos_seen.append(geo_val)

    return HeatmapResponse(
        period=period,
        date_from=date_from,
        date_to=date_to,
        cells=cells,
        sectors=sectors_seen,
        geos=geos_seen,
    )
