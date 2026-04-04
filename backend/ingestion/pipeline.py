"""
Ingestion pipeline orchestrator.

run_ingestion() ties all fetchers together:
  1. Run RSSFetcher + TavilyFetcher concurrently
  2. Enrich short raw_text entries via FirecrawlFetcher
  3. Log an ingestion_run DB record per source
  4. Return a summary dict: { source: { found, added, errors } }

Note: AI extraction + deduplication + final DB insert happen in Plans 02-04 / 02-05.
This plan returns raw deals in the summary for testing.
"""

import asyncio
import logging
import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from backend.ingestion.ai_extractor import AIExtractor
from backend.ingestion.base import RawDeal
from backend.ingestion.firecrawl import FirecrawlFetcher
from backend.ingestion.rss import RSSFetcher
from backend.ingestion.tavily import TavilyFetcher
from backend.models import IngestionRun

logger = logging.getLogger(__name__)


async def _run_fetcher_safe(
    fetcher, target_date: date
) -> tuple[str, list[RawDeal], str | None]:
    """
    Run a single fetcher with error isolation.

    Returns (source_name, deals, error_message_or_None).
    A failure in one fetcher never propagates to others.
    """
    source = fetcher.source_name
    try:
        deals = await fetcher.fetch(target_date)
        return source, deals, None
    except Exception as exc:
        logger.error("Fetcher %r failed: %s", source, exc, exc_info=True)
        return source, [], str(exc)


async def _log_ingestion_run(
    db: AsyncSession,
    source: str,
    status: str,
    deals_found: int,
    deals_added: int,
    error_log: str | None,
) -> None:
    """Insert a single ingestion_run record. Errors are logged, not raised."""
    try:
        run = IngestionRun(
            id=uuid.uuid4(),
            source=source,
            status=status,
            deals_found=deals_found,
            deals_added=deals_added,
            run_at=datetime.utcnow(),
            error_log=error_log,
        )
        db.add(run)
        await db.commit()
    except Exception as exc:
        logger.error("Failed to log ingestion_run for source %r: %s", source, exc)
        await db.rollback()


async def run_ingestion(
    db_session: AsyncSession,
    target_date: date | None = None,
) -> dict[str, Any]:
    """
    Run the full ingestion pipeline for target_date (defaults to today).

    Returns a summary dict structured as:
    {
        "date": "YYYY-MM-DD",
        "sources": {
            "<source_name>": {
                "found": int,
                "added": int,   # always 0 until 02-05 dedup/insert lands
                "errors": []    # list of error strings
            }
        },
        "total_found": int,
        "raw_deals": [...]  # list of RawDeal objects (for testing / 02-04 handoff)
    }
    """
    if target_date is None:
        target_date = date.today()

    logger.info("Starting ingestion pipeline for %s", target_date)

    # --- Step 1: Run discovery fetchers concurrently ---
    rss_fetcher = RSSFetcher()
    tavily_fetcher = TavilyFetcher()
    firecrawl_fetcher = FirecrawlFetcher()

    fetch_tasks = [
        _run_fetcher_safe(rss_fetcher, target_date),
        _run_fetcher_safe(tavily_fetcher, target_date),
        # FirecrawlFetcher.fetch() always returns [] — it's an enricher only
        _run_fetcher_safe(firecrawl_fetcher, target_date),
    ]

    fetch_results = await asyncio.gather(*fetch_tasks)

    # --- Step 2: Aggregate results ---
    source_summary: dict[str, dict[str, Any]] = {}
    all_deals: list[RawDeal] = []

    for source_name, deals, error in fetch_results:
        source_summary[source_name] = {
            "found": len(deals),
            "added": 0,  # populated by 02-05 after dedup + insert
            "errors": [error] if error else [],
        }
        all_deals.extend(deals)

    logger.info(
        "Discovery phase complete: %d raw deals from %d sources",
        len(all_deals),
        len(fetch_results),
    )

    # --- Step 3: Enrich short raw_text via Firecrawl ---
    try:
        all_deals = await firecrawl_fetcher.enrich(all_deals)
        logger.info("Enrichment complete: %d deals after Firecrawl pass", len(all_deals))
    except Exception as exc:
        logger.error("Firecrawl enrichment step failed: %s", exc, exc_info=True)
        # Non-fatal: continue with un-enriched deals

    # --- Step 4: AI extraction ---
    extracted_deals = []
    try:
        extractor = AIExtractor()
        extracted_deals = await extractor.extract_batch(all_deals)
        logger.info("AI extraction complete: %d deals extracted", len(extracted_deals))
    except Exception as exc:
        logger.error("AI extraction step failed: %s", exc, exc_info=True)
        # Non-fatal: continue with empty extracted_deals list

    # --- Step 5: Log ingestion_run records per source ---
    for source_name, info in source_summary.items():
        status = "failed" if info["errors"] else "success"
        await _log_ingestion_run(
            db=db_session,
            source=source_name,
            status=status,
            deals_found=info["found"],
            deals_added=info["added"],
            error_log="; ".join(info["errors"]) if info["errors"] else None,
        )

    # --- Step 6: Return summary ---
    summary = {
        "date": target_date.isoformat(),
        "sources": source_summary,
        "total_found": len(all_deals),
        "raw_deals": all_deals,
        "extracted_deals": extracted_deals,  # ExtractedDeal list — handed off to 02-05 dedup/insert
    }

    logger.info(
        "Ingestion pipeline complete for %s: %d total deals found",
        target_date,
        len(all_deals),
    )

    return summary
