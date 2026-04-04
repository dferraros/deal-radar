"""
FirecrawlFetcher — enriches short RawDeal entries with full article content.

This fetcher works as an enricher, not a discovery source:
  - fetch()   -> always returns [] (Firecrawl doesn't discover deals)
  - enrich()  -> takes a list of RawDeals, scrapes short ones, returns enriched list

Scraping is rate-limit friendly: max 5 concurrent requests at a time.
"""

import asyncio
import logging
import os
from datetime import date

from backend.ingestion.base import BaseFetcher, RawDeal

logger = logging.getLogger(__name__)

# Deals with raw_text shorter than this will be enriched via Firecrawl scrape
_SHORT_TEXT_THRESHOLD = 500

# Max concurrent Firecrawl scrapes
_MAX_CONCURRENT = 5


class FirecrawlFetcher(BaseFetcher):
    """
    Firecrawl-based article enricher.

    Does NOT discover new deals — it enriches deals from other fetchers
    that have short raw_text by scraping the full article via Firecrawl.
    """

    @property
    def source_name(self) -> str:
        return "firecrawl"

    async def fetch(self, target_date: date) -> list[RawDeal]:
        """
        FirecrawlFetcher is an enricher, not a discovery source.
        Always returns an empty list — call enrich() separately.
        """
        return []

    async def enrich(self, raw_deals: list[RawDeal]) -> list[RawDeal]:
        """
        Enrich deals that have short raw_text by scraping their URLs.

        Deals with raw_text >= _SHORT_TEXT_THRESHOLD chars are returned as-is.
        Deals with short text get their URL scraped; on error the original
        short text is kept (no deal is lost).

        Args:
            raw_deals: List of RawDeal objects from any source.

        Returns:
            The same list with short-text deals enriched where possible.
        """
        api_key = os.environ.get("FIRECRAWL_API_KEY", "")
        if not api_key:
            logger.warning(
                "FIRECRAWL_API_KEY is not set — skipping enrichment, "
                "returning deals as-is"
            )
            return raw_deals

        try:
            from firecrawl import FirecrawlApp  # type: ignore
        except ImportError:
            logger.error(
                "firecrawl-py is not installed — skipping enrichment, "
                "returning deals as-is"
            )
            return raw_deals

        app = FirecrawlApp(api_key=api_key)

        # Partition deals: short ones need enrichment
        needs_enrichment = [
            (i, deal)
            for i, deal in enumerate(raw_deals)
            if len(deal.raw_text) < _SHORT_TEXT_THRESHOLD and deal.url
        ]

        if not needs_enrichment:
            logger.info("FirecrawlFetcher: no deals require enrichment")
            return raw_deals

        logger.info(
            "FirecrawlFetcher: enriching %d / %d deals",
            len(needs_enrichment),
            len(raw_deals),
        )

        # Work on a mutable copy to avoid mutating the caller's list
        enriched_deals = list(raw_deals)

        # Semaphore limits concurrent scrapes
        semaphore = asyncio.Semaphore(_MAX_CONCURRENT)

        async def _scrape_one(index: int, deal: RawDeal) -> None:
            async with semaphore:
                try:
                    loop = asyncio.get_event_loop()
                    result = await loop.run_in_executor(
                        None,
                        lambda: app.scrape_url(
                            deal.url,
                            params={"formats": ["markdown"]},
                        ),
                    )

                    # FirecrawlApp.scrape_url returns a dict with 'markdown' key
                    markdown_content: str = ""
                    if isinstance(result, dict):
                        markdown_content = result.get("markdown", "") or ""
                    elif hasattr(result, "markdown"):
                        # Newer SDK versions may return an object
                        markdown_content = result.markdown or ""

                    if markdown_content.strip():
                        # Replace the RawDeal with an enriched copy
                        enriched_deals[index] = RawDeal(
                            source=deal.source,
                            company_name=deal.company_name,
                            amount_raw=deal.amount_raw,
                            date_raw=deal.date_raw,
                            url=deal.url,
                            raw_text=markdown_content,
                            title=deal.title,
                        )
                        logger.debug(
                            "Enriched %s (%d chars -> %d chars)",
                            deal.url,
                            len(deal.raw_text),
                            len(markdown_content),
                        )
                    else:
                        logger.debug(
                            "Firecrawl returned empty content for %s — keeping original",
                            deal.url,
                        )
                except Exception as exc:
                    # 404s, paywalls, scrape errors — keep the original short text
                    logger.warning(
                        "Firecrawl scrape failed for %s: %s — keeping original text",
                        deal.url,
                        exc,
                    )

        await asyncio.gather(*[_scrape_one(i, deal) for i, deal in needs_enrichment])

        enriched_count = sum(
            1
            for (i, _), original in zip(needs_enrichment, [raw_deals[i] for i, _ in needs_enrichment])
            if len(enriched_deals[i].raw_text) > len(original.raw_text)
        )
        logger.info(
            "FirecrawlFetcher: successfully enriched %d / %d deals",
            enriched_count,
            len(needs_enrichment),
        )

        return enriched_deals
