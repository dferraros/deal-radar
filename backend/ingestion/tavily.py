"""
TavilyFetcher — searches for deal announcements using the Tavily AI search API.

Runs 4 themed search queries concurrently for the target date and returns
RawDeal records ready for the AI extraction layer.
"""

import asyncio
import logging
import os
import re
from datetime import date
from typing import Optional

from backend.ingestion.base import BaseFetcher, RawDeal

logger = logging.getLogger(__name__)

# Patterns to extract monetary amounts from title or content
_AMOUNT_PATTERNS = [
    re.compile(r"\$\s*(\d+(?:\.\d+)?)\s*[Bb]illion", re.IGNORECASE),
    re.compile(r"\$\s*(\d+(?:\.\d+)?)\s*[Mm]illion", re.IGNORECASE),
    re.compile(r"\$\s*(\d+(?:\.\d+)?)\s*[Kk]", re.IGNORECASE),
    re.compile(r"(\d+(?:\.\d+)?)\s*billion(?:\s+dollars?)?", re.IGNORECASE),
    re.compile(r"(\d+(?:\.\d+)?)\s*million(?:\s+dollars?)?", re.IGNORECASE),
    re.compile(r"\$\s*(\d+(?:\.\d+)?)[MBK]", re.IGNORECASE),
    re.compile(r"(\d+(?:\.\d+)?)\s*[Mm]", re.IGNORECASE),
]

# Verbs that indicate a company name precedes the raise
_RAISE_VERBS = re.compile(
    r"\s+(?:raises?|raised|closes?|closed|secures?|secured|announces?|announced|"
    r"lands?|landed|gets?|got|receives?|received|nets?|netted|bags?|bagged|"
    r"completes?|completed|pulls?|pulled)\b",
    re.IGNORECASE,
)


def _extract_amount_raw(text: str) -> Optional[str]:
    """Return first monetary amount found in text, or None."""
    for pattern in _AMOUNT_PATTERNS:
        match = pattern.search(text)
        if match:
            return match.group(0).strip()
    return None


def _extract_company_name(title: Optional[str]) -> str:
    """
    Extract company name from article title.

    Strategy: take everything before the first raise-verb phrase.
    Fallback: first two words of the title.
    """
    if not title:
        return "Unknown"

    # Strip leading/trailing whitespace
    title = title.strip()

    match = _RAISE_VERBS.search(title)
    if match:
        candidate = title[: match.start()].strip()
        # Remove trailing punctuation and quotes
        candidate = re.sub(r"[\"',;:]+$", "", candidate).strip()
        if candidate:
            return candidate

    # Fallback: first two words
    words = title.split()
    return " ".join(words[:2]) if len(words) >= 2 else title


def _build_queries(target_date: date) -> list[str]:
    month_year = target_date.strftime("%B %Y")
    year = target_date.strftime("%Y")
    return [
        # Core deal discovery
        f"startup funding round raised {month_year} venture capital Series",
        f"startup raised million funding {month_year} seed round",
        f"venture capital investment deal announced {month_year}",

        # Crypto / Web3
        f"crypto web3 DeFi funding raise {month_year} million",
        f"blockchain protocol token raise {month_year}",
        f"Layer2 DeFi protocol funding {month_year}",

        # M&A / Acquisitions
        f"acquisition merger deal closed {month_year} fintech tech",
        f"acquired startup acquisition {month_year} million billion",

        # Geography — LatAm
        f"Latin America LatAm startup funding {month_year} million",
        f"Brazil Mexico Colombia fintech startup raise {month_year}",
        f"Argentina Chile Peru startup investment {month_year}",

        # Geography — Spain / Europe
        f"Spain startup funding round {month_year} million euros",
        f"Europe fintech startup raise {month_year} million Series",

        # Sector — Fintech / Embedded Finance
        f"fintech neobank embedded finance funding {month_year}",
        f"payments lending insurtech raise {month_year} million",

        # Sector — Healthtech / SaaS
        f"healthtech medtech digital health funding {month_year} million Series",
        f"SaaS enterprise software funding round {month_year}",

        # IPO
        f"IPO initial public offering {year} tech startup",
    ]


class TavilyFetcher(BaseFetcher):
    """
    Fetch deal announcements via the Tavily AI search API.

    Runs 4 themed queries concurrently. Tavily's Python client is synchronous,
    so each call is dispatched through run_in_executor to keep the pipeline async.
    """

    @property
    def source_name(self) -> str:
        return "tavily"

    async def fetch(self, target_date: date) -> list[RawDeal]:
        api_key = os.environ.get("TAVILY_API_KEY", "")
        if not api_key:
            logger.error("TAVILY_API_KEY is not set — skipping Tavily fetch")
            return []

        try:
            from tavily import TavilyClient  # type: ignore
        except ImportError:
            logger.error("tavily-python is not installed — skipping Tavily fetch")
            return []

        client = TavilyClient(api_key=api_key)
        queries = _build_queries(target_date)

        async def _search_one(query: str) -> list[RawDeal]:
            loop = asyncio.get_event_loop()
            for attempt in range(3):
                try:
                    response = await loop.run_in_executor(
                        None,
                        lambda: client.search(
                            query=query,
                            search_depth="advanced",
                            max_results=15,
                            include_raw_content=True,
                        ),
                    )
                    results = response.get("results", [])
                    deals: list[RawDeal] = []
                    for result in results:
                        title: Optional[str] = result.get("title")
                        content: str = result.get("content", "")
                        url: str = result.get("url", "")

                        if not url:
                            continue

                        raw_content = result.get("raw_content") or ""
                        full_text = raw_content if len(raw_content) > len(content) else content
                        combined = f"{title or ''}\n\n{full_text}"
                        amount_raw = _extract_amount_raw(combined)
                        company_name = _extract_company_name(title)

                        deals.append(
                            RawDeal(
                                source="tavily",
                                company_name=company_name,
                                amount_raw=amount_raw,
                                date_raw=target_date.isoformat(),
                                url=url,
                                raw_text=full_text,
                                title=title,
                            )
                        )
                    return deals
                except Exception as exc:
                    err_str = str(exc).lower()
                    if "429" in err_str or "rate limit" in err_str or "too many" in err_str:
                        wait = 2 ** attempt  # 1s, 2s, 4s
                        logger.warning(
                            "Tavily rate limit on query %r (attempt %d/3) — retrying in %ds",
                            query, attempt + 1, wait,
                        )
                        await asyncio.sleep(wait)
                    else:
                        logger.error("Tavily search failed for query %r: %s", query, exc)
                        return []
            logger.error("Tavily query %r failed after 3 retries (rate limit)", query)
            return []

        # Run all 4 queries concurrently
        results_per_query = await asyncio.gather(*[_search_one(q) for q in queries])

        # Flatten and deduplicate by URL
        seen_urls: set[str] = set()
        all_deals: list[RawDeal] = []
        for batch in results_per_query:
            for deal in batch:
                if deal.url not in seen_urls:
                    seen_urls.add(deal.url)
                    all_deals.append(deal)

        logger.info(
            "TavilyFetcher: %d unique deals from %d queries for %s",
            len(all_deals),
            len(queries),
            target_date,
        )
        return all_deals
