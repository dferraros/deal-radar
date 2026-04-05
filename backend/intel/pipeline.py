"""
Intel pipeline orchestrator.

Runs the full analysis for a single intel_queue entry:
  1. Crawl (Apify)
  2. Store sources + chunks
  3. Extract profile (Claude Haiku)
  4. Extract primitives (Claude Haiku)
  5. Normalize against ontology
  6. Store observations + evidence
  7. Update queue status

Usage:
  await run_intel_pipeline(queue_id, db)
"""
import logging
import uuid
from datetime import datetime, timezone

def _now() -> datetime:
    return datetime.now(timezone.utc)

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from urllib.parse import urlparse

from sqlalchemy import func

from backend.models import (
    Company, IntelQueue, IntelSource, IntelSourceChunk,
    IntelCompanyProfile, IntelOntologyNode, IntelOntologyAlias,
    IntelObservation, IntelObservationEvidence,
)
from backend.intel.crawler import ApifyCrawler, CrawlResult
from backend.intel.extractors import IntelExtractor
from backend.intel.normalizer import OntologyNormalizer
from backend.intel.job_scraper import JobScraper, JobPosting
from backend.intel.github_analyzer import GitHubAnalyzer, GitHubResult

logger = logging.getLogger(__name__)

_CHUNK_SIZE = 500   # words per chunk
_PRIORITY_SOURCE_TYPES = [
    "github",        # explicit dependency signals — highest confidence
    "trust_center",  # vendor/subprocessor lists — ground truth
    "job_posting",   # tech stack from JD requirements
    "product", "docs", "homepage", "blog", "careers", "status_page", "other",
]


def _job_posting_to_crawl_result(jp: JobPosting) -> CrawlResult:
    """Convert a JobPosting to a CrawlResult for uniform pipeline processing."""
    return CrawlResult(
        url=jp.url,
        source_type="job_posting",
        clean_text=f"JOB POSTING: {jp.title}\n\n{jp.description}",
    )


def _github_result_to_crawl_result(gr: GitHubResult) -> CrawlResult:
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


def _chunk_text(text: str, chunk_size: int = _CHUNK_SIZE) -> list[str]:
    """Split text into overlapping word chunks."""
    words = text.split()
    chunks = []
    i = 0
    while i < len(words):
        chunk = " ".join(words[i:i + chunk_size])
        chunks.append(chunk)
        i += chunk_size - 50  # 50-word overlap
    return chunks


def _assemble_context(sources: list) -> str:
    """Concatenate source texts in priority order, up to 8000 chars."""
    ordered = sorted(
        sources,
        key=lambda s: _PRIORITY_SOURCE_TYPES.index(s.source_type)
        if s.source_type in _PRIORITY_SOURCE_TYPES else 99
    )
    parts = []
    total = 0
    for s in ordered:
        text = (s.clean_text or "")[:3000]
        if total + len(text) > 8000:
            break
        parts.append(f"[{s.source_type.upper()}] {s.url}\n{text}")
        total += len(text)
    return "\n\n---\n\n".join(parts)


async def _load_ontology(db: AsyncSession) -> list[dict]:
    """Load all active ontology nodes + their aliases."""
    result = await db.execute(
        select(IntelOntologyNode).where(IntelOntologyNode.status == "active")
    )
    nodes = result.scalars().all()

    alias_result = await db.execute(select(IntelOntologyAlias))
    aliases = alias_result.scalars().all()
    alias_map: dict[str, list[str]] = {}
    for a in aliases:
        alias_map.setdefault(str(a.node_id), []).append(a.alias)

    return [
        {
            "id": str(n.id),
            "canonical_name": n.canonical_name,
            "aliases": alias_map.get(str(n.id), []),
        }
        for n in nodes
    ]


async def run_intel_pipeline(queue_id: uuid.UUID, db: AsyncSession) -> None:
    """
    Full intel analysis pipeline for one queue entry.
    Updates queue.status at each stage. Never raises — catches all errors.
    """
    # Load queue entry
    result = await db.execute(select(IntelQueue).where(IntelQueue.id == queue_id))
    queue = result.scalars().first()
    if not queue:
        logger.error("[Intel] Queue entry %s not found", queue_id)
        return

    queue.started_at = _now()
    queue.status = "crawling"
    await db.commit()

    # ── Stage 1: Crawl ────────────────────────────────────────────────────────
    try:
        crawler = ApifyCrawler()
        crawl_results = await crawler.crawl(queue.website)
    except Exception as exc:
        logger.error("[Intel] Crawl failed for %s: %s", queue.website, exc)
        crawl_results = []

    if not crawl_results:
        queue.status = "failed"
        queue.error_log = "Crawl returned no pages"
        queue.completed_at = _now()
        await db.commit()
        return

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

    # ── Stage 2: Store sources + chunks ──────────────────────────────────────
    queue.status = "extracting"
    await db.commit()

    stored_sources = []
    for cr in crawl_results:
        source = IntelSource(
            id=uuid.uuid4(),
            queue_id=queue.id,
            url=cr.url,
            source_type=cr.source_type,
            clean_text=cr.clean_text,
            content_hash=cr.content_hash,
            http_status=cr.http_status,
        )
        db.add(source)
        await db.flush()

        for i, chunk_text_val in enumerate(_chunk_text(cr.clean_text)):
            db.add(IntelSourceChunk(
                id=uuid.uuid4(),
                source_id=source.id,
                chunk_index=i,
                clean_text=chunk_text_val,
                token_count=len(chunk_text_val.split()),
            ))
        stored_sources.append(source)

    await db.commit()

    # ── Stage 3: Extract profile ──────────────────────────────────────────────
    context_text = _assemble_context(stored_sources)
    extractor = IntelExtractor()
    profile = await extractor.extract_profile(context_text)

    db.add(IntelCompanyProfile(
        id=uuid.uuid4(),
        queue_id=queue.id,
        summary=profile.summary,
        target_user=profile.target_user,
        workflow=profile.workflow,
        inputs=profile.inputs,
        outputs=profile.outputs,
        claimed_differentiators=profile.claimed_differentiators,
        jtbd=profile.jtbd,
        profile_confidence=float(profile.confidence),
        model_version="claude-haiku-4-5-20251001",
    ))
    await db.commit()

    # ── Stage 4: Extract primitives ───────────────────────────────────────────
    primitives = await extractor.extract_primitives(profile, context_text)
    if not primitives:
        queue.status = "done"
        queue.completed_at = _now()
        await db.commit()
        return

    # ── Stage 5: Normalize against ontology ──────────────────────────────────
    queue.status = "normalizing"
    await db.commit()

    ontology = await _load_ontology(db)
    normalizer = OntologyNormalizer()
    raw_names = [p.name for p in primitives]
    norm_results = await normalizer.normalize_batch(raw_names, ontology)

    # ── Stage 6: Store observations + evidence ────────────────────────────────
    for primitive, norm in zip(primitives, norm_results):
        if norm.create_new:
            new_node = IntelOntologyNode(
                id=uuid.uuid4(),
                canonical_name=norm.canonical_name,
                node_type="primitive",
                status="pending_review",
            )
            db.add(new_node)
            await db.flush()
            node_id = new_node.id
        else:
            node_id = uuid.UUID(norm.canonical_node_id)

        obs = IntelObservation(
            id=uuid.uuid4(),
            queue_id=queue.id,
            node_id=node_id,
            layer=primitive.layer,
            confidence=float(primitive.confidence),
            is_explicit=(primitive.explicit_vs_inferred == "explicit"),
            inference_method=norm.match_type,
            model_version="claude-haiku-4-5-20251001",
        )
        db.add(obs)
        await db.flush()

        for snippet in primitive.evidence_snippets[:3]:
            if snippet and len(snippet.strip()) > 10:
                db.add(IntelObservationEvidence(
                    id=uuid.uuid4(),
                    observation_id=obs.id,
                    evidence_text=snippet[:500],
                    evidence_type="inferred_from_text",
                ))

    queue.status = "done"
    queue.completed_at = _now()
    await db.commit()
    logger.info("[Intel] Pipeline complete for queue_id=%s (%d primitives)", queue_id, len(primitives))

    # ── Stage 7: Bridge → companies.tech_stack ───────────────────────────────
    # Write high-confidence primitives back to the deals company record so the
    # Deal Feed tech_stack column populates automatically after intel analysis.
    await _bridge_tech_stack_to_company(queue_id, queue.website, queue.company_name, db)

async def _bridge_tech_stack_to_company(
    queue_id: uuid.UUID,
    website: str,
    company_name: str,
    db: AsyncSession,
) -> None:
    """
    After intel analysis completes, write the top-confidence primitive names
    to the matching company record in the deals 'companies' table.

    Matching strategy (in order):
      1. queue.company_id FK if set
      2. Exact domain match on companies.website
      3. Case-insensitive company name match

    Only primitives with confidence >= 0.6 are written.
    Max 20 primitives to keep the column useful in the UI.
    Never raises — failure here must not break the pipeline.
    """
    _MIN_CONFIDENCE = 0.6
    _MAX_PRIMITIVES = 20

    try:
        # Fetch high-confidence observations with their canonical node names
        stmt = (
            select(IntelOntologyNode.canonical_name, IntelObservation.confidence, IntelObservation.is_explicit)
            .join(IntelOntologyNode, IntelObservation.node_id == IntelOntologyNode.id)
            .where(IntelObservation.queue_id == queue_id)
            .where(IntelOntologyNode.node_type == "primitive")
        )
        result = await db.execute(stmt)
        rows = result.all()

        # Filter, sort by confidence (explicit first, then by score desc)
        qualified = [
            (name, float(conf), is_explicit)
            for name, conf, is_explicit in rows
            if _safe_float(conf) >= _MIN_CONFIDENCE
        ]
        qualified.sort(key=lambda x: (x[2], x[1]), reverse=True)  # explicit > inferred, higher conf first
        tech_stack = [name for name, _, _ in qualified[:_MAX_PRIMITIVES]]

        if not tech_stack:
            logger.info("[Bridge] No qualifying primitives for queue_id=%s", queue_id)
            return

        # Locate the company record
        company = await _find_company(queue_id, website, company_name, db)
        if not company:
            logger.info("[Bridge] No matching company found for %s — tech_stack not written", company_name)
            return

        # Merge: keep existing entries not already in new list, prepend new ones
        existing = company.tech_stack or []
        merged = tech_stack + [t for t in existing if t not in tech_stack]
        company.tech_stack = merged[:_MAX_PRIMITIVES]
        await db.commit()
        logger.info("[Bridge] Wrote %d tech primitives to company=%s", len(company.tech_stack), company.name)

    except Exception as exc:
        logger.warning("[Bridge] tech_stack bridge failed for queue_id=%s: %s", queue_id, exc)


def _safe_float(value: object) -> float:
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return 0.0


async def _find_company(
    queue_id: uuid.UUID,
    website: str,
    company_name: str,
    db: AsyncSession,
) -> "Company | None":
    """Try three strategies to find the company row."""
    # Strategy 1: queue.company_id FK
    q_result = await db.execute(select(IntelQueue).where(IntelQueue.id == queue_id))
    queue = q_result.scalars().first()
    if queue and queue.company_id:
        c = await db.execute(select(Company).where(Company.id == queue.company_id))
        company = c.scalars().first()
        if company:
            return company

    # Strategy 2: domain match — normalize both sides to bare hostname
    domain = _extract_domain(website)
    if domain:
        stmt = select(Company).where(Company.website.ilike(f"%{domain}%"))
        c = await db.execute(stmt)
        company = c.scalars().first()
        if company:
            return company

    # Strategy 3: case-insensitive name match
    stmt = select(Company).where(func.lower(Company.name) == company_name.lower())
    c = await db.execute(stmt)
    return c.scalars().first()


def _extract_domain(url: str) -> str:
    """'https://www.stripe.com/payments' → 'stripe.com'"""
    try:
        hostname = urlparse(url).hostname or ""
        return hostname.removeprefix("www.")
    except Exception:
        return ""
