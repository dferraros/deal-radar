from __future__ import annotations

import logging
import os
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_session
from backend.models import Company, Deal
from backend.schemas import BriefingResponse

logger = logging.getLogger(__name__)

router = APIRouter(tags=["briefing"])

# Simple module-level cache — resets on server restart
_briefing_cache: dict = {"generated_at": None, "text": None}


def _cache_is_fresh() -> bool:
    """Return True if cached briefing is less than 6 days old."""
    generated_at = _briefing_cache.get("generated_at")
    if generated_at is None:
        return False
    age = datetime.now(timezone.utc) - generated_at
    return age.total_seconds() < 6 * 24 * 3600


def _should_regenerate() -> bool:
    """Regenerate if today is Monday OR cache is stale."""
    if not _cache_is_fresh():
        return True
    today = date.today()
    return today.weekday() == 0  # 0 = Monday


async def _generate_ai_summary(
    total_deals: int,
    total_capital: int,
    top_company: Optional[str],
    top_amount: Optional[int],
    sectors: list[str],
    geos: list[str],
) -> Optional[str]:
    """Call Claude Haiku to generate a 3-sentence market summary."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return None

    try:
        import anthropic

        client = anthropic.Anthropic(api_key=api_key)

        top_amount_b = f"{top_amount / 1_000_000_000:.2f}" if top_amount else "N/A"
        total_capital_b = f"{total_capital / 1_000_000_000:.2f}"
        sectors_str = ", ".join(sectors[:5]) if sectors else "N/A"
        geos_str = ", ".join(geos[:5]) if geos else "N/A"
        top_company_str = top_company or "N/A"

        prompt = (
            f"You are a financial analyst. Summarize this week's deal activity in exactly 3 sentences.\n"
            f"Data: {total_deals} deals, ${total_capital_b}B raised. "
            f"Top deal: {top_company_str} raised ${top_amount_b}B. "
            f"Top sectors: {sectors_str}. Top geos: {geos_str}.\n"
            f"Return only the 3-sentence summary, no preamble."
        )

        message = client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=256,
            messages=[{"role": "user", "content": prompt}],
        )
        return message.content[0].text.strip()
    except Exception as exc:
        logger.warning("[Briefing] AI summary failed: %s", exc)
        return None


@router.get("/briefing/latest", response_model=BriefingResponse)
async def get_latest_briefing(
    db: AsyncSession = Depends(get_session),
) -> BriefingResponse:
    """Return a weekly deal briefing with optional AI summary."""

    today = date.today()
    week_start = today - timedelta(days=7)
    week_end = today

    # Fetch all deals from the last 7 days
    stmt = (
        select(Deal)
        .outerjoin(Company, Deal.company_id == Company.id)
        .where(Deal.announced_date >= week_start)
        .where(Deal.announced_date <= week_end)
    )
    result = await db.execute(stmt)
    deals = result.scalars().all()

    deal_count = len(deals)
    total_capital = sum(d.amount_usd or 0 for d in deals)

    # Top deal by amount
    top_deal = max(deals, key=lambda d: d.amount_usd or 0, default=None)
    top_company: Optional[str] = None
    top_amount: Optional[int] = None
    if top_deal and top_deal.company:
        top_company = top_deal.company.name
        top_amount = top_deal.amount_usd
    elif top_deal:
        top_amount = top_deal.amount_usd

    # Top sector — flatten company.sector arrays
    sector_counter: Counter = Counter()
    geo_counter: Counter = Counter()
    for d in deals:
        if d.company:
            for s in (d.company.sector or []):
                sector_counter[s] += 1
            if d.company.geo:
                geo_counter[d.company.geo] += 1

    top_sector: Optional[str] = sector_counter.most_common(1)[0][0] if sector_counter else None
    top_sectors = [s for s, _ in sector_counter.most_common(5)]
    top_geos = [g for g, _ in geo_counter.most_common(5)]

    # Decide whether to generate/use cached AI summary
    ai_summary: Optional[str] = None
    generated_at: Optional[datetime] = None

    if _should_regenerate():
        ai_summary = await _generate_ai_summary(
            total_deals=deal_count,
            total_capital=total_capital,
            top_company=top_company,
            top_amount=top_amount,
            sectors=top_sectors,
            geos=top_geos,
        )
        if ai_summary:
            _briefing_cache["text"] = ai_summary
            _briefing_cache["generated_at"] = datetime.now(timezone.utc)
    else:
        ai_summary = _briefing_cache.get("text")

    generated_at = _briefing_cache.get("generated_at")

    return BriefingResponse(
        week_start=week_start,
        week_end=week_end,
        deal_count=deal_count,
        total_capital_usd=total_capital,
        top_company=top_company,
        top_amount_usd=top_amount,
        top_sector=top_sector,
        ai_summary=ai_summary,
        generated_at=generated_at,
    )
