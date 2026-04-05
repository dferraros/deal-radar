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
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models import (
    IntelQueue, IntelSource, IntelSourceChunk,
    IntelCompanyProfile, IntelOntologyNode, IntelOntologyAlias,
    IntelObservation, IntelObservationEvidence,
)
from backend.intel.crawler import ApifyCrawler
from backend.intel.extractors import IntelExtractor
from backend.intel.normalizer import OntologyNormalizer

logger = logging.getLogger(__name__)

_CHUNK_SIZE = 500   # words per chunk
_PRIORITY_SOURCE_TYPES = ["product", "docs", "homepage", "blog", "careers", "github", "other"]


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

    queue.started_at = datetime.utcnow()
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
        queue.completed_at = datetime.utcnow()
        await db.commit()
        return

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
        profile_confidence=str(profile.confidence),
        model_version="claude-haiku-4-5-20251001",
    ))
    await db.commit()

    # ── Stage 4: Extract primitives ───────────────────────────────────────────
    primitives = await extractor.extract_primitives(profile, context_text)
    if not primitives:
        queue.status = "done"
        queue.completed_at = datetime.utcnow()
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
            confidence=str(primitive.confidence),
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
    queue.completed_at = datetime.utcnow()
    await db.commit()
    logger.info("[Intel] Pipeline complete for queue_id=%s (%d primitives)", queue_id, len(primitives))
