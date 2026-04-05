# Intel Signal Expansion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add three new signal sources to the Intel pipeline — trust/status crawl pages (Phase C), ATS job posting APIs (Phase A), and GitHub org + SBOM analysis (Phase B) — all converted to CrawlResult objects so no downstream code changes.

**Architecture:** Each new source produces `CrawlResult(url, source_type, clean_text)` objects. These are merged with the existing crawl results before Stage 2 (store sources + chunks). The existing LLM extractor, normalizer, and DB writer all receive richer context with zero changes. All three phases are additive and non-blocking — failure in any one continues the pipeline.

**Tech Stack:** Python asyncio, httpx (already in requirements), `_SOURCE_TYPE_PATTERNS` dict in crawler.py, `_PRIORITY_SOURCE_TYPES` list in pipeline.py, GitHub REST API v3, Greenhouse/Lever/Ashby public job APIs (no auth), GITHUB_TOKEN env var.

---

## Task 1: Phase C — Extend Apify crawler with trust/status targets

**Files:**
- Modify: `backend/intel/crawler.py`
- Test: `tests/intel/test_crawler.py`

### Step 1: Write failing tests for new URL classification

Add these tests to `tests/intel/test_crawler.py`:

```python
def test_classify_trust_center_urls():
    crawler = ApifyCrawler(api_token="fake")
    assert crawler._classify_url("https://example.com/security") == "trust_center"
    assert crawler._classify_url("https://example.com/trust") == "trust_center"
    assert crawler._classify_url("https://example.com/trust-center") == "trust_center"

def test_classify_status_page_urls():
    crawler = ApifyCrawler(api_token="fake")
    assert crawler._classify_url("https://status.example.com") == "status_page"
    assert crawler._classify_url("https://status.mistral.ai/incidents") == "status_page"

@pytest.mark.asyncio
async def test_crawl_includes_extra_start_urls():
    """Verify trust/status URLs are included in the Apify call."""
    crawler = ApifyCrawler(api_token="fake")
    captured = {}

    async def fake_run_actor(start_urls):
        captured["urls"] = start_urls
        return []

    with patch.object(crawler, '_run_actor', side_effect=fake_run_actor):
        await crawler.crawl("https://example.com")

    urls = captured["urls"]
    assert "https://example.com" in urls
    assert "https://example.com/security" in urls
    assert "https://example.com/trust" in urls
    assert "https://status.example.com" in urls
```

### Step 2: Run tests to verify they fail

```bash
cd C:/Users/ferra/OneDrive/Desktop/Projects/deal-radar
python -m pytest tests/intel/test_crawler.py::test_classify_trust_center_urls tests/intel/test_crawler.py::test_classify_status_page_urls tests/intel/test_crawler.py::test_crawl_includes_extra_start_urls -v
```

Expected: FAIL (missing patterns and wrong _run_actor signature)

### Step 3: Implement changes in crawler.py

Replace the `_SOURCE_TYPE_PATTERNS` dict (lines 15–21) with:

```python
_SOURCE_TYPE_PATTERNS = {
    "github": ["github.com"],
    "trust_center": ["/security", "/trust", "/trust-center"],
    "status_page": ["status."],
    "docs": ["/docs", "/documentation", "/api-reference", "/developers", "/technology"],
    "blog": ["/blog", "/news", "/insights", "/articles", "/press"],
    "careers": ["/careers", "/jobs", "/hiring", "/join-us", "/team"],
    "product": ["/product", "/solutions", "/platform", "/features", "/how-it-works"],
}
```

Change `_run_actor` signature from `start_url: str` to `start_urls: list[str]`:

```python
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
```

Update `crawl()` to derive extra start URLs and pass the list. Replace everything after the `if not self._token:` guard and before the `try: items = await self._run_actor(...)` block:

```python
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
    domain = parsed.netloc  # e.g. "mistral.ai"
    base = f"{parsed.scheme}://{domain}"
    extra_urls = [
        f"{base}/security",
        f"{base}/trust",
        f"{base}/trust-center",
        f"https://status.{domain}",
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
```

### Step 4: Run tests to verify they pass

```bash
python -m pytest tests/intel/test_crawler.py -v
```

Expected: All tests PASS (including the 3 new ones and all existing ones)

### Step 5: Commit

```bash
git add backend/intel/crawler.py tests/intel/test_crawler.py
git commit -m "feat(phase-c): extend Apify crawler with trust/status/security start URLs"
```

---

## Task 2: Phase A — JobScraper (ATS detection + free public APIs)

**Files:**
- Create: `backend/intel/job_scraper.py`
- Create: `tests/intel/test_job_scraper.py`

### Step 1: Write failing tests

Create `tests/intel/test_job_scraper.py`:

```python
# tests/intel/test_job_scraper.py
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from backend.intel.job_scraper import JobScraper, JobPosting
from backend.intel.crawler import CrawlResult


def make_source(text: str, url: str = "https://example.com") -> CrawlResult:
    return CrawlResult(url=url, source_type="homepage", clean_text=text)


def test_detect_greenhouse_slug():
    scraper = JobScraper()
    sources = [make_source("Apply at boards.greenhouse.io/mistralai for jobs")]
    result = scraper._detect_ats_slug(sources)
    assert result == ("greenhouse", "mistralai")


def test_detect_lever_slug():
    scraper = JobScraper()
    sources = [make_source("See jobs at jobs.lever.co/cohere")]
    result = scraper._detect_ats_slug(sources)
    assert result == ("lever", "cohere")


def test_detect_ashby_slug():
    scraper = JobScraper()
    sources = [make_source("Careers: jobs.ashbyhq.com/scaleai")]
    result = scraper._detect_ats_slug(sources)
    assert result == ("ashby", "scaleai")


def test_detect_no_ats_returns_none():
    scraper = JobScraper()
    sources = [make_source("We are hiring! Send a resume to jobs@company.com")]
    result = scraper._detect_ats_slug(sources)
    assert result is None


def test_is_tech_relevant():
    scraper = JobScraper()
    assert scraper._is_tech_relevant("Senior Software Engineer") is True
    assert scraper._is_tech_relevant("ML Platform Lead") is True
    assert scraper._is_tech_relevant("Head of Marketing") is False
    assert scraper._is_tech_relevant("Data Scientist") is True


@pytest.mark.asyncio
async def test_detect_and_scrape_no_ats_returns_empty():
    scraper = JobScraper()
    sources = [make_source("No job board links here")]
    result = await scraper.detect_and_scrape(sources)
    assert result == []


@pytest.mark.asyncio
async def test_greenhouse_fetch_filters_non_tech():
    scraper = JobScraper()
    fake_response = {
        "jobs": [
            {"title": "Senior Engineer", "content": "x" * 200, "absolute_url": "https://boards.greenhouse.io/co/jobs/1"},
            {"title": "Head of Finance", "content": "y" * 200, "absolute_url": "https://boards.greenhouse.io/co/jobs/2"},
        ]
    }
    mock_resp = MagicMock()
    mock_resp.json.return_value = fake_response
    mock_resp.raise_for_status = MagicMock()

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client_cls.return_value = mock_client

        result = await scraper._fetch_greenhouse("mycompany")

    assert len(result) == 1
    assert result[0].title == "Senior Engineer"
    assert result[0].source_type == "job_posting"
```

### Step 2: Run tests to verify they fail

```bash
python -m pytest tests/intel/test_job_scraper.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'backend.intel.job_scraper'`

### Step 3: Create backend/intel/job_scraper.py

```python
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
```

### Step 4: Run tests to verify they pass

```bash
python -m pytest tests/intel/test_job_scraper.py -v
```

Expected: All 8 tests PASS

### Step 5: Commit

```bash
git add backend/intel/job_scraper.py tests/intel/test_job_scraper.py
git commit -m "feat(phase-a): add JobScraper with Greenhouse/Lever/Ashby ATS detection"
```

---

## Task 3: Phase B — GitHubAnalyzer (org search + SBOM)

**Files:**
- Create: `backend/intel/github_analyzer.py`
- Create: `tests/intel/test_github_analyzer.py`

### Step 1: Write failing tests

Create `tests/intel/test_github_analyzer.py`:

```python
# tests/intel/test_github_analyzer.py
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from backend.intel.github_analyzer import GitHubAnalyzer, GitHubResult


def make_mock_response(data: dict, status: int = 200):
    mock = MagicMock()
    mock.json.return_value = data
    mock.status_code = status
    mock.raise_for_status = MagicMock()
    if status == 404:
        from httpx import HTTPStatusError, Request, Response
        mock.raise_for_status.side_effect = HTTPStatusError(
            "404", request=MagicMock(), response=MagicMock()
        )
    return mock


def make_async_client(responses: list):
    """Returns a context manager mock that yields a client returning responses in order."""
    client = AsyncMock()
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=False)
    client.get = AsyncMock(side_effect=responses)
    return client


@pytest.mark.asyncio
async def test_analyze_returns_empty_when_org_not_found():
    analyzer = GitHubAnalyzer(token="fake")
    empty_search = make_mock_response({"items": []})
    with patch("httpx.AsyncClient", return_value=make_async_client([empty_search])):
        result = await analyzer.analyze("https://unknownco.io")
    assert result == []


@pytest.mark.asyncio
async def test_analyze_returns_github_results():
    analyzer = GitHubAnalyzer(token="fake")

    search_resp = make_mock_response({"items": [{"login": "mistralai"}]})
    repos_resp = make_mock_response([
        {"name": "mistral-src", "language": "Python", "html_url": "https://github.com/mistralai/mistral-src", "fork": False},
    ])
    sbom_resp = make_mock_response({"sbom": {"packages": [
        {"name": "torch", "versionInfo": "2.0.0"},
        {"name": "transformers", "versionInfo": "4.30.0"},
    ]}})

    client = AsyncMock()
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=False)
    client.get = AsyncMock(side_effect=[search_resp, repos_resp, sbom_resp])

    with patch("httpx.AsyncClient", return_value=client):
        results = await analyzer.analyze("https://mistral.ai")

    assert len(results) == 1
    assert results[0].org == "mistralai"
    assert results[0].repo == "mistral-src"
    assert results[0].language == "Python"
    assert "torch" in results[0].sbom_text
    assert results[0].source_type == "github"


@pytest.mark.asyncio
async def test_analyze_skips_forked_repos():
    analyzer = GitHubAnalyzer(token="fake")

    search_resp = make_mock_response({"items": [{"login": "myorg"}]})
    repos_resp = make_mock_response([
        {"name": "forked-lib", "language": "Go", "html_url": "https://github.com/myorg/forked-lib", "fork": True},
        {"name": "own-repo", "language": "Rust", "html_url": "https://github.com/myorg/own-repo", "fork": False},
    ])
    sbom_resp = make_mock_response({"sbom": {"packages": [{"name": "serde", "versionInfo": "1.0"}]}})

    client = AsyncMock()
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=False)
    client.get = AsyncMock(side_effect=[search_resp, repos_resp, sbom_resp])

    with patch("httpx.AsyncClient", return_value=client):
        results = await analyzer.analyze("https://myorg.dev")

    assert len(results) == 1
    assert results[0].repo == "own-repo"


@pytest.mark.asyncio
async def test_analyze_continues_on_sbom_404():
    """If SBOM endpoint returns 404, the repo is still included with empty sbom_text."""
    analyzer = GitHubAnalyzer(token="fake")

    search_resp = make_mock_response({"items": [{"login": "myorg"}]})
    repos_resp = make_mock_response([
        {"name": "private-repo", "language": "TypeScript", "html_url": "https://github.com/myorg/private-repo", "fork": False},
    ])
    sbom_404 = make_mock_response({}, status=404)

    client = AsyncMock()
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=False)
    client.get = AsyncMock(side_effect=[search_resp, repos_resp, sbom_404])

    with patch("httpx.AsyncClient", return_value=client):
        results = await analyzer.analyze("https://myorg.dev")

    assert len(results) == 1
    assert results[0].language == "TypeScript"
    assert results[0].sbom_text == ""
```

### Step 2: Run tests to verify they fail

```bash
python -m pytest tests/intel/test_github_analyzer.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'backend.intel.github_analyzer'`

### Step 3: Create backend/intel/github_analyzer.py

```python
"""
GitHub org analyzer for Tech Bet Intelligence Engine.

Given a company domain, finds the GitHub org, fetches top repos by stars,
and retrieves SPDX SBOM dependency lists as explicit tech stack evidence.

Why this matters: package.json / requirements.txt / go.mod are ground truth
stack signals. They produce explicit, high-confidence observations — no LLM
inference needed for the presence of the package.

Auth: set GITHUB_TOKEN env var (free personal access token, 5000 req/hr).
Without token: 60 req/hr — too low for production.
"""
import logging
import os
from dataclasses import dataclass, field

import httpx

logger = logging.getLogger(__name__)

_GITHUB_API = "https://api.github.com"
_MAX_REPOS = 10
_MAX_PACKAGES = 200


@dataclass
class GitHubResult:
    org: str
    repo: str
    language: str | None
    sbom_text: str
    url: str = ""
    source_type: str = "github"


class GitHubAnalyzer:
    """Finds a company's GitHub org from their domain and extracts dependency signals."""

    def __init__(self, token: str | None = None):
        self._token = token or os.environ.get("GITHUB_TOKEN", "")
        if not self._token:
            logger.warning("[GitHubAnalyzer] GITHUB_TOKEN not set — rate limited to 60 req/hr")

    def _headers(self) -> dict:
        h = {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        if self._token:
            h["Authorization"] = f"Bearer {self._token}"
        return h

    async def analyze(self, domain: str) -> list[GitHubResult]:
        """
        Full analysis: org discovery → repos → SBOM per repo.
        Never raises — returns [] on any failure.
        """
        # Strip protocol and TLD to get org name candidate
        # "https://mistral.ai" → "mistral"
        clean = domain.replace("https://", "").replace("http://", "").rstrip("/")
        org_candidate = clean.split(".")[0]

        try:
            org = await self._find_org(org_candidate)
        except Exception as exc:
            logger.warning("[GitHubAnalyzer] Org lookup failed for %s: %s", domain, exc)
            return []

        if not org:
            logger.info("[GitHubAnalyzer] No GitHub org found for domain=%s", domain)
            return []

        try:
            repos = await self._get_top_repos(org)
        except Exception as exc:
            logger.warning("[GitHubAnalyzer] Repo fetch failed for org=%s: %s", org, exc)
            return []

        results = []
        for repo_name, language, repo_url in repos:
            try:
                sbom_text = await self._get_sbom(org, repo_name)
            except Exception as exc:
                logger.debug("[GitHubAnalyzer] SBOM failed for %s/%s: %s", org, repo_name, exc)
                sbom_text = ""

            if language or sbom_text:
                results.append(GitHubResult(
                    org=org,
                    repo=repo_name,
                    language=language,
                    sbom_text=sbom_text,
                    url=repo_url,
                ))

        logger.info("[GitHubAnalyzer] Found %d repos for org=%s", len(results), org)
        return results

    async def _find_org(self, name: str) -> str | None:
        """Search GitHub for an org matching the name. Returns login or None."""
        url = f"{_GITHUB_API}/search/users?q={name}+type:org"
        async with httpx.AsyncClient(headers=self._headers(), timeout=10) as client:
            r = await client.get(url)
            r.raise_for_status()
            data = r.json()
        items = data.get("items", [])
        return items[0]["login"] if items else None

    async def _get_top_repos(self, org: str) -> list[tuple[str, str | None, str]]:
        """Fetch top repos by stars, excluding forks."""
        url = f"{_GITHUB_API}/orgs/{org}/repos?sort=stars&per_page={_MAX_REPOS}"
        async with httpx.AsyncClient(headers=self._headers(), timeout=10) as client:
            r = await client.get(url)
            r.raise_for_status()
            repos = r.json()
        return [
            (r["name"], r.get("language"), r.get("html_url", ""))
            for r in repos
            if not r.get("fork", False)
        ]

    async def _get_sbom(self, org: str, repo: str) -> str:
        """
        Fetch SPDX SBOM for a repo. Returns package list as plain text.
        Returns "" if SBOM not available (404) or empty.
        """
        url = f"{_GITHUB_API}/repos/{org}/{repo}/dependency-graph/sbom"
        async with httpx.AsyncClient(headers=self._headers(), timeout=15) as client:
            r = await client.get(url)
            if r.status_code == 404:
                return ""
            r.raise_for_status()
            data = r.json()

        packages = data.get("sbom", {}).get("packages", [])
        if not packages:
            return ""

        lines = []
        for p in packages[:_MAX_PACKAGES]:
            name = p.get("name", "")
            version = p.get("versionInfo", "")
            if name:
                lines.append(f"{name} {version}".strip())

        return "\n".join(lines)
```

### Step 4: Run tests to verify they pass

```bash
python -m pytest tests/intel/test_github_analyzer.py -v
```

Expected: All 4 tests PASS

### Step 5: Commit

```bash
git add backend/intel/github_analyzer.py tests/intel/test_github_analyzer.py
git commit -m "feat(phase-b): add GitHubAnalyzer with org search and SBOM extraction"
```

---

## Task 4: Pipeline integration

**Files:**
- Modify: `backend/intel/pipeline.py`
- Test: `tests/intel/test_pipeline.py` (add new tests)

### Step 1: Write failing tests

Add these tests to `tests/intel/test_pipeline.py`. First read the existing file to find where to append:

```python
# Add to tests/intel/test_pipeline.py

def test_priority_source_types_includes_new_types():
    """All new source_types must be in priority list so assembler doesn't sort them last."""
    from backend.intel.pipeline import _PRIORITY_SOURCE_TYPES
    assert "trust_center" in _PRIORITY_SOURCE_TYPES
    assert "status_page" in _PRIORITY_SOURCE_TYPES
    assert "job_posting" in _PRIORITY_SOURCE_TYPES
    assert "github" in _PRIORITY_SOURCE_TYPES


def test_job_posting_to_crawl_result():
    """JobPosting objects must be convertible to CrawlResult via the pipeline helper."""
    from backend.intel.pipeline import _job_posting_to_crawl_result
    from backend.intel.job_scraper import JobPosting

    jp = JobPosting(url="https://jobs.lever.co/co/123", title="Senior Engineer", description="We use Rust and gRPC")
    cr = _job_posting_to_crawl_result(jp)

    assert cr.source_type == "job_posting"
    assert "Senior Engineer" in cr.clean_text
    assert "Rust" in cr.clean_text
    assert cr.url == "https://jobs.lever.co/co/123"


def test_github_result_to_crawl_result():
    """GitHubResult objects must be convertible to CrawlResult via the pipeline helper."""
    from backend.intel.pipeline import _github_result_to_crawl_result
    from backend.intel.github_analyzer import GitHubResult

    gr = GitHubResult(
        org="myorg", repo="myrepo", language="Python",
        sbom_text="torch 2.0\ntransformers 4.30",
        url="https://github.com/myorg/myrepo",
    )
    cr = _github_result_to_crawl_result(gr)

    assert cr.source_type == "github"
    assert "Python" in cr.clean_text
    assert "torch" in cr.clean_text
    assert cr.url == "https://github.com/myorg/myrepo"
```

### Step 2: Run tests to verify they fail

```bash
python -m pytest tests/intel/test_pipeline.py::test_priority_source_types_includes_new_types tests/intel/test_pipeline.py::test_job_posting_to_crawl_result tests/intel/test_pipeline.py::test_github_result_to_crawl_result -v
```

Expected: FAIL (missing helper functions and missing source types in priority list)

### Step 3: Update pipeline.py

**3a. Add new imports** at the top of `backend/intel/pipeline.py`, after the existing imports:

```python
from backend.intel.job_scraper import JobScraper, JobPosting
from backend.intel.github_analyzer import GitHubAnalyzer, GitHubResult
from backend.intel.crawler import CrawlResult
```

**3b. Update `_PRIORITY_SOURCE_TYPES`** (line 35) to include new source types. Replace:

```python
_PRIORITY_SOURCE_TYPES = ["product", "docs", "homepage", "blog", "careers", "github", "other"]
```

With:

```python
_PRIORITY_SOURCE_TYPES = [
    "github",        # explicit dependency signals — highest confidence
    "trust_center",  # vendor/subprocessor lists — ground truth
    "job_posting",   # tech stack from JD requirements
    "product", "docs", "homepage", "blog", "careers", "status_page", "other",
]
```

**3c. Add conversion helper functions** after `_PRIORITY_SOURCE_TYPES` declaration and before `_chunk_text`:

```python
def _job_posting_to_crawl_result(jp: "JobPosting") -> "CrawlResult":
    """Convert a JobPosting to a CrawlResult for uniform pipeline processing."""
    return CrawlResult(
        url=jp.url,
        source_type="job_posting",
        clean_text=f"JOB POSTING: {jp.title}\n\n{jp.description}",
    )


def _github_result_to_crawl_result(gr: "GitHubResult") -> "CrawlResult":
    """Convert a GitHubResult to a CrawlResult for uniform pipeline processing."""
    parts = [f"GITHUB REPO: {gr.org}/{gr.repo}"]
    if gr.language:
        parts.append(f"Primary language: {gr.language}")
    if gr.sbom_text:
        parts.append(f"\nDependencies (SBOM):\n{gr.sbom_text}")
    return CrawlResult(
        url=gr.url or f"https://github.com/{gr.org}/{gr.repo}",
        source_type="github",
        clean_text="\n".join(parts),
    )
```

**3d. Wire Phase A and Phase B into `run_intel_pipeline()`.**

After Stage 1 (crawl), before Stage 2 (store sources + chunks), insert this block. Find the line `# ── Stage 2: Store sources + chunks` and insert BEFORE it:

```python
    # ── Stage 1b: Enrich with job postings (Phase A) ─────────────────────────
    try:
        job_scraper = JobScraper()
        job_postings = await job_scraper.detect_and_scrape(crawl_results)
        if job_postings:
            logger.info("[Intel] Found %d job postings for %s", len(job_postings), queue.website)
            crawl_results.extend(_job_posting_to_crawl_result(jp) for jp in job_postings)
    except Exception as exc:
        logger.warning("[Intel] JobScraper failed for %s: %s", queue.website, exc)

    # ── Stage 1c: Enrich with GitHub SBOM (Phase B) ──────────────────────────
    try:
        github_analyzer = GitHubAnalyzer()
        github_results = await github_analyzer.analyze(queue.website)
        if github_results:
            logger.info("[Intel] Found %d GitHub repos for %s", len(github_results), queue.website)
            crawl_results.extend(_github_result_to_crawl_result(gr) for gr in github_results)
    except Exception as exc:
        logger.warning("[Intel] GitHubAnalyzer failed for %s: %s", queue.website, exc)
```

### Step 4: Run tests to verify they pass

```bash
python -m pytest tests/intel/test_pipeline.py -v
```

Expected: All pipeline tests PASS

### Step 5: Run all intel tests to check for regressions

```bash
python -m pytest tests/intel/ -v
```

Expected: All tests PASS across all intel test files

### Step 6: Commit

```bash
git add backend/intel/pipeline.py tests/intel/test_pipeline.py
git commit -m "feat(pipeline): integrate JobScraper and GitHubAnalyzer into intel pipeline"
```

---

## Task 5: Deploy and verify

**Files:**
- No new files — just deployment and env var verification

### Step 1: Verify GITHUB_TOKEN is set in Railway

Run in terminal:

```bash
railway variables
```

Check output for `GITHUB_TOKEN`. If missing, add it:

```bash
railway variables set GITHUB_TOKEN=<your_personal_access_token>
```

Get a free GitHub personal access token at: `github.com/settings/tokens` — only needs `public_repo` read scope.

### Step 2: Push to Railway

```bash
git push origin master
```

Then watch deployment logs:

```bash
railway logs --tail
```

Expected: `Build successful`, `Server started on port 8080`

### Step 3: End-to-end smoke test

Add a company with a known Greenhouse ATS (e.g., Cohere uses `jobs.greenhouse.io/cohere`):

1. Open the deal-radar UI at the Railway URL
2. Go to `/intel` → click "Add Company" → enter: Name: `Cohere`, Website: `https://cohere.com`
3. Watch status cycle: `queued → crawling → extracting → normalizing → done`
4. Click `Cohere` in the queue table to open dossier
5. Verify: primitives include LLM-related items (transformers, CUDA, etc.) with higher confidence than before

### Step 4: Final push of plan file

```bash
git add docs/plans/2026-04-05-intel-signal-expansion-plan.md
git commit -m "docs: add intel signal expansion implementation plan"
git push origin master
```

---

## Summary

| Task | Phase | Files | Effort |
|---|---|---|---|
| 1 | C | `crawler.py` — trust/status start URLs | ~30 min |
| 2 | A | `job_scraper.py` — ATS detection + Greenhouse/Lever/Ashby | ~45 min |
| 3 | B | `github_analyzer.py` — org search + SBOM | ~45 min |
| 4 | Integration | `pipeline.py` — wire all three, helpers, priority list | ~20 min |
| 5 | Deploy | Railway env vars + smoke test | ~15 min |

**New env var required:** `GITHUB_TOKEN` (free personal access token from github.com/settings/tokens)

**New dependencies:** `httpx` (already in requirements.txt via existing ingestion pipeline)


---

## Task 6: Define Target Output — "Technical Bets" Analysis Layer

> This task defines WHAT the Intel engine should produce, not just what data it collects.
> The Scale AI analysis below is the canonical example of the target output quality.

### The Problem With Current Output

Right now the Intel engine produces:
- A list of primitives (e.g. "Python", "AWS", "Transformer")
- A confidence score per primitive
- A layer assignment (model / infra / interface / etc.)

That is **inputs to analysis**, not analysis itself.

### What We Actually Want

Given any company, the Intel engine should produce a **Technical Bets Dossier**:

```
Company: [Name]
Engineering Frame: [1-sentence description of what problem they're actually solving]

Technical Bets (ranked by confidence):
  Bet A: [Name] — [What the bet is] — [Why it's a bet, not obvious]
  Bet B: ...

Stack Clusters:
  Cluster A — [Layer Name]
    Core components: [list]
    Engineering implication: [why this cluster exists]
  ...

What They Are NOT Betting On: [important negatives]

Engineer's Summary: [3-level nested view — surface / real / deepest product]
```

### Scale AI as the Canonical Example

The following is the reference output for what a high-quality Technical Bets analysis looks like. The Intel engine's Claude extraction prompt should be calibrated to produce this quality of output.

---

**Company:** Scale AI (early-stage, 2016–2019)

**Engineering Frame:**
They were building a machine for converting raw, ambiguous sensor data into reliable supervised learning signal at industrial throughput. Not "AI data labeling" — a distributed systems + human computation + data-model interface problem.

---

**The 7 Core Technical Bets:**

**Bet 1 — Labeling is a formal task graph, not ad hoc labor**
Labeling should be represented as a precise computational object (task, project, schema, output spec) so it becomes programmable: automatable routing, validation, prelabels, multi-stage review, export consistency, agreement measurement.

**Bet 2 — The scarce resource is controllable human judgment, not raw labor**
If bottleneck = "get more people" → build a marketplace. If bottleneck = "reliable judgment under tight spec" → build tooling, instruction systems, QA layers, disagreement resolution, latency control, workforce segmentation. The second is far more defensible.

**Bet 3 — Data quality is fundamentally an ontology problem before it is a labor problem**
A bad ontology causes inconsistent labels, low inter-annotator agreement, bad training targets, spurious model error, non-comparable datasets. The platform is partly an ontology compiler for ML supervision.

**Bet 4 — Win the hardest data modality first, not the easiest**
AV wedge: extremely painful bottleneck, high WTP, complex geometry (3D cuboids, LiDAR, sensor fusion), multimodal stacks, expensive failure. This is a high-complexity annotation infrastructure wedge, not a generic outsourcing wedge.

**Bet 5 — "Ground truth" is manufactured, not observed**
There is no perfect truth in the data. There is only: noisy observation + task instructions + partial human judgment + agreement rules + validation loops. The real product is confidence-calibrated supervision.

**Bet 6 — The annotation system should learn from its own output (closed-loop data engine)**
raw data → human labels → model prelabels → human corrections → better prelabels → more throughput → lower marginal cost. This is the deepest bet: concentration of human effort on edge cases, model handles the bulk.

**Bet 7 — Annotation is part of the training pipeline, not a separate business process**
Scale sits between raw data storage and model training. Structured outputs plug directly into customer ML pipelines. That is the seed of infrastructure control.

---

**Stack Clusters:**

| Cluster | What it is | Engineering implication |
|---|---|---|
| A — Task abstraction | Task object, project, schema, input modalities, output spec | Makes labeling programmable |
| B — Human computation orchestration | Queues, assignment, review, escalation, throughput control | Controllable judgment at scale |
| C — Ontology / label semantics | Classes, attributes, geometry, annotation semantics, frame consistency | Quality is an ontology problem first |
| D — CV labeling infrastructure | 2D boxes, video tracking, cuboids, LiDAR, point cloud, sensor fusion | Hard modality wedge |
| E — QA and consensus | Consensus, audits, validation, disagreement handling, instruction refinement | Ground truth is manufactured |
| F — Model-assisted prelabeling | First-pass model + human correction closed loop | Self-improving throughput |
| G — Delivery layer | Export formats, stable IDs, schema consistency, integration APIs | Annotation = part of training pipeline |

---

**What They Were NOT Betting On (early):**
- Frontier foundation model research
- Proprietary base-model breakthroughs
- Generic BPO economics
- Pure crowd marketplace scale
- One-off consulting data projects

---

**Engineer's 3-Level Summary:**

- **Level 1 (surface):** "Get labels for my ML data."
- **Level 2 (real product):** "Convert raw multimodal sensor data into reliable supervised training signal."
- **Level 3 (deepest product):** "Build a software-controlled feedback loop where human judgment creates training data that gradually automates more of the same pipeline." — *Supervision itself can be industrialized, formalized, and partially automated like any other production system.*

---

### Implementation Plan for Task 6

**What needs to be built:**

The current `IntelExtractor.extract_profile()` produces: summary, target_user, workflow, inputs, outputs, claimed_differentiators, jtbd, confidence.

A new method `extract_technical_bets()` should produce the structured analysis above.

**Files to create/modify:**
- `backend/intel/extractors.py` — add `extract_technical_bets()` method
- `backend/models.py` — add `IntelTechnicalBets` model (or store as JSONB on existing profile)
- `backend/routers/intel.py` — expose bets in dossier endpoint
- `frontend/src/views/IntelDossier.tsx` — display bets section

**The prompt engineering:**

The extraction prompt should instruct Claude to:
1. First identify the engineering frame ("what problem are they actually solving at the infrastructure level")
2. Then identify 3–7 specific technical bets with: name, what it is, why it's a bet (not obvious/certain)
3. Cluster the stack into logical groups with an engineering implication per cluster
4. State explicitly what the company is NOT betting on
5. Produce a 3-level nested summary: surface product / real product / deepest product

**Key calibration:** The prompt should explicitly say "you are a senior engineer analyzing this company, not an investor or VC. Focus on technical architecture choices, what problems they're actually solving at the systems level, and what assumptions their stack commits them to."

**Confidence signal:** A good technical bets analysis requires enough signal. The engine should only attempt this if:
- At least 5 primitives extracted with confidence >= 0.6
- At least one of: GitHub SBOM data, job postings, docs/product pages

**Storage:** Store as JSONB in a new `intel_technical_bets` table or as a TEXT field on `intel_company_profiles`. JSONB preferred for structured access.
