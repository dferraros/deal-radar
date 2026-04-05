"""
Apify-based web crawler for Tech Bet Intelligence Engine.

Crawls company websites using the apify/website-content-crawler actor.
Returns cleaned text per page, classified by source type.
"""
import asyncio
import hashlib
import logging
import os
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

_SOURCE_TYPE_PATTERNS = {
    "github": ["github.com"],
    "trust_center": ["/security", "/trust", "/trust-center"],
    "status_page": ["://status."],
    "docs": ["/docs", "/documentation", "/api-reference", "/developers", "/technology"],
    "blog": ["/blog", "/news", "/insights", "/articles", "/press"],
    "careers": ["/careers", "/jobs", "/hiring", "/join-us", "/team"],
    "product": ["/product", "/solutions", "/platform", "/features", "/how-it-works"],
}


@dataclass
class CrawlResult:
    url: str
    source_type: str
    clean_text: str
    http_status: int = 200
    content_hash: str = ""

    def __post_init__(self):
        if not self.content_hash and self.clean_text:
            self.content_hash = hashlib.md5(self.clean_text.encode()).hexdigest()


class ApifyCrawler:
    """Crawls a company website using Apify's website-content-crawler."""

    _ACTOR_ID = "apify/website-content-crawler"
    _MAX_PAGES = 15
    _TIMEOUT_SECS = 120

    def __init__(self, api_token: str | None = None):
        self._token = api_token or os.environ.get("APIFY_API_TOKEN", "")

    def _classify_url(self, url: str) -> str:
        url_lower = url.lower()
        for source_type, patterns in _SOURCE_TYPE_PATTERNS.items():
            if any(p in url_lower for p in patterns):
                return source_type
        return "homepage"

    async def _run_actor(self, start_urls: list[str]) -> list[dict]:
        """Run the Apify actor and return raw items. Runs in thread pool to avoid blocking."""
        from apify_client import ApifyClient

        def _sync_run():
            client = ApifyClient(self._token)
            run = client.actor(self._ACTOR_ID).call(
                run_input={
                    "startUrls": [{"url": u} for u in start_urls],
                    "maxCrawlPages": self._MAX_PAGES,
                    "crawlerType": "playwright:adaptive",
                    "readableTextCharThreshold": 100,
                    "removeCookieWarnings": True,
                    "htmlTransformer": "readableText",
                },
                timeout_secs=self._TIMEOUT_SECS,
            )
            dataset_id = run.get("defaultDatasetId")
            if not dataset_id:
                return []
            items = list(client.dataset(dataset_id).iterate_items())
            return items

        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, _sync_run)

    async def crawl(self, website: str) -> list[CrawlResult]:
        """
        Crawl a company website. Returns up to MAX_PAGES CrawlResults.
        Never raises — returns [] on any error.
        """
        from urllib.parse import urlparse

        if not website.startswith(("http://", "https://")):
            website = f"https://{website}"

        if not self._token:
            logger.warning("[Crawler] APIFY_API_TOKEN not set — skipping crawl for %s", website)
            return []

        # Derive high-signal additional start URLs from the base domain
        parsed = urlparse(website)
        base = f"{parsed.scheme}://{parsed.netloc}"
        hostname = parsed.hostname  # host only, no port, always lowercase
        extra_urls = [
            f"{base}/security",
            f"{base}/trust",
            f"{base}/trust-center",
            f"https://status.{hostname}",
            f"{base}/.well-known/security.txt",
        ]
        start_urls = [website] + extra_urls

        try:
            items = await self._run_actor(start_urls)
        except Exception as exc:
            logger.error("[Crawler] Apify actor failed for %s: %s", website, exc)
            return []

        results = []
        for item in items:
            url = item.get("url", "")
            text = item.get("text") or item.get("markdown") or ""
            if not text or len(text.strip()) < 100:
                continue
            results.append(CrawlResult(
                url=url,
                source_type=self._classify_url(url),
                clean_text=text.strip(),
                http_status=item.get("statusCode", 200),
            ))

        logger.info("[Crawler] Crawled %d pages for %s", len(results), website)
        return results
