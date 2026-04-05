"""
Tech Bet Intelligence Engine — API router.

Routes:
  Queue management:
    POST   /api/intel/queue                    add company to queue
    GET    /api/intel/queue                    list queue
    DELETE /api/intel/queue/{id}               remove from queue
    POST   /api/intel/queue/{id}/retry         re-run failed entry

  Company intelligence:
    GET    /api/intel/companies/{id}/dossier   full dossier
    GET    /api/intel/companies/{id}/stack     stack layers only

  Aggregation:
    GET    /api/intel/technologies/graph       co-occurrence graph
    GET    /api/intel/technologies/trends      heatmap data

  Ontology:
    GET    /api/intel/ontology/nodes           full taxonomy
    POST   /api/intel/ontology/nodes/{id}/approve  approve pending node
"""
import logging
import uuid
from datetime import datetime, date, timedelta
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.database import get_session
from backend.models import (
    IntelQueue, IntelCompanyProfile, IntelObservation,
    IntelObservationEvidence, IntelOntologyNode, IntelOntologyAlias,
    IntelTechnologyScore, Company, Deal, IntelTechnicalBet,
)
from backend.intel.pipeline import run_intel_pipeline
from backend.intel.seed import seed_ontology

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/intel", tags=["intel"])


# ── Request/Response schemas ──────────────────────────────────────────────────

class QueueAddBody(BaseModel):
    company_id: Optional[uuid.UUID] = None
    company_name: str
    website: str


class QueueItem(BaseModel):
    id: uuid.UUID
    company_name: str
    website: str
    status: str
    queued_at: datetime
    completed_at: Optional[datetime] = None
    error_log: Optional[str] = None
    tech_preview: list[str] = []

    class Config:
        from_attributes = True


class EvidenceItem(BaseModel):
    evidence_text: str
    evidence_type: Optional[str] = None


class PrimitiveItem(BaseModel):
    canonical_name: str
    layer: Optional[str]
    confidence: float
    is_explicit: bool
    evidence: list[EvidenceItem]


class TechnicalBetItem(BaseModel):
    bet_index: int
    thesis: str
    implication: Optional[str]
    signals: list[str]
    confidence: float


class DossierResponse(BaseModel):
    queue_id: uuid.UUID
    company_name: str
    website: str
    jtbd: Optional[str]
    summary: Optional[str]
    target_user: list[str]
    profile_confidence: float
    primitives: list[PrimitiveItem]
    total_funding_usd: Optional[int]
    technical_bets: list[TechnicalBetItem] = []


class GraphNode(BaseModel):
    id: str
    label: str
    capital_weight: float
    company_count: int


class GraphEdge(BaseModel):
    source: str
    target: str
    weight: float


class GraphResponse(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]


class TrendCell(BaseModel):
    primitive: str
    period: str
    capital_weighted_score: float
    company_count: int


class OntologyNodeResponse(BaseModel):
    id: uuid.UUID
    canonical_name: str
    node_type: Optional[str]
    status: str
    aliases: list[str]

    class Config:
        from_attributes = True


# ── Queue endpoints ───────────────────────────────────────────────────────────

@router.post("/queue", response_model=QueueItem, status_code=status.HTTP_201_CREATED)
async def add_to_queue(
    body: QueueAddBody,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_session),
):
    """Add a company to the intel analysis queue and start pipeline immediately."""
    result = await db.execute(select(func.count()).select_from(IntelOntologyNode))
    count = result.scalar_one()
    if count == 0:
        await seed_ontology(db)

    entry = IntelQueue(
        id=uuid.uuid4(),
        company_id=body.company_id,
        company_name=body.company_name,
        website=body.website,
        status="queued",
        queued_at=datetime.utcnow(),
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)

    background_tasks.add_task(_run_pipeline_bg, entry.id)
    return entry


async def _run_pipeline_bg(queue_id: uuid.UUID):
    """Background task wrapper — creates its own DB session."""
    from backend.database import AsyncSessionFactory
    async with AsyncSessionFactory() as db:
        try:
            await run_intel_pipeline(queue_id, db)
        except Exception as exc:
            logger.error("[Intel] Background pipeline failed for %s: %s", queue_id, exc, exc_info=True)


@router.get("/queue", response_model=list[QueueItem])
async def list_queue(db: AsyncSession = Depends(get_session)):
    result = await db.execute(
        select(IntelQueue).order_by(IntelQueue.queued_at.desc()).limit(100)
    )
    items = result.scalars().all()

    done_ids = [q.id for q in items if q.status == "done"]
    tech_map: dict[uuid.UUID, list[str]] = {}
    if done_ids:
        stmt = (
            select(IntelObservation.queue_id, IntelOntologyNode.canonical_name, IntelObservation.confidence)
            .join(IntelOntologyNode, IntelObservation.node_id == IntelOntologyNode.id)
            .where(IntelObservation.queue_id.in_(done_ids))
            .where(IntelObservation.confidence >= 0.6)
            .where(IntelOntologyNode.node_type == "primitive")
            .order_by(IntelObservation.confidence.desc())
        )
        rows = (await db.execute(stmt)).all()
        for q_id, name, _ in rows:
            tech_map.setdefault(q_id, [])
            if len(tech_map[q_id]) < 3 and name not in tech_map[q_id]:
                tech_map[q_id].append(name)

    return [
        QueueItem(
            id=item.id,
            company_name=item.company_name,
            website=item.website,
            status=item.status,
            queued_at=item.queued_at,
            completed_at=item.completed_at,
            error_log=item.error_log,
            tech_preview=tech_map.get(item.id, []),
        )
        for item in items
    ]


@router.delete("/queue/{queue_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_from_queue(queue_id: uuid.UUID, db: AsyncSession = Depends(get_session)):
    result = await db.execute(select(IntelQueue).where(IntelQueue.id == queue_id))
    entry = result.scalars().first()
    if not entry:
        raise HTTPException(status_code=404, detail="Queue entry not found")
    await db.delete(entry)
    await db.commit()


@router.post("/queue/{queue_id}/retry", response_model=QueueItem)
async def retry_queue_entry(
    queue_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_session),
):
    result = await db.execute(select(IntelQueue).where(IntelQueue.id == queue_id))
    entry = result.scalars().first()
    if not entry:
        raise HTTPException(status_code=404, detail="Queue entry not found")
    entry.status = "queued"
    entry.error_log = None
    entry.started_at = None
    entry.completed_at = None
    await db.commit()
    await db.refresh(entry)
    background_tasks.add_task(_run_pipeline_bg, entry.id)
    return entry


# ── Company intelligence endpoints ────────────────────────────────────────────

@router.get("/companies/{queue_id}/dossier", response_model=DossierResponse)
async def get_dossier(queue_id: uuid.UUID, db: AsyncSession = Depends(get_session)):
    """Full company dossier: profile + primitives + evidence."""
    result = await db.execute(
        select(IntelQueue)
        .where(IntelQueue.id == queue_id)
        .options(selectinload(IntelQueue.profile))
    )
    queue = result.scalars().first()
    if not queue:
        raise HTTPException(status_code=404, detail="Queue entry not found")

    profile = queue.profile

    # Load observations with evidence + node
    obs_result = await db.execute(
        select(IntelObservation)
        .where(IntelObservation.queue_id == queue_id)
        .options(
            selectinload(IntelObservation.evidence),
            selectinload(IntelObservation.node),
        )
    )
    observations = obs_result.scalars().all()

    # Load technical bets
    bets_result = await db.execute(
        select(IntelTechnicalBet)
        .where(IntelTechnicalBet.queue_id == queue_id)
        .order_by(IntelTechnicalBet.bet_index)
    )
    bets_rows = bets_result.scalars().all()

    # Compute total funding via company_id if available
    total_funding = None
    if queue.company_id:
        funding_result = await db.execute(
            select(func.sum(Deal.amount_usd))
            .where(Deal.company_id == queue.company_id)
            .where(Deal.amount_usd.isnot(None))
        )
        total_funding = funding_result.scalar_one_or_none()

    primitives = []
    for obs in observations:
        node_name = obs.node.canonical_name if obs.node else "Unknown"
        primitives.append(PrimitiveItem(
            canonical_name=node_name,
            layer=obs.layer,
            confidence=obs.confidence or 0.0,
            is_explicit=obs.is_explicit or False,
            evidence=[
                EvidenceItem(
                    evidence_text=e.evidence_text,
                    evidence_type=e.evidence_type,
                )
                for e in obs.evidence
            ],
        ))

    return DossierResponse(
        queue_id=queue.id,
        company_name=queue.company_name,
        website=queue.website,
        jtbd=profile.jtbd if profile else None,
        summary=profile.summary if profile else None,
        target_user=profile.target_user if profile else [],
        profile_confidence=(profile.profile_confidence or 0.0) if profile else 0.0,
        primitives=primitives,
        total_funding_usd=total_funding,
        technical_bets=[
            TechnicalBetItem(
                bet_index=b.bet_index,
                thesis=b.thesis,
                implication=b.implication,
                signals=b.signals or [],
                confidence=b.confidence or 0.0,
            )
            for b in bets_rows
        ],
    )


@router.get("/companies/{queue_id}/stack")
async def get_stack(queue_id: uuid.UUID, db: AsyncSession = Depends(get_session)):
    """Stack layers only — primitives grouped by layer."""
    obs_result = await db.execute(
        select(IntelObservation)
        .where(IntelObservation.queue_id == queue_id)
        .options(selectinload(IntelObservation.node))
    )
    observations = obs_result.scalars().all()

    layers: dict[str, list] = {}
    for obs in observations:
        layer = obs.layer or "unknown"
        if layer not in layers:
            layers[layer] = []
        layers[layer].append({
            "canonical_name": obs.node.canonical_name if obs.node else "Unknown",
            "confidence": obs.confidence or 0.0,
            "is_explicit": obs.is_explicit,
        })
    return {"layers": layers}


# ── Aggregation endpoints ─────────────────────────────────────────────────────

@router.get("/technologies/graph", response_model=GraphResponse)
async def get_tech_graph(db: AsyncSession = Depends(get_session)):
    """Co-occurrence graph: nodes = primitives, edges = shared companies."""
    # Load all observations grouped by queue_id
    obs_result = await db.execute(
        select(IntelObservation).options(selectinload(IntelObservation.node))
    )
    all_obs = obs_result.scalars().all()

    # Build queue→nodes map
    queue_nodes: dict[str, list[str]] = {}
    node_capital: dict[str, float] = {}
    node_companies: dict[str, set] = {}
    node_names: dict[str, str] = {}

    for obs in all_obs:
        qid = str(obs.queue_id)
        nid = str(obs.node_id)
        node_names[nid] = obs.node.canonical_name if obs.node else nid
        queue_nodes.setdefault(qid, []).append(nid)
        node_companies.setdefault(nid, set()).add(qid)

    # Capital weighting: join queue → company → deals
    queue_result = await db.execute(
        select(IntelQueue).where(IntelQueue.company_id.isnot(None))
    )
    queues = queue_result.scalars().all()
    queue_funding: dict[str, float] = {}
    for q in queues:
        funding_result = await db.execute(
            select(func.sum(Deal.amount_usd))
            .where(Deal.company_id == q.company_id)
            .where(Deal.amount_usd.isnot(None))
        )
        amt = funding_result.scalar_one_or_none() or 0
        queue_funding[str(q.id)] = float(amt)

    for obs in all_obs:
        nid = str(obs.node_id)
        conf = obs.confidence or 0.5
        capital = queue_funding.get(str(obs.queue_id), 0)
        node_capital[nid] = node_capital.get(nid, 0) + capital * conf

    # Build edges from co-occurrence
    edge_weights: dict[tuple, float] = {}
    for qid, node_ids in queue_nodes.items():
        capital = queue_funding.get(qid, 1)
        for i, a in enumerate(node_ids):
            for b in node_ids[i + 1:]:
                key = (min(a, b), max(a, b))
                edge_weights[key] = edge_weights.get(key, 0) + capital

    nodes = [
        GraphNode(
            id=nid,
            label=node_names[nid],
            capital_weight=node_capital.get(nid, 0),
            company_count=len(node_companies.get(nid, set())),
        )
        for nid in node_names
    ]
    edges = [
        GraphEdge(source=src, target=tgt, weight=w)
        for (src, tgt), w in edge_weights.items()
    ]

    return GraphResponse(nodes=nodes, edges=edges)


@router.get("/technologies/trends", response_model=list[TrendCell])
async def get_tech_trends(db: AsyncSession = Depends(get_session)):
    """Technology trend scores: primitive × quarter."""
    result = await db.execute(
        select(IntelTechnologyScore)
        .options(selectinload(IntelTechnologyScore.node))
        .order_by(IntelTechnologyScore.period_start.desc())
        .limit(500)
    )
    scores = result.scalars().all()

    return [
        TrendCell(
            primitive=s.node.canonical_name if s.node else "Unknown",
            period=s.period_start.isoformat() if s.period_start else "",
            capital_weighted_score=float(s.capital_weighted_score or 0),
            company_count=s.company_count or 0,
        )
        for s in scores
    ]


# ── Ontology endpoints ────────────────────────────────────────────────────────

@router.get("/ontology/nodes", response_model=list[OntologyNodeResponse])
async def list_ontology_nodes(db: AsyncSession = Depends(get_session)):
    result = await db.execute(
        select(IntelOntologyNode)
        .options(selectinload(IntelOntologyNode.aliases))
        .order_by(IntelOntologyNode.canonical_name)
    )
    nodes = result.scalars().all()
    return [
        OntologyNodeResponse(
            id=n.id,
            canonical_name=n.canonical_name,
            node_type=n.node_type,
            status=n.status,
            aliases=[a.alias for a in n.aliases],
        )
        for n in nodes
    ]


@router.post("/ontology/nodes/{node_id}/approve", status_code=status.HTTP_200_OK)
async def approve_ontology_node(node_id: uuid.UUID, db: AsyncSession = Depends(get_session)):
    result = await db.execute(select(IntelOntologyNode).where(IntelOntologyNode.id == node_id))
    node = result.scalars().first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    node.status = "active"
    await db.commit()
    return {"status": "approved", "canonical_name": node.canonical_name}
