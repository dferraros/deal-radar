from __future__ import annotations

import csv
import io
import math
from datetime import date
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.database import get_session
from backend.models import Company, Deal
from backend.schemas import DealResponse, DealsListResponse

router = APIRouter(tags=["deals"])


def _build_deal_response(deal: Deal) -> DealResponse:
    """Convert a Deal ORM row (with .company loaded) to DealResponse."""
    company = deal.company
    return DealResponse(
        id=deal.id,
        company_id=deal.company_id,
        company_name=company.name if company else None,
        deal_type=deal.deal_type,
        amount_usd=deal.amount_usd,
        round_label=deal.round_label,
        announced_date=deal.announced_date,
        lead_investor=deal.lead_investor,
        all_investors=deal.all_investors or [],
        source_url=deal.source_url,
        source_name=deal.source_name,
        ai_summary=deal.ai_summary,
        sector=company.sector or [] if company else [],
        geo=company.geo if company else None,
        tech_stack=company.tech_stack or [] if company else [],
        company_website=company.website if company else None,
    )


@router.get("/deals", response_model=DealsListResponse)
async def list_deals(
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    deal_type: Optional[str] = Query(None, description="vc | ma | crypto | ipo"),
    sector: Optional[str] = Query(None, description="Filter by sector tag"),
    geo: Optional[str] = Query(None, description="Exact match on company geo"),
    amount_min: Optional[int] = Query(None, description="Minimum amount_usd"),
    q: Optional[str] = Query(None, description="Search by company name"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_session),
) -> DealsListResponse:
    """Return a paginated, filtered list of deals with company context."""

    # Base query — always join company so we can filter + return company fields
    base_stmt = (
        select(Deal)
        .outerjoin(Company, Deal.company_id == Company.id)
        .options(selectinload(Deal.company))
    )

    # --- Filters ---
    if date_from is not None:
        base_stmt = base_stmt.where(Deal.announced_date >= date_from)
    if date_to is not None:
        base_stmt = base_stmt.where(Deal.announced_date <= date_to)
    if deal_type is not None:
        base_stmt = base_stmt.where(Deal.deal_type == deal_type)
    if sector is not None:
        # ARRAY contains: ANY(company.sector) = :sector
        base_stmt = base_stmt.where(Company.sector.any(sector))
    if geo is not None:
        base_stmt = base_stmt.where(Company.geo == geo)
    if amount_min is not None:
        base_stmt = base_stmt.where(Deal.amount_usd >= amount_min)
    if q is not None and q.strip():
        base_stmt = base_stmt.where(
            Company.name.ilike(f"%{q.strip()}%")
        )

    # --- Count total (before pagination) ---
    count_stmt = select(func.count()).select_from(base_stmt.subquery())
    total: int = (await db.execute(count_stmt)).scalar_one()

    # --- Order + paginate ---
    offset = (page - 1) * limit
    rows_stmt = (
        base_stmt
        .order_by(Deal.announced_date.desc().nullslast(), Deal.created_at.desc())
        .offset(offset)
        .limit(limit)
    )

    result = await db.execute(rows_stmt)
    deals = result.scalars().all()

    pages = max(1, math.ceil(total / limit))

    return DealsListResponse(
        deals=[_build_deal_response(d) for d in deals],
        total=total,
        page=page,
        pages=pages,
    )


@router.get("/deals/export")
async def export_deals_csv(
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    deal_type: Optional[str] = Query(None, description="vc | ma | crypto | ipo"),
    sector: Optional[str] = Query(None, description="Filter by sector tag"),
    geo: Optional[str] = Query(None, description="Exact match on company geo"),
    amount_min: Optional[int] = Query(None, description="Minimum amount_usd"),
    q: Optional[str] = Query(None, description="Search by company name"),
    db: AsyncSession = Depends(get_session),
) -> StreamingResponse:
    """Export filtered deals as a CSV file download."""

    stmt = (
        select(Deal)
        .outerjoin(Company, Deal.company_id == Company.id)
        .options(selectinload(Deal.company))
    )

    if date_from is not None:
        stmt = stmt.where(Deal.announced_date >= date_from)
    if date_to is not None:
        stmt = stmt.where(Deal.announced_date <= date_to)
    if deal_type is not None:
        stmt = stmt.where(Deal.deal_type == deal_type)
    if sector is not None:
        stmt = stmt.where(Company.sector.any(sector))
    if geo is not None:
        stmt = stmt.where(Company.geo == geo)
    if amount_min is not None:
        stmt = stmt.where(Deal.amount_usd >= amount_min)
    if q is not None and q.strip():
        stmt = stmt.where(
            Company.name.ilike(f"%{q.strip()}%")
        )

    stmt = stmt.order_by(Deal.announced_date.desc().nullslast(), Deal.created_at.desc())
    result = await db.execute(stmt)
    deals = result.scalars().all()

    def generate_csv():
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow([
            "date", "company", "round", "deal_type", "amount_usd",
            "sector", "geo", "lead_investor", "source_url", "ai_summary",
        ])
        for deal in deals:
            company = deal.company
            writer.writerow([
                deal.announced_date or "",
                company.name if company else "",
                deal.round_label or "",
                deal.deal_type or "",
                deal.amount_usd if deal.amount_usd is not None else "",
                "|".join(company.sector or []) if company else "",
                company.geo if company else "",
                deal.lead_investor or "",
                deal.source_url or "",
                (deal.ai_summary or "").replace("\n", " "),
            ])
        output.seek(0)
        yield output.read()

    today_str = date.today().isoformat()
    headers = {
        "Content-Disposition": f'attachment; filename="deals-{today_str}.csv"',
    }
    return StreamingResponse(
        generate_csv(),
        media_type="text/csv",
        headers=headers,
    )


@router.get("/deals/sectors")
async def list_deal_sectors(db: AsyncSession = Depends(get_session)):
    """Return all distinct sector values present in the companies table."""
    from sqlalchemy import text as sa_text
    result = await db.execute(
        sa_text("SELECT DISTINCT unnest(sector) AS s FROM companies WHERE sector IS NOT NULL ORDER BY s")
    )
    sectors = [row[0] for row in result.fetchall()]
    return {"sectors": sectors}


@router.get("/deals/{deal_id}", response_model=DealResponse)
async def get_deal(
    deal_id: UUID,
    db: AsyncSession = Depends(get_session),
) -> DealResponse:
    """Return a single deal by ID, including raw_text and ai_summary."""

    stmt = (
        select(Deal)
        .where(Deal.id == deal_id)
        .options(selectinload(Deal.company))
    )
    result = await db.execute(stmt)
    deal = result.scalar_one_or_none()

    if deal is None:
        raise HTTPException(status_code=404, detail="Deal not found")

    return _build_deal_response(deal)
