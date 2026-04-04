"""
Watchlist router — Plan 03-03

Endpoints:
  GET    /api/watchlist                  → list all watchlisted companies (with recent deals)
  POST   /api/watchlist                  → add a company to the watchlist
  DELETE /api/watchlist/{company_id}     → remove a company from the watchlist
  PATCH  /api/watchlist/{company_id}     → update notes for a watchlisted company
"""

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.database import get_session
from backend.models import Company, Deal, Watchlist
from backend.schemas import DealResponse, WatchlistResponse

logger = logging.getLogger(__name__)

router = APIRouter(tags=["watchlist"])

_RECENT_DEALS_LIMIT = 5


# ---------------------------------------------------------------------------
# Request bodies
# ---------------------------------------------------------------------------

class WatchlistAddBody(BaseModel):
    company_id: uuid.UUID
    notes: str = ""


class WatchlistPatchBody(BaseModel):
    notes: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _build_watchlist_response(
    entry: Watchlist, db: AsyncSession
) -> WatchlistResponse:
    """
    Given a Watchlist ORM row, load the company + its recent deals and
    return a WatchlistResponse schema object.
    """
    company: Company = entry.company

    # Fetch the last N deals for this company ordered by announced_date desc
    stmt = (
        select(Deal)
        .where(Deal.company_id == company.id)
        .order_by(Deal.announced_date.desc().nullslast(), Deal.created_at.desc())
        .limit(_RECENT_DEALS_LIMIT)
    )
    result = await db.execute(stmt)
    deals = result.scalars().all()

    recent_deals = [
        DealResponse(
            id=d.id,
            company_id=d.company_id,
            company_name=company.name,
            deal_type=d.deal_type,
            amount_usd=d.amount_usd,
            round_label=d.round_label,
            announced_date=d.announced_date,
            lead_investor=d.lead_investor,
            all_investors=d.all_investors or [],
            source_url=d.source_url,
            source_name=d.source_name,
            ai_summary=d.ai_summary,
            sector=company.sector or [],
            geo=company.geo,
            currency=d.currency,
            closed_date=d.closed_date,
            created_at=d.created_at,
        )
        for d in deals
    ]

    return WatchlistResponse(
        id=entry.id,
        company_id=company.id,
        company_name=company.name,
        company_sector=company.sector or [],
        company_geo=company.geo,
        notes=entry.notes,
        added_at=entry.added_at,
        recent_deals=recent_deals,
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/watchlist", response_model=list[WatchlistResponse])
async def list_watchlist(db: AsyncSession = Depends(get_session)):
    """Return all watchlisted companies with company info and recent deals."""
    stmt = (
        select(Watchlist)
        .options(selectinload(Watchlist.company))
        .order_by(Watchlist.added_at.desc())
    )
    result = await db.execute(stmt)
    entries = result.scalars().all()

    responses = []
    for entry in entries:
        responses.append(await _build_watchlist_response(entry, db))

    return responses


@router.post("/watchlist", response_model=WatchlistResponse, status_code=status.HTTP_201_CREATED)
async def add_to_watchlist(body: WatchlistAddBody, db: AsyncSession = Depends(get_session)):
    """Add a company to the watchlist. Returns 409 if already present."""
    # Verify the company exists
    company_result = await db.execute(
        select(Company).where(Company.id == body.company_id)
    )
    company = company_result.scalars().first()
    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Company {body.company_id} not found",
        )

    # Check for duplicate
    existing_result = await db.execute(
        select(Watchlist).where(Watchlist.company_id == body.company_id)
    )
    existing = existing_result.scalars().first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Company {body.company_id} is already in the watchlist",
        )

    entry = Watchlist(
        id=uuid.uuid4(),
        company_id=body.company_id,
        notes=body.notes or None,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)

    # Load relationship for response building
    await db.refresh(entry, attribute_names=["company"])

    return await _build_watchlist_response(entry, db)


@router.delete("/watchlist/{company_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_from_watchlist(company_id: uuid.UUID, db: AsyncSession = Depends(get_session)):
    """Remove a company from the watchlist. Returns 404 if not present."""
    result = await db.execute(
        select(Watchlist).where(Watchlist.company_id == company_id)
    )
    entry = result.scalars().first()
    if not entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Company {company_id} is not in the watchlist",
        )

    await db.delete(entry)
    await db.commit()


@router.patch("/watchlist/{company_id}", response_model=WatchlistResponse)
async def update_watchlist_notes(
    company_id: uuid.UUID,
    body: WatchlistPatchBody,
    db: AsyncSession = Depends(get_session),
):
    """Update notes for a watchlisted company. Returns 404 if not present."""
    result = await db.execute(
        select(Watchlist)
        .where(Watchlist.company_id == company_id)
        .options(selectinload(Watchlist.company))
    )
    entry = result.scalars().first()
    if not entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Company {company_id} is not in the watchlist",
        )

    entry.notes = body.notes
    await db.commit()
    await db.refresh(entry)

    return await _build_watchlist_response(entry, db)
