import asyncio
import logging
from datetime import date, timedelta
from time import struct_time
from typing import Optional

import feedparser

from backend.ingestion.base import BaseFetcher, RawDeal

logger = logging.getLogger(__name__)

# RSS feeds covering deal announcements across crypto, fintech, LatAm, and Europe
RSS_FEEDS = [
    # US Tech / VC
    "https://techcrunch.com/category/venture/feed/",
    "https://feeds.feedburner.com/venturebeat/SZYF",
    "https://news.crunchbase.com/feed/",
    "https://www.businesswire.com/rss/home/?rss=G22",      # BusinessWire VC press releases
    "https://www.prnewswire.com/rss/news-releases-list.rss",  # PR Newswire

    # Crypto / Web3
    "https://www.coindesk.com/arc/outboundfeeds/rss/",
    "https://www.theblock.co/rss.xml",
    "https://decrypt.co/feed",
    "https://thedefiant.io/feed",
    "https://cointelegraph.com/rss",
    "https://blockworks.co/feed",

    # Europe / Spain
    "https://sifted.eu/feed",
    "https://www.eu-startups.com/feed/",
    "https://cincodias.elpais.com/seccion/rss/tecnologia/",
    "https://www.expansion.com/rss/mercados/fondos-de-inversion.xml",

    # LatAm
    "https://contxto.com/en/feed/",
    "https://startupeable.com/feed/",
    "https://www.latamlist.com/feed/",

    # Fintech specific
    "https://www.fintechfutures.com/feed/",
    "https://www.finextra.com/rss/headlines.aspx",
]

# Keywords that indicate a deal announcement
DEAL_KEYWORDS = {
    "fund",
    "raise",
    "raised",
    "million",
    "billion",
    "series",
    "seed",
    "acquisition",
    "acquire",
    "acquired",
    "ipo",
    "round",
    "invest",
    "investment",
    "capital",
    "deal",
    "funding",
}

# Maximum age of an entry relative to target_date (days)
MAX_AGE_DAYS = 7


def _entry_date(entry: feedparser.util.FeedParserDict) -> Optional[date]:
    """Extract a date from an entry's published_parsed field. Returns None if unavailable."""
    parsed: Optional[struct_time] = getattr(entry, "published_parsed", None)
    if parsed is None:
        return None
    try:
        return date(parsed.tm_year, parsed.tm_mon, parsed.tm_mday)
    except (ValueError, AttributeError):
        return None


def _is_within_window(entry_date: Optional[date], target_date: date) -> bool:
    """Return True if entry_date is within MAX_AGE_DAYS of target_date."""
    if entry_date is None:
        return False
    delta = abs((target_date - entry_date).days)
    return delta <= MAX_AGE_DAYS


def _has_deal_keyword(text: str) -> bool:
    """Return True if any deal keyword appears in the lowercased text."""
    lowered = text.lower()
    return any(kw in lowered for kw in DEAL_KEYWORDS)


def _parse_feed(feed_url: str) -> feedparser.util.FeedParserDict:
    """Synchronous feedparser call, intended to be run in an executor."""
    return feedparser.parse(feed_url)


def _extract_raw_deals_from_feed(
    parsed: feedparser.util.FeedParserDict,
    feed_url: str,
    target_date: date,
) -> list[RawDeal]:
    """
    Walk a parsed feed's entries and return RawDeal objects that:
    - were published within MAX_AGE_DAYS of target_date
    - contain at least one deal keyword in the title or summary
    """
    deals: list[RawDeal] = []

    for entry in parsed.get("entries", []):
        entry_dt = _entry_date(entry)
        if not _is_within_window(entry_dt, target_date):
            continue

        title: str = entry.get("title", "") or ""
        summary: str = entry.get("summary", "") or entry.get("description", "") or ""
        combined_text = f"{title} {summary}"

        if not _has_deal_keyword(combined_text):
            continue

        link: str = entry.get("link", feed_url)
        date_raw: str = entry.get("published", str(entry_dt) if entry_dt else "")

        deals.append(
            RawDeal(
                source="rss",
                company_name="",  # AI extraction will populate this from raw_text
                amount_raw=None,  # AI extraction will parse from raw_text
                date_raw=date_raw,
                url=link,
                raw_text=combined_text.strip(),
                title=title or None,
            )
        )

    return deals


class RSSFetcher(BaseFetcher):
    """Fetches deal announcements from a set of RSS feeds concurrently."""

    @property
    def source_name(self) -> str:
        return "rss"

    async def fetch(self, target_date: date) -> list[RawDeal]:
        """
        Parse all configured RSS feeds concurrently and return RawDeal objects
        for entries matching the target_date window and containing deal keywords.
        One feed failing does not prevent others from being processed.
        """
        loop = asyncio.get_event_loop()

        async def fetch_one(feed_url: str) -> list[RawDeal]:
            try:
                parsed = await loop.run_in_executor(None, _parse_feed, feed_url)
                deals = _extract_raw_deals_from_feed(parsed, feed_url, target_date)
                logger.info(
                    "RSS feed %s: %d matching entries found", feed_url, len(deals)
                )
                return deals
            except Exception as exc:
                logger.warning(
                    "RSS feed %s failed to parse: %s", feed_url, exc, exc_info=True
                )
                return []

        results = await asyncio.gather(*[fetch_one(url) for url in RSS_FEEDS])

        all_deals: list[RawDeal] = []
        for batch in results:
            all_deals.extend(batch)

        logger.info("RSSFetcher total: %d raw deals collected", len(all_deals))
        return all_deals
