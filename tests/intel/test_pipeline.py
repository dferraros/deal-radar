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
