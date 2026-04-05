# tests/intel/test_pipeline.py
import pytest
import uuid
from unittest.mock import AsyncMock, MagicMock, patch


def test_pipeline_module_importable():
    from backend.intel.pipeline import run_intel_pipeline
    assert callable(run_intel_pipeline)


@pytest.mark.asyncio
async def test_pipeline_sets_failed_status_on_crawl_error():
    """If crawl returns empty, queue status becomes 'failed'."""
    from backend.intel.pipeline import run_intel_pipeline

    mock_db = AsyncMock()
    mock_queue = MagicMock()
    mock_queue.id = uuid.uuid4()
    mock_queue.website = "https://example.com"
    mock_queue.status = "queued"

    mock_result = MagicMock()
    mock_result.scalars.return_value.first.return_value = mock_queue
    mock_db.execute = AsyncMock(return_value=mock_result)
    mock_db.commit = AsyncMock()
    mock_db.flush = AsyncMock()

    with patch("backend.intel.pipeline.ApifyCrawler") as MockCrawler:
        MockCrawler.return_value.crawl = AsyncMock(return_value=[])
        await run_intel_pipeline(mock_queue.id, mock_db)

    assert mock_queue.status == "failed"


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
