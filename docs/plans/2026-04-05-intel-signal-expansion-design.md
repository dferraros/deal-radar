# Intel Signal Expansion — Design Doc

**Date:** 2026-04-05
**Author:** Daniel Ferraro
**Status:** Approved

---

## Goal

Increase the quality and confidence of technical primitive inference by adding three new signal sources to the Intel pipeline, in ascending order of engineering effort: additional high-signal crawl pages, job posting APIs, and GitHub org analysis.

---

## Context: Current pipeline

```
intel_queue
  → ApifyCrawler (homepage, product, docs, blog, careers — 15 pages)
  → intel_sources + intel_source_chunks
  → IntelExtractor (profile + primitives)
  → OntologyNormalizer
  → intel_observations + intel_observation_evidence
```

Current limitation: all signals come from marketing copy. Job postings, vendor trust lists, and actual dependency files are more explicit and higher confidence — none are currently used.

---

## Phase C — Additional crawl targets

**What:** Extend Apify start URLs with high-signal pages beyond the standard product/docs/blog set.

**Why:** Trust center and status pages are the most explicit vendor signal available publicly. They list every subprocessor, cloud provider, and monitoring tool a company actually pays for — no inference needed.

**New targets:**

| URL pattern | Source type | Signal |
|---|---|---|
| `https://{domain}/security` | `trust_center` | Cloud provider, compliance framework, vendors |
| `https://{domain}/trust` | `trust_center` | Subprocessor list, infra vendors |
| `https://{domain}/trust-center` | `trust_center` | Same |
| `https://status.{domain}` | `status_page` | Infrastructure components, monitoring tools, incident history |
| `https://{domain}/.well-known/security.txt` | `security` | Security vendor signals |

**Implementation:**

- In `ApifyCrawler._SOURCE_TYPE_PATTERNS`, add patterns for `trust_center` and `status_page`
- In `ApifyCrawler.crawl()`, extend `startUrls` to include the trust/status variants derived from the domain
- No schema changes — `source_type` is a free-text field already

**Effort:** ~1 hour. Zero new dependencies.

---

## Phase A — Job posting scraper

**What:** After crawling, detect the company's ATS from crawled page links, then hit the free public API for that ATS to pull all job descriptions as additional source material.

**Why:** Job descriptions are the most explicit proxy for actual engineering decisions. A company that lists "Rust, gRPC, Kafka, Kubernetes" in their ML engineer job spec is giving you their stack more reliably than any marketing page.

**ATS detection + API:**

| ATS | Detection signal | Public API endpoint | Auth |
|---|---|---|---|
| Greenhouse | link to `boards.greenhouse.io/{slug}` | `GET https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true` | None |
| Lever | link to `jobs.lever.co/{slug}` | `GET https://api.lever.co/v0/postings/{slug}?mode=json` | None |
| Ashby | link to `jobs.ashbyhq.com/{slug}` | `GET https://api.ashbyhq.com/posting-api/job-board/{slug}` | None |

**Workflow:**

```
crawled sources
  → scan clean_text for ATS job board links
  → extract slug from link
  → call ATS public API
  → for each job with tech-relevant title (engineer, data, ML, platform, infra, security):
      → store description as intel_source (source_type="job_posting")
      → chunk into intel_source_chunks
  → existing profile + primitive extractor receives enriched context
```

**New file:** `backend/intel/job_scraper.py`

```python
class JobScraper:
    async def detect_and_scrape(self, sources: list[IntelSource]) -> list[JobPosting]
    # Returns list of JobPosting(url, title, description, source_type="job_posting")
```

**Effort:** ~4 hours. Zero cost (all free public APIs).

---

## Phase B — GitHub org analysis

**What:** Search for the company's GitHub org by domain name. If found, fetch repo languages and SBOM dependency file. Store as `source_type = github`.

**Why:** Dependency files (`package.json`, `requirements.txt`, `Cargo.toml`, `go.mod`) are ground truth — not inferred. They produce `is_explicit = true` observations with `confidence >= 0.9`.

**Workflow:**

```
company domain (e.g. "scale.com")
  → strip to org name ("scale")
  → GitHub Search API: GET /search/users?q={name}+type:org
  → if found: GET /orgs/{org}/repos (top 10 by stars)
  → for each repo: GET /repos/{org}/{repo}/dependency-graph/sbom
  → parse SBOM for packages → extract framework/library signals
  → GET /repos/{org}/{repo} → primary language
  → store as intel_source(source_type="github", url=repo_url, clean_text=sbom_text)
```

**GitHub API:**

- Base URL: `https://api.github.com`
- Auth: `GITHUB_TOKEN` env var (free personal access token, 5000 req/hr)
- Rate limit without token: 60 req/hr (too low for prod use)
- SBOM endpoint: `/repos/{owner}/{repo}/dependency-graph/sbom` — returns full SPDX SBOM

**New file:** `backend/intel/github_analyzer.py`

```python
class GitHubAnalyzer:
    async def analyze(self, domain: str) -> list[GitHubResult]
    # Returns list of GitHubResult(org, repo, language, sbom_text)
```

**Confidence rules for GitHub-sourced observations:**
- Dependency found in SBOM → `is_explicit = True`, `confidence = 0.92`
- Primary language match → `is_explicit = True`, `confidence = 0.85`

**Effort:** ~4 hours. Requires `GITHUB_TOKEN` env var (free).

---

## Pipeline integration

All three phases are additive. The pipeline becomes:

```
intel_queue
  → ApifyCrawler (existing 15 pages + trust/status pages)   ← Phase C
  → JobScraper (detect ATS + fetch job descriptions)         ← Phase A
  → GitHubAnalyzer (find org + fetch SBOM)                   ← Phase B
  → all sources merged into intel_sources + intel_source_chunks
  → IntelExtractor (same — receives richer context)
  → OntologyNormalizer (same)
  → intel_observations + intel_observation_evidence
```

No changes to extractor prompts, normalizer, or DB schema.

---

## DB changes

None. `intel_sources.source_type` is already free-text. New values used:
- `trust_center`
- `status_page`
- `job_posting`
- `github`

---

## Env vars required

| Var | Phase | Required |
|---|---|---|
| `APIFY_API_TOKEN` | C | Already set |
| `ANTHROPIC_API_KEY` | C, A, B | Already set |
| `GITHUB_TOKEN` | B | New — free personal access token |

---

## Build order

| Phase | Scope | Effort | Dependencies |
|---|---|---|---|
| C | Add trust/status to Apify targets | 1h | None |
| A | Job scraper (Greenhouse/Lever/Ashby) | 4h | Phase C (ATS links detected from crawl) |
| B | GitHub org + SBOM analysis | 4h | None (independent) |

---

## Non-negotiables

- Never store a job posting observation without the source job title + URL as evidence
- GitHub SBOM observations always set `is_explicit = True`
- If ATS detection fails silently, pipeline continues (not a blocking failure)
- If GitHub org not found, pipeline continues (not a blocking failure)
