"""
ATS job posting scraper for Tech Bet Intelligence Engine.

Detects which ATS a company uses from crawled page text, then calls
that ATS's free public API to fetch tech-relevant job descriptions.

Supported ATSes (all free, no auth):
  - Greenhouse: boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true
  - Lever:      api.lever.co/v0/postings/{slug}?mode=json
  - Ashby:      api.ashbyhq.com/posting-api/job-board/{slug}
"""
import re
import logging
from dataclasses import dataclass

import httpx

logger = logging.getLogger(__name__)

_TECH_TITLE_KEYWORDS = [
    "engineer", "developer", "data", "ml", "machine learning",
    "platform", "infra", "infrastructure", "security", "architect",
    "devops", "sre", "backend", "frontend", "fullstack", "full-stack",
]

_ATS_PATTERNS = [
    ("greenhouse", r"boards\.greenhouse\.io/([^/\s\"'>]+)"),
    ("lever",      r"jobs\.lever\.co/([^/\s\"'>]+)"),
    ("ashby",      r"jobs\.ashbyhq\.com/([^/\s\"'>]+)"),
]

_MAX_JOBS_PER_COMPANY = 20
_MIN_DESCRIPTION_LEN = 100


@dataclass
class JobPosting:
    url: str
    title: str
    description: str
    source_type: str = "job_posting"


class JobScraper:
    """Detects ATS from crawled sources and fetches tech-relevant job descriptions."""

    def _detect_ats_slug(self, sources: list) -> tuple[str, str] | None:
        """
        Scan crawled source texts for ATS job board links.
        Returns (ats_name, slug) or None if no ATS detected.
        """
        for source in sources:
            text = (getattr(source, "clean_text", "") or "") + " " + (getattr(source, "url", "") or "")
            for ats_name, pattern in _ATS_PATTERNS:
                match = re.search(pattern, text, re.IGNORECASE)
                if match:
                    slug = match.group(1).strip("/")
                    logger.info("[JobScraper] Detected %s ATS, slug=%s", ats_name, slug)
                    return (ats_name, slug)
        return None

    def _is_tech_relevant(self, title: str) -> bool:
        """Return True if the job title is likely engineering/technical."""
        title_lower = title.lower()
        return any(kw in title_lower for kw in _TECH_TITLE_KEYWORDS)

    async def detect_and_scrape(self, sources: list) -> list[JobPosting]:
        """
        Main entry point. Detect ATS from crawled sources and fetch job descriptions.
        Never raises — returns [] on any failure.
        """
        slug_info = self._detect_ats_slug(sources)
        if not slug_info:
            return []

        ats_name, slug = slug_info
        try:
            if ats_name == "greenhouse":
                return await self._fetch_greenhouse(slug)
            elif ats_name == "lever":
                return await self._fetch_lever(slug)
            elif ats_name == "ashby":
                return await self._fetch_ashby(slug)
        except Exception as exc:
            logger.warning("[JobScraper] Fetch failed for %s/%s: %s", ats_name, slug, exc)
        return []

    async def _fetch_greenhouse(self, slug: str) -> list[JobPosting]:
        url = f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true"
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.get(url)
                r.raise_for_status()
                data = r.json()
        except Exception as exc:
            logger.warning("[JobScraper] Greenhouse failed for %s: %s", slug, exc)
            return []

        postings = []
        for job in data.get("jobs", []):
            title = job.get("title", "")
            if not self._is_tech_relevant(title):
                continue
            desc = (job.get("content") or "").strip()
            if len(desc) < _MIN_DESCRIPTION_LEN:
                continue
            postings.append(JobPosting(
                url=job.get("absolute_url", url),
                title=title,
                description=desc[:3000],
            ))
            if len(postings) >= _MAX_JOBS_PER_COMPANY:
                break

        logger.info("[JobScraper] Greenhouse: %d tech jobs for slug=%s", len(postings), slug)
        return postings

    async def _fetch_lever(self, slug: str) -> list[JobPosting]:
        url = f"https://api.lever.co/v0/postings/{slug}?mode=json"
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.get(url)
                r.raise_for_status()
                jobs = r.json()
        except Exception as exc:
            logger.warning("[JobScraper] Lever failed for %s: %s", slug, exc)
            return []

        postings = []
        for job in jobs:
            title = job.get("text", "")
            if not self._is_tech_relevant(title):
                continue
            desc = (job.get("descriptionPlain") or job.get("description") or "").strip()
            if len(desc) < _MIN_DESCRIPTION_LEN:
                continue
            postings.append(JobPosting(
                url=job.get("hostedUrl", url),
                title=title,
                description=desc[:3000],
            ))
            if len(postings) >= _MAX_JOBS_PER_COMPANY:
                break

        logger.info("[JobScraper] Lever: %d tech jobs for slug=%s", len(postings), slug)
        return postings

    async def _fetch_ashby(self, slug: str) -> list[JobPosting]:
        url = f"https://api.ashbyhq.com/posting-api/job-board/{slug}"
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.get(url)
                r.raise_for_status()
                data = r.json()
        except Exception as exc:
            logger.warning("[JobScraper] Ashby failed for %s: %s", slug, exc)
            return []

        postings = []
        for job in data.get("jobPostings", []):
            title = job.get("title", "")
            if not self._is_tech_relevant(title):
                continue
            desc = (job.get("descriptionPlain") or job.get("descriptionHtml") or "").strip()
            if len(desc) < _MIN_DESCRIPTION_LEN:
                continue
            postings.append(JobPosting(
                url=job.get("jobUrl", url),
                title=title,
                description=desc[:3000],
            ))
            if len(postings) >= _MAX_JOBS_PER_COMPANY:
                break

        logger.info("[JobScraper] Ashby: %d tech jobs for slug=%s", len(postings), slug)
        return postings
