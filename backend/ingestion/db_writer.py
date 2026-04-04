"""
DB Writer — Plan 02-05

Persists ExtractedDeal records to PostgreSQL, creating Company records as needed.

write_deals():
  - Skips deals with confidence < 0.2 (likely extraction failures)
  - Creates Company records on first encounter (case-insensitive name match)
  - Skips Deal records that already exist (same company_id + announced_date + amount_usd)
  - Commits after each successful deal write (safer for partial failures)
  - Returns { 'added': int, 'skipped_duplicates': int, 'errors': list[str] }
"""

import logging
import uuid
from typing import Any

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from backend.ingestion.ai_extractor import ExtractedDeal
from backend.ingestion.base import RawDeal
from backend.models import Company, Deal

logger = logging.getLogger(__name__)

# Minimum confidence threshold for writing to DB
_MIN_CONFIDENCE = 0.2


async def write_deals(
    db_session: AsyncSession,
    extracted_deals: list[ExtractedDeal],
    raw_deals: list[RawDeal],
) -> dict[str, Any]:
    """
    Write extracted deals to DB. Creates Company records if not exists.

    Parameters
    ----------
    db_session:
        Active async SQLAlchemy session.
    extracted_deals:
        Deduped list of ExtractedDeal Pydantic objects.
    raw_deals:
        Parallel list of RawDeal objects (same length/order as extracted_deals),
        used to populate source_url, source_name, and raw_text on Deal records.
        If lengths differ, raw deal data is accessed by index with a fallback to None.

    Returns
    -------
    dict with keys: added (int), skipped_duplicates (int), errors (list[str])
    """
    added = 0
    skipped_duplicates = 0
    errors: list[str] = []

    for idx, extracted in enumerate(extracted_deals):
        # --- Confidence gate ---
        if extracted.confidence < _MIN_CONFIDENCE:
            logger.debug(
                "db_writer: skipping %r (confidence %.2f < %.2f)",
                extracted.company_name,
                extracted.confidence,
                _MIN_CONFIDENCE,
            )
            skipped_duplicates += 1
            continue

        # Safely get matching RawDeal
        raw: RawDeal | None = raw_deals[idx] if idx < len(raw_deals) else None

        try:
            # --- Step 1: Get or create Company ---
            company = await _get_or_create_company(db_session, extracted)

            # --- Step 2: Check for existing Deal (exact DB duplicate) ---
            existing_deal = await _find_existing_deal(
                db_session, company.id, extracted
            )
            if existing_deal:
                logger.debug(
                    "db_writer: deal already exists for %r on %s — skipping",
                    extracted.company_name,
                    extracted.announced_date,
                )
                skipped_duplicates += 1
                continue

            # --- Step 3: Create Deal record ---
            deal = Deal(
                id=uuid.uuid4(),
                company_id=company.id,
                deal_type=extracted.deal_type,
                amount_usd=extracted.amount_usd,
                currency=extracted.currency,
                round_label=extracted.round_label,
                announced_date=extracted.announced_date,
                closed_date=None,
                lead_investor=extracted.lead_investor,
                all_investors=extracted.all_investors or [],
                source_url=raw.url if raw else None,
                source_name=raw.source if raw else None,
                raw_text=raw.raw_text if raw else None,
                ai_summary=extracted.ai_summary or None,
            )
            db_session.add(deal)
            await db_session.commit()
            added += 1

            logger.info(
                "db_writer: added deal for %r (%s, %s)",
                extracted.company_name,
                extracted.deal_type,
                extracted.announced_date,
            )

        except Exception as exc:
            error_msg = f"Error writing deal for {extracted.company_name!r}: {exc}"
            logger.error(error_msg, exc_info=True)
            errors.append(error_msg)
            try:
                await db_session.rollback()
            except Exception:
                pass

    logger.info(
        "db_writer: complete — added=%d, skipped=%d, errors=%d",
        added,
        skipped_duplicates,
        len(errors),
    )

    return {
        "added": added,
        "skipped_duplicates": skipped_duplicates,
        "errors": errors,
    }


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------


async def _get_or_create_company(
    db_session: AsyncSession, extracted: ExtractedDeal
) -> Company:
    """
    Return existing Company by name (case-insensitive) or create a new one.
    """
    stmt = select(Company).where(
        func.lower(Company.name) == extracted.company_name.lower()
    )
    result = await db_session.execute(stmt)
    company = result.scalars().first()

    if company:
        # Update tech_stack if we have new data and existing is empty
        if extracted.tech_stack and not company.tech_stack:
            company.tech_stack = extracted.tech_stack
        return company

    # Create new Company
    company = Company(
        id=uuid.uuid4(),
        name=extracted.company_name,
        sector=extracted.sector or [],
        tech_stack=extracted.tech_stack or [],
        geo=extracted.geo,
        description=extracted.company_description,
        website=extracted.company_website,
    )
    db_session.add(company)
    await db_session.flush()  # get the id without full commit
    logger.debug("db_writer: created company %r", extracted.company_name)
    return company


async def _find_existing_deal(
    db_session: AsyncSession,
    company_id: uuid.UUID,
    extracted: ExtractedDeal,
) -> Deal | None:
    """
    Check if a Deal already exists with the same company_id, announced_date,
    and amount_usd (all three must match exactly).
    """
    stmt = select(Deal).where(
        Deal.company_id == company_id,
        Deal.announced_date == extracted.announced_date,
        Deal.amount_usd == extracted.amount_usd,
    )
    result = await db_session.execute(stmt)
    return result.scalars().first()
