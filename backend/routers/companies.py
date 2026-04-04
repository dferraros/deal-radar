from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.database import get_session
from backend.models import Company, Deal, Watchlist
from backend.schemas import CompanyResponse, DealResponse

router = APIRouter(tags=["companies"])


def _build_deal_response(deal: Deal, company: Company) -> DealResponse:
    """Convert Deal + owning Company into DealResponse."""
    return DealResponse(
        id=deal.id,
        company_id=deal.company_id,
        company_name=company.name,
        deal_type=deal.deal_type,
        amount_usd=deal.amount_usd,
        round_label=deal.round_label,
        announced_date=deal.announced_date,
        lead_investor=deal.lead_investor,
        all_investors=deal.all_investors or [],
        source_url=deal.source_url,
        source_name=deal.source_name,
        ai_summary=deal.ai_summary,
        sector=company.sector or [],
        geo=company.geo,
    )


async def _is_watchlisted(db: AsyncSession, company_id: UUID) -> bool:
    """Return True if the company has a watchlist entry."""
    stmt = select(Watchlist.id).where(Watchlist.company_id == company_id).limit(1)
    result = await db.execute(stmt)
    return result.scalar_one_or_none() is not None


@router.get("/companies/search", response_model=list[CompanyResponse])
async def search_companies(
    q: str = Query(..., min_length=2, description="Search companies by name"),
    db: AsyncSession = Depends(get_session),
) -> list[CompanyResponse]:
    """Search companies by name (case-insensitive, up to 10 results)."""

    stmt = (
        select(Company)
        .where(Company.name.ilike(f"%{q}%"))
        .options(selectinload(Company.deals))
        .limit(10)
    )
    result = await db.execute(stmt)
    companies = result.scalars().all()

    out: list[CompanyResponse] = []
    for company in companies:
        in_watchlist = await _is_watchlisted(db, company.id)
        deals_sorted = sorted(
            company.deals,
            key=lambda d: d.announced_date or __import__("datetime").date.min,
            reverse=True,
        )
        out.append(
            CompanyResponse(
                id=company.id,
                name=company.name,
                sector=company.sector or [],
                geo=company.geo,
                description=company.description,
                website=company.website,
                founded_year=company.founded_year,
                deals=[_build_deal_response(d, company) for d in deals_sorted],
                in_watchlist=in_watchlist,
            )
        )

    return out


@router.get("/companies/{company_id}", response_model=CompanyResponse)
async def get_company(
    company_id: UUID,
    db: AsyncSession = Depends(get_session),
) -> CompanyResponse:
    """Return a company with all its deals and watchlist status."""

    stmt = (
        select(Company)
        .where(Company.id == company_id)
        .options(selectinload(Company.deals))
    )
    result = await db.execute(stmt)
    company = result.scalar_one_or_none()

    if company is None:
        raise HTTPException(status_code=404, detail="Company not found")

    in_watchlist = await _is_watchlisted(db, company.id)

    # Order deals by announced_date DESC, nulls last
    deals_sorted = sorted(
        company.deals,
        key=lambda d: d.announced_date or __import__("datetime").date.min,
        reverse=True,
    )

    return CompanyResponse(
        id=company.id,
        name=company.name,
        sector=company.sector or [],
        geo=company.geo,
        description=company.description,
        website=company.website,
        founded_year=company.founded_year,
        deals=[_build_deal_response(d, company) for d in deals_sorted],
        in_watchlist=in_watchlist,
    )
