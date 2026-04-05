# tests/intel/test_crawler.py
import pytest
from unittest.mock import patch
from backend.intel.crawler import ApifyCrawler, CrawlResult


def test_crawl_result_dataclass():
    r = CrawlResult(url="https://example.com", source_type="homepage", clean_text="hello world this is content", http_status=200)
    assert r.url == "https://example.com"
    assert r.source_type == "homepage"
    assert r.content_hash != ""  # auto-computed in __post_init__


def test_classify_url():
    crawler = ApifyCrawler(api_token="fake")
    assert crawler._classify_url("https://example.com") == "homepage"
    assert crawler._classify_url("https://example.com/") == "homepage"
    assert crawler._classify_url("https://example.com/blog/post") == "blog"
    assert crawler._classify_url("https://example.com/careers") == "careers"
    assert crawler._classify_url("https://example.com/docs/api") == "docs"
    assert crawler._classify_url("https://github.com/company/repo") == "github"
    assert crawler._classify_url("https://example.com/product/features") == "product"


@pytest.mark.asyncio
async def test_crawl_returns_empty_on_error():
    crawler = ApifyCrawler(api_token="fake")
    with patch.object(crawler, '_run_actor', side_effect=Exception("API error")):
        results = await crawler.crawl("https://example.com")
    assert results == []


@pytest.mark.asyncio
async def test_crawl_returns_empty_when_no_token():
    crawler = ApifyCrawler(api_token="")
    results = await crawler.crawl("https://example.com")
    assert results == []


@pytest.mark.asyncio
async def test_crawl_filters_short_text():
    crawler = ApifyCrawler(api_token="fake")
    fake_items = [
        {"url": "https://example.com", "text": "short"},  # too short, < 100 chars
        {"url": "https://example.com/product", "text": "x" * 200},  # long enough
    ]
    with patch.object(crawler, '_run_actor', return_value=fake_items):
        results = await crawler.crawl("https://example.com")
    assert len(results) == 1
    assert results[0].source_type == "product"
