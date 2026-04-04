from __future__ import annotations

from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_session
from backend.models import Deal
from backend.schemas import InvestorLeaderboardEntry, InvestorLeaderboardResponse

router = APIRouter(tags=["investors"])


def _period_dates(period: str) -> tuple[date, date]:
    today = date.today()
    if period == "weekly":
        date_from = today - timedelta(days=7)
    elif period == "quarterly":
        date_from = today - timedelta(days=90)
    else:  # monthly (default)
        date_from = today - timedelta(days=30)
    return date_from, today


@router.get("/investors/leaderboard", response_model=InvestorLeaderboardResponse)
async def investor_leaderboard(
    period: str = Query("monthly", description="weekly | monthly | quarterly"),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_session),
) -> InvestorLeaderboardResponse:
    """Return top investors ranked by total capital deployed in the given period."""

    if period not in ("weekly", "monthly", "quarterly"):
        period = "monthly"

    date_from, date_to = _period_dates(period)

    # Unnest all_investors array, group by investor name, sum capital
    stmt = text("""
        SELECT
            investor_name,
            COUNT(*)::int                               AS deal_count,
            COALESCE(SUM(amount_usd), 0)::bigint        AS total_capital_usd
        FROM deals,
             UNNEST(all_investors) AS investor_name
        WHERE announced_date >= :date_from
          AND announced_date <= :date_to
          AND investor_name IS NOT NULL
          AND investor_name <> ''
        GROUP BY investor_name
        ORDER BY total_capital_usd DESC
        LIMIT :limit
    """)

    result = await db.execute(
        stmt,
        {"date_from": date_from, "date_to": date_to, "limit": limit},
    )
    rows = result.fetchall()

    investors = [
        InvestorLeaderboardEntry(
            investor_name=row.investor_name,
            deal_count=row.deal_count,
            total_capital_usd=int(row.total_capital_usd),
        )
        for row in rows
    ]

    return InvestorLeaderboardResponse(
        period=period,
        date_from=date_from,
        date_to=date_to,
        investors=investors,
    )
