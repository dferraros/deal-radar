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
