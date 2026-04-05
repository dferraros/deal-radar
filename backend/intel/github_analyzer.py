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
