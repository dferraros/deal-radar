# tests/intel/test_github_analyzer.py
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from backend.intel.github_analyzer import GitHubAnalyzer, GitHubResult


def make_mock_response(data: dict, status: int = 200):
    mock = MagicMock()
    mock.json.return_value = data
    mock.status_code = status
    mock.raise_for_status = MagicMock()
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
    """If SBOM endpoint returns 404, repo is still included with empty sbom_text."""
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
