"""
Manual Ingest router — Plan 03-03

Endpoints:
  POST /api/ingest/manual   → Scrape URL or accept raw text, run AI extraction, return preview
  POST /api/ingest/confirm  → Save a confirmed (possibly user-edited) preview to DB
"""

import asyncio
import logging
import uuid
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, model_validator
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_session
from backend.ingestion.ai_extractor import AIExtractor, ExtractedDeal
from backend.ingestion.base import RawDeal
from backend.ingestion.db_writer import write_deals
from backend.schemas import ManualIngestPreview

logger = logging.getLogger(__name__)

router = APIRouter(tags=["ingest"])


# ---------------------------------------------------------------------------
# Request body for /api/ingest/manual
# ---------------------------------------------------------------------------

class ManualIngestBody(BaseModel):
    url: str | None = None
    text: str | None = None

    @model_validator(mode="after")
    def at_least_one(self):
        if not self.url and not self.text:
            raise ValueError("At least one of 'url' or 'text' must be provided")
        return self


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _extracted_to_preview(
    extracted: ExtractedDeal,
    raw_text: str,
    source_url: str | None,
) -> ManualIngestPreview:
    return ManualIngestPreview(
        company_name=extracted.company_name,
        deal_type=extracted.deal_type,
        amount_usd=extracted.amount_usd,
        round_label=extracted.round_label,
        announced_date=extracted.announced_date,
        sector=extracted.sector,
        geo=extracted.geo,
        lead_investor=extracted.lead_investor,
        all_investors=extracted.all_investors,
        ai_summary=extracted.ai_summary,
        source_url=source_url,
        raw_text=raw_text,
        confidence=extracted.confidence,
    )


async def _scrape_url(url: str) -> str | None:
    """
    Scrape a URL via FirecrawlApp (sync SDK run in executor).
    Returns markdown text on success, None on failure.
    """
    import os

    api_key = os.environ.get("FIRECRAWL_API_KEY", "")
    if not api_key:
        logger.warning("FIRECRAWL_API_KEY not set — cannot scrape URL")
        return None

    try:
        from firecrawl import FirecrawlApp  # type: ignore
    except ImportError:
        logger.error("firecrawl-py is not installed — cannot scrape URL")
        return None

    app = FirecrawlApp(api_key=api_key)

    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: app.scrape_url(url, params={"formats": ["markdown"]}),
        )

        markdown_content: str = ""
        if isinstance(result, dict):
            markdown_content = result.get("markdown", "") or ""
        elif hasattr(result, "markdown"):
            markdown_content = result.markdown or ""

        return markdown_content.strip() or None

    except Exception as exc:
        logger.warning("Firecrawl scrape failed for %s: %s", url, exc)
        return None


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/ingest/manual", response_model=ManualIngestPreview)
async def manual_ingest_preview(body: ManualIngestBody):
    """
    Scrape a URL (via Firecrawl) or accept raw text, run AI extraction,
    and return a preview WITHOUT saving to DB.

    The caller may edit the preview fields before confirming via /api/ingest/confirm.
    """
    raw_text: str = ""
    source_url: str | None = body.url

    # Step 1: Get raw text — scrape URL first, fall back to body.text
    if body.url:
        scraped = await _scrape_url(body.url)
        if scraped:
            raw_text = scraped
            logger.info("Manual ingest: scraped %d chars from %s", len(raw_text), body.url)
        else:
            # Firecrawl failed — fall back to text body if provided
            if body.text:
                raw_text = body.text
                logger.info(
                    "Manual ingest: Firecrawl failed for %s, using provided text (%d chars)",
                    body.url,
                    len(raw_text),
                )
            else:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=(
                        "Could not scrape the provided URL and no fallback text was supplied. "
                        "Provide a 'text' field as a fallback."
                    ),
                )
    else:
        # URL not provided — use body.text directly
        raw_text = body.text  # type: ignore[assignment]  # validator guarantees non-None

    # Step 2: Build a RawDeal for the extractor
    raw_deal = RawDeal(
        source="manual",
        company_name="",
        amount_raw=None,
        date_raw=str(date.today()),
        url=body.url or "",
        raw_text=raw_text,
        title=None,
    )

    # Step 3: Run AI extraction
    extractor = AIExtractor()
    extracted = await extractor.extract(raw_deal)

    return _extracted_to_preview(extracted, raw_text, source_url)


@router.post("/ingest/confirm", status_code=status.HTTP_201_CREATED)
async def confirm_manual_ingest(
    preview: ManualIngestPreview,
    db: AsyncSession = Depends(get_session),
):
    """
    Save a confirmed ManualIngestPreview to the database.

    The user may have edited any fields in the preview before calling this endpoint.
    Creates a Company if one with that name doesn't exist, then inserts a Deal.

    Returns: { deal_id, company_id, status }
    """
    # Reconstruct an ExtractedDeal from the preview so we can reuse write_deals()
    extracted = ExtractedDeal(
        company_name=preview.company_name,
        deal_type=preview.deal_type,  # type: ignore[arg-type]
        amount_usd=preview.amount_usd,
        round_label=preview.round_label,
        announced_date=preview.announced_date,
        sector=preview.sector,
        geo=preview.geo,
        lead_investor=preview.lead_investor,
        all_investors=preview.all_investors,
        ai_summary=preview.ai_summary,
        # Confidence must pass the _MIN_CONFIDENCE = 0.3 gate in write_deals.
        # A manually confirmed deal should always be saved, so floor at 1.0.
        confidence=1.0,
    )

    # Build a matching RawDeal for source metadata
    raw_deal = RawDeal(
        source="manual",
        company_name=preview.company_name,
        amount_raw=str(preview.amount_usd) if preview.amount_usd else None,
        date_raw=str(preview.announced_date) if preview.announced_date else str(date.today()),
        url=preview.source_url or "",
        raw_text=preview.raw_text,
        title=None,
    )

    result = await write_deals(db, [extracted], [raw_deal])

    if result["errors"]:
        logger.error("Manual ingest confirm errors: %s", result["errors"])
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save deal: {result['errors'][0]}",
        )

    if result["added"] == 0:
        # Likely a duplicate (same company + date + amount already exists)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Deal was not saved — a deal with the same company, date, and amount "
                "already exists in the database."
            ),
        )

    logger.info(
        "Manual ingest confirmed: company=%r, deal_type=%s",
        preview.company_name,
        preview.deal_type,
    )

    # Fetch the newly created deal's IDs for the response.
    # write_deals() doesn't return them directly, so we query by the unique triplet.
    from sqlalchemy import select, func
    from backend.models import Company, Deal

    company_stmt = select(Company).where(
        func.lower(Company.name) == preview.company_name.lower()
    )
    company_result = await db.execute(company_stmt)
    company = company_result.scalars().first()

    deal_id: uuid.UUID | None = None
    if company:
        deal_stmt = (
            select(Deal)
            .where(Deal.company_id == company.id)
            .order_by(Deal.created_at.desc())
            .limit(1)
        )
        deal_result = await db.execute(deal_stmt)
        deal = deal_result.scalars().first()
        if deal:
            deal_id = deal.id

    return {
        "deal_id": deal_id,
        "company_id": company.id if company else None,
        "status": "saved",
    }
