# Tech Bet Intelligence Engine — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a capital-weighted tech primitive inference engine inside deal-radar — crawl funded companies, extract what they actually build, infer technical primitives, and visualize emerging technology bets.

**Architecture:** Manual queue where users add companies → Apify crawls up to 15 pages → Claude Haiku extracts product profile + technical primitives → ontology normalizer maps to canonical 30-primitive taxonomy → daily aggregation computes capital-weighted scores → 4 React views (Queue, Dossier, Graph, Heatmap). Runs as FastAPI BackgroundTask, same pattern as existing ingestion pipeline. All observations evidence-linked with confidence scores.

**Tech Stack:** FastAPI + SQLAlchemy async + PostgreSQL (existing), apify-client (new), anthropic SDK (existing), React + D3 (existing), Tailwind CSS (existing).

---

## Context for the implementer

**Project root:** `C:/Users/ferra/OneDrive/Desktop/Projects/deal-radar/`

**Key existing files to understand before starting:**
- `backend/models.py` — ORM models, add Intel models here (no Alembic, project uses `create_tables()`)
- `backend/database.py` — `get_session()` dep, `AsyncSessionFactory`, `Base`
- `backend/ingestion/ai_extractor.py` — Claude Haiku pattern to copy for extractors
- `backend/routers/watchlist.py` — clean router pattern to follow
- `backend/scheduler.py` — APScheduler, add aggregation job here
- `backend/main.py` — register new router here
- `frontend/src/App.tsx` — add new routes here
- `frontend/src/components/Sidebar.tsx` — add nav item here (navItems array at line 17)

**No test directory exists** — create `tests/` and `tests/intel/` from scratch. Use `pytest` + `pytest-asyncio`.

**Environment variables needed (add to Railway):**
- `APIFY_API_TOKEN` — Apify API token

---

## Task 1: Intel DB models + seed ontology

**Files:**
- Modify: `backend/models.py`
- Create: `backend/intel/__init__.py`
- Create: `backend/intel/seed.py`
- Create: `tests/__init__.py`
- Create: `tests/intel/__init__.py`
- Create: `tests/intel/test_models.py`

**Step 1: Write the failing test**

```python
# tests/intel/test_models.py
import pytest
from backend.models import (
    IntelQueue, IntelSource, IntelSourceChunk,
    IntelCompanyProfile, IntelOntologyNode, IntelOntologyAlias,
    IntelObservation, IntelObservationEvidence, IntelTechnologyScore,
)

def test_intel_models_importable():
    """All 9 Intel ORM models can be imported."""
    assert IntelQueue.__tablename__ == "intel_queue"
    assert IntelSource.__tablename__ == "intel_sources"
    assert IntelSourceChunk.__tablename__ == "intel_source_chunks"
    assert IntelCompanyProfile.__tablename__ == "intel_company_profiles"
    assert IntelOntologyNode.__tablename__ == "intel_ontology_nodes"
    assert IntelOntologyAlias.__tablename__ == "intel_ontology_aliases"
    assert IntelObservation.__tablename__ == "intel_observations"
    assert IntelObservationEvidence.__tablename__ == "intel_observation_evidence"
    assert IntelTechnologyScore.__tablename__ == "intel_technology_scores"

def test_intel_queue_fields():
    q = IntelQueue()
    assert hasattr(q, 'status')
    assert hasattr(q, 'website')
    assert hasattr(q, 'company_name')
```

**Step 2: Run to verify it fails**

```bash
cd C:/Users/ferra/OneDrive/Desktop/Projects/deal-radar
pip install pytest pytest-asyncio
pytest tests/intel/test_models.py -v
```
Expected: `ImportError: cannot import name 'IntelQueue'`

**Step 3: Add all 9 Intel models to `backend/models.py`**

Append after the existing `AlertRule` class:

```python
# ─────────────────────────────────────────────
# Tech Bet Intelligence Engine models
# ─────────────────────────────────────────────

class IntelQueue(Base):
    __tablename__ = "intel_queue"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=True)
    company_name = Column(Text, nullable=False)
    website = Column(Text, nullable=False)
    status = Column(Text, default="queued")  # queued|crawling|extracting|normalizing|done|failed
    queued_at = Column(TIMESTAMPTZ, default=datetime.utcnow)
    started_at = Column(TIMESTAMPTZ, nullable=True)
    completed_at = Column(TIMESTAMPTZ, nullable=True)
    error_log = Column(Text, nullable=True)

    sources = relationship("IntelSource", back_populates="queue_entry", cascade="all, delete-orphan")
    profile = relationship("IntelCompanyProfile", back_populates="queue_entry", uselist=False, cascade="all, delete-orphan")
    observations = relationship("IntelObservation", back_populates="queue_entry", cascade="all, delete-orphan")


class IntelSource(Base):
    __tablename__ = "intel_sources"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    queue_id = Column(UUID(as_uuid=True), ForeignKey("intel_queue.id"), nullable=False)
    url = Column(Text, nullable=False)
    source_type = Column(Text)  # homepage|product|docs|blog|careers|github|other
    raw_text = Column(Text)
    clean_text = Column(Text)
    content_hash = Column(Text)
    fetched_at = Column(TIMESTAMPTZ, default=datetime.utcnow)
    http_status = Column(Integer, nullable=True)

    queue_entry = relationship("IntelQueue", back_populates="sources")
    chunks = relationship("IntelSourceChunk", back_populates="source", cascade="all, delete-orphan")


class IntelSourceChunk(Base):
    __tablename__ = "intel_source_chunks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_id = Column(UUID(as_uuid=True), ForeignKey("intel_sources.id"), nullable=False)
    chunk_index = Column(Integer, nullable=False)
    clean_text = Column(Text, nullable=False)
    token_count = Column(Integer, default=0)

    source = relationship("IntelSource", back_populates="chunks")


class IntelCompanyProfile(Base):
    __tablename__ = "intel_company_profiles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    queue_id = Column(UUID(as_uuid=True), ForeignKey("intel_queue.id"), nullable=False, unique=True)
    summary = Column(Text)
    target_user = Column(ARRAY(Text), default=list)
    workflow = Column(ARRAY(Text), default=list)
    inputs = Column(ARRAY(Text), default=list)
    outputs = Column(ARRAY(Text), default=list)
    claimed_differentiators = Column(ARRAY(Text), default=list)
    jtbd = Column(Text)
    profile_confidence = Column(Text)  # stored as string float e.g. "0.85"
    generated_at = Column(TIMESTAMPTZ, default=datetime.utcnow)
    model_version = Column(Text)

    queue_entry = relationship("IntelQueue", back_populates="profile")


class IntelOntologyNode(Base):
    __tablename__ = "intel_ontology_nodes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    canonical_name = Column(Text, unique=True, nullable=False)
    node_type = Column(Text)  # domain|system_class|primitive
    parent_id = Column(UUID(as_uuid=True), ForeignKey("intel_ontology_nodes.id"), nullable=True)
    description = Column(Text)
    status = Column(Text, default="active")  # active|pending_review
    created_at = Column(TIMESTAMPTZ, default=datetime.utcnow)

    aliases = relationship("IntelOntologyAlias", back_populates="node", cascade="all, delete-orphan")
    observations = relationship("IntelObservation", back_populates="node")
    scores = relationship("IntelTechnologyScore", back_populates="node", cascade="all, delete-orphan")


class IntelOntologyAlias(Base):
    __tablename__ = "intel_ontology_aliases"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    node_id = Column(UUID(as_uuid=True), ForeignKey("intel_ontology_nodes.id"), nullable=False)
    alias = Column(Text, nullable=False)
    alias_type = Column(Text, default="extracted")  # extracted|manual

    node = relationship("IntelOntologyNode", back_populates="aliases")


class IntelObservation(Base):
    __tablename__ = "intel_observations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    queue_id = Column(UUID(as_uuid=True), ForeignKey("intel_queue.id"), nullable=False)
    node_id = Column(UUID(as_uuid=True), ForeignKey("intel_ontology_nodes.id"), nullable=False)
    layer = Column(Text)  # model|application_logic|infra|interface|hardware
    confidence = Column(Text)  # stored as string float e.g. "0.78"
    is_explicit = Column(Boolean, default=False)
    inference_method = Column(Text)
    generated_at = Column(TIMESTAMPTZ, default=datetime.utcnow)
    model_version = Column(Text)

    queue_entry = relationship("IntelQueue", back_populates="observations")
    node = relationship("IntelOntologyNode", back_populates="observations")
    evidence = relationship("IntelObservationEvidence", back_populates="observation", cascade="all, delete-orphan")


class IntelObservationEvidence(Base):
    __tablename__ = "intel_observation_evidence"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    observation_id = Column(UUID(as_uuid=True), ForeignKey("intel_observations.id"), nullable=False)
    source_id = Column(UUID(as_uuid=True), ForeignKey("intel_sources.id"), nullable=True)
    evidence_text = Column(Text, nullable=False)
    evidence_reason = Column(Text)
    evidence_type = Column(Text)  # product_page|docs|careers|blog|github

    observation = relationship("IntelObservation", back_populates="evidence")


class IntelTechnologyScore(Base):
    __tablename__ = "intel_technology_scores"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    node_id = Column(UUID(as_uuid=True), ForeignKey("intel_ontology_nodes.id"), nullable=False)
    period_start = Column(Date, nullable=False)
    period_end = Column(Date, nullable=False)
    company_count = Column(Integer, default=0)
    capital_weighted_score = Column(Text, default="0.0")  # string float
    growth_rate = Column(Text, default="0.0")
    novelty_score = Column(Text, default="0.0")
    co_occurrence_density = Column(Text, default="0.0")

    node = relationship("IntelOntologyNode", back_populates="scores")
```

**Step 4: Create `backend/intel/__init__.py`** (empty)

**Step 5: Create `backend/intel/seed.py`**

```python
"""Seed the intel_ontology_nodes table with 30 canonical primitives."""
import uuid
from datetime import datetime

SEED_PRIMITIVES = [
    # (canonical_name, node_type, description)
    ("Transformer architectures", "primitive", "Attention-based neural network architecture"),
    ("Diffusion models", "primitive", "Generative models using iterative denoising"),
    ("RLHF / preference optimization", "primitive", "Reinforcement learning from human feedback"),
    ("Retrieval augmented generation", "primitive", "Combining retrieval systems with generative models"),
    ("Vector databases", "primitive", "Databases optimized for high-dimensional vector similarity search"),
    ("Tool calling / function calling", "primitive", "LLM capability to invoke external tools"),
    ("Agent orchestration", "primitive", "Multi-step AI agent coordination and task planning"),
    ("Long-context reasoning", "primitive", "Processing and reasoning over very long input sequences"),
    ("Multimodal encoders", "primitive", "Models that encode multiple modalities (text, image, audio)"),
    ("Vision-language models", "primitive", "Models understanding both images and text"),
    ("Computer vision (CNN-based)", "primitive", "Convolutional neural network visual processing"),
    ("Foundation model fine-tuning", "primitive", "Adapting pre-trained foundation models to specific tasks"),
    ("SLAM", "primitive", "Simultaneous localization and mapping for robotics navigation"),
    ("Sensor fusion", "primitive", "Combining data from multiple sensor types for richer perception"),
    ("Motion planning", "primitive", "Computing paths and trajectories for autonomous agents"),
    ("Robotic manipulation", "primitive", "Controlling robot arms and end-effectors to interact with objects"),
    ("Reinforcement learning policies", "primitive", "Learning behavior through reward signal optimization"),
    ("Imitation learning", "primitive", "Learning from expert demonstrations"),
    ("Sim-to-real transfer", "primitive", "Training in simulation then deploying to real environments"),
    ("Edge inference", "primitive", "Running AI models on edge devices with constrained compute"),
    ("GPU inference optimization", "primitive", "Maximizing throughput/latency of model inference on GPUs"),
    ("Synthetic data generation", "primitive", "Creating artificial training data at scale"),
    ("Data labeling pipelines", "primitive", "Human-in-the-loop systems for annotating training data"),
    ("Model evaluation frameworks", "primitive", "Systematic benchmarking and evaluation of AI models"),
    ("Experiment automation", "primitive", "Automated design and execution of scientific experiments"),
    ("High-throughput biological screening", "primitive", "Automated large-scale biological assays"),
    ("Protein structure prediction", "primitive", "Computational prediction of 3D protein folding"),
    ("Fleet routing", "primitive", "Optimizing routes for multiple autonomous agents or vehicles"),
    ("Real-time operating systems", "primitive", "OS designed for deterministic real-time task execution"),
    ("Autonomy stack", "primitive", "Full software stack enabling autonomous operation"),
]

SEED_ALIASES = {
    "Retrieval augmented generation": ["RAG", "retrieval pipeline", "retrieval augmented", "retrieval-augmented generation"],
    "SLAM": ["visual SLAM", "visual localization", "mapping stack", "simultaneous localization"],
    "Reinforcement learning policies": ["RL control", "policy learning", "RL policies"],
    "Tool calling / function calling": ["tool use", "function calling", "tool calling"],
    "Transformer architectures": ["transformer", "attention mechanism", "self-attention"],
    "Diffusion models": ["diffusion", "score-based models", "DDPM"],
    "Robotic manipulation": ["manipulation", "grasping", "end-effector control"],
    "Edge inference": ["edge AI", "on-device inference", "embedded inference"],
    "Agent orchestration": ["agentic workflows", "multi-agent", "agent framework"],
    "Imitation learning": ["behavior cloning", "learning from demonstration", "LfD"],
}


async def seed_ontology(db) -> int:
    """Insert seed primitives if not already present. Returns count inserted."""
    from sqlalchemy import select
    from backend.models import IntelOntologyNode, IntelOntologyAlias

    inserted = 0
    for name, node_type, description in SEED_PRIMITIVES:
        result = await db.execute(
            select(IntelOntologyNode).where(IntelOntologyNode.canonical_name == name)
        )
        existing = result.scalars().first()
        if existing:
            continue

        node = IntelOntologyNode(
            id=uuid.uuid4(),
            canonical_name=name,
            node_type=node_type,
            description=description,
            status="active",
            created_at=datetime.utcnow(),
        )
        db.add(node)
        await db.flush()  # get node.id before adding aliases

        for alias in SEED_ALIASES.get(name, []):
            db.add(IntelOntologyAlias(
                id=uuid.uuid4(),
                node_id=node.id,
                alias=alias,
                alias_type="manual",
            ))
        inserted += 1

    await db.commit()
    return inserted
```

**Step 6: Run test to verify it passes**

```bash
pytest tests/intel/test_models.py -v
```
Expected: `2 passed`

**Step 7: Commit**

```bash
git add backend/models.py backend/intel/ tests/
git commit -m "feat(intel): add 9 ORM models + 30-primitive seed ontology"
```

---

## Task 2: Apify crawler integration

**Files:**
- Modify: `requirements.txt`
- Create: `backend/intel/crawler.py`
- Create: `tests/intel/test_crawler.py`

**Step 1: Add apify-client to requirements.txt**

Add this line:
```
apify-client>=1.6.0
```

Install locally: `pip install apify-client`

**Step 2: Write the failing test**

```python
# tests/intel/test_crawler.py
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from backend.intel.crawler import ApifyCrawler, CrawlResult

def test_crawl_result_dataclass():
    r = CrawlResult(url="https://example.com", source_type="homepage", clean_text="hello", http_status=200)
    assert r.url == "https://example.com"
    assert r.source_type == "homepage"

@pytest.mark.asyncio
async def test_classify_url():
    crawler = ApifyCrawler(api_token="fake")
    assert crawler._classify_url("https://example.com") == "homepage"
    assert crawler._classify_url("https://example.com/blog/post") == "blog"
    assert crawler._classify_url("https://example.com/careers") == "careers"
    assert crawler._classify_url("https://example.com/docs/api") == "docs"
    assert crawler._classify_url("https://github.com/company/repo") == "github"

@pytest.mark.asyncio
async def test_crawl_returns_empty_on_error():
    crawler = ApifyCrawler(api_token="fake")
    with patch.object(crawler, '_run_actor', side_effect=Exception("API error")):
        results = await crawler.crawl("https://example.com")
    assert results == []
```

**Step 3: Run to verify it fails**

```bash
pytest tests/intel/test_crawler.py -v
```
Expected: `ImportError: cannot import name 'ApifyCrawler'`

**Step 4: Create `backend/intel/crawler.py`**

```python
"""
Apify-based web crawler for Tech Bet Intelligence Engine.

Crawls company websites using the apify/website-content-crawler actor.
Returns cleaned text per page, classified by source type.
"""
import asyncio
import hashlib
import logging
import os
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

_SOURCE_TYPE_PATTERNS = {
    "github": ["github.com"],
    "docs": ["/docs", "/documentation", "/api-reference", "/developers", "/technology"],
    "blog": ["/blog", "/news", "/insights", "/articles", "/press"],
    "careers": ["/careers", "/jobs", "/hiring", "/join-us", "/team"],
    "product": ["/product", "/solutions", "/platform", "/features", "/how-it-works"],
}


@dataclass
class CrawlResult:
    url: str
    source_type: str
    clean_text: str
    http_status: int = 200
    content_hash: str = ""

    def __post_init__(self):
        if not self.content_hash and self.clean_text:
            self.content_hash = hashlib.md5(self.clean_text.encode()).hexdigest()


class ApifyCrawler:
    """Crawls a company website using Apify's website-content-crawler."""

    _ACTOR_ID = "apify/website-content-crawler"
    _MAX_PAGES = 15
    _TIMEOUT_SECS = 120

    def __init__(self, api_token: str | None = None):
        self._token = api_token or os.environ.get("APIFY_API_TOKEN", "")

    def _classify_url(self, url: str) -> str:
        url_lower = url.lower()
        for source_type, patterns in _SOURCE_TYPE_PATTERNS.items():
            if any(p in url_lower for p in patterns):
                return source_type
        return "homepage"

    async def _run_actor(self, start_url: str) -> list[dict]:
        """Run the Apify actor and return raw items. Runs in thread pool to avoid blocking."""
        from apify_client import ApifyClient

        def _sync_run():
            client = ApifyClient(self._token)
            run = client.actor(self._ACTOR_ID).call(
                run_input={
                    "startUrls": [{"url": start_url}],
                    "maxCrawlPages": self._MAX_PAGES,
                    "crawlerType": "playwright:adaptive",
                    "readableTextCharThreshold": 100,
                    "removeCookieWarnings": True,
                    "htmlTransformer": "readableText",
                },
                timeout_secs=self._TIMEOUT_SECS,
            )
            dataset_id = run.get("defaultDatasetId")
            if not dataset_id:
                return []
            items = list(client.dataset(dataset_id).iterate_items())
            return items

        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, _sync_run)

    async def crawl(self, website: str) -> list[CrawlResult]:
        """
        Crawl a company website. Returns up to MAX_PAGES CrawlResults.
        Never raises — returns [] on any error.
        """
        if not self._token:
            logger.warning("[Crawler] APIFY_API_TOKEN not set — skipping crawl for %s", website)
            return []

        try:
            items = await self._run_actor(website)
        except Exception as exc:
            logger.error("[Crawler] Apify actor failed for %s: %s", website, exc)
            return []

        results = []
        for item in items:
            url = item.get("url", "")
            text = item.get("text") or item.get("markdown") or ""
            if not text or len(text.strip()) < 100:
                continue
            results.append(CrawlResult(
                url=url,
                source_type=self._classify_url(url),
                clean_text=text.strip(),
                http_status=item.get("statusCode", 200),
            ))

        logger.info("[Crawler] Crawled %d pages for %s", len(results), website)
        return results
```

**Step 5: Run test to verify it passes**

```bash
pytest tests/intel/test_crawler.py -v
```
Expected: `3 passed`

**Step 6: Commit**

```bash
git add requirements.txt backend/intel/crawler.py tests/intel/test_crawler.py
git commit -m "feat(intel): Apify crawler — classifies pages by source type"
```

---

## Task 3: Profile extractor + primitive decomposer

**Files:**
- Create: `backend/intel/extractors.py`
- Create: `tests/intel/test_extractors.py`

**Step 1: Write the failing test**

```python
# tests/intel/test_extractors.py
import pytest
from unittest.mock import AsyncMock, patch
from backend.intel.extractors import IntelExtractor, IntelProfile, IntelPrimitive

def test_profile_dataclass():
    p = IntelProfile(
        summary="Builds autonomous drones.",
        target_user=["logistics operators"],
        workflow=["dispatch", "fly", "deliver"],
        inputs=["delivery request"],
        outputs=["completed delivery"],
        claimed_differentiators=["autonomous nav"],
        jtbd="When operators need fast delivery, they use this to automate last-mile.",
        confidence=0.87,
    )
    assert p.confidence == 0.87
    assert "logistics" in p.target_user[0]

def test_primitive_dataclass():
    pr = IntelPrimitive(
        name="Computer Vision",
        layer="model",
        explicit_vs_inferred="inferred",
        confidence=0.78,
        evidence_snippets=["navigates autonomously"],
    )
    assert pr.confidence == 0.78

@pytest.mark.asyncio
async def test_extract_profile_returns_default_on_api_error():
    extractor = IntelExtractor()
    with patch.object(extractor, '_call_llm', side_effect=Exception("API down")):
        profile = await extractor.extract_profile("some text about a company")
    assert profile.confidence < 0.3
    assert profile.jtbd is not None

@pytest.mark.asyncio
async def test_extract_primitives_returns_empty_on_api_error():
    extractor = IntelExtractor()
    profile = IntelProfile(summary="test", jtbd="test jtbd", confidence=0.5)
    with patch.object(extractor, '_call_llm', side_effect=Exception("API down")):
        primitives = await extractor.extract_primitives(profile, "some evidence text")
    assert isinstance(primitives, list)
    assert len(primitives) == 0
```

**Step 2: Run to verify it fails**

```bash
pytest tests/intel/test_extractors.py -v
```
Expected: `ImportError: cannot import name 'IntelExtractor'`

**Step 3: Create `backend/intel/extractors.py`**

```python
"""
LLM extraction layer for Tech Bet Intelligence Engine.

Two extractors:
  1. extract_profile()    → company summary, JTBD, inputs/outputs
  2. extract_primitives() → technical primitive inference with evidence

Both use Claude Haiku, return strict JSON, never raise on LLM failure.
"""
import json
import logging
import os
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

_PROFILE_SYSTEM = (
    "You are a product analyst. Extract only what the company likely does in practice. "
    "Return strict JSON only — no markdown, no explanation. "
    "If evidence is weak, set confidence below 0.4."
)

_PROFILE_USER = """\
Given the text below, identify:
1. company_summary (1-2 sentences, practical — not marketing)
2. target_user (array of user types, e.g. ["logistics operators", "health systems"])
3. operational_workflow (array of steps in order)
4. system_inputs (array, e.g. ["delivery request", "GPS coordinates"])
5. system_outputs (array, e.g. ["completed delivery", "tracking data"])
6. claimed_differentiators (array)
7. core_job_to_be_done (one sentence format: "When X needs to Y, they use this to Z under constraint W.")
8. confidence_0_to_1

Return JSON with these exact keys:
{{
  "company_summary": "",
  "target_user": [],
  "operational_workflow": [],
  "system_inputs": [],
  "system_outputs": [],
  "claimed_differentiators": [],
  "core_job_to_be_done": "",
  "confidence_0_to_1": 0.0
}}

TEXT:
{source_text}
"""

_PRIMITIVES_SYSTEM = (
    "You are a technical due diligence analyst. "
    "Infer technical primitives from product evidence. "
    "Return strict JSON only — no markdown, no explanation. "
    "Separate explicit claims from inferred. Use low confidence when evidence is thin. "
    "Prefer primitives at engineering decision level — what engineers actually choose."
)

_PRIMITIVES_USER = """\
Given the company profile and evidence text, identify likely technical primitives.

Return JSON with these exact keys:
{{
  "domain": [],
  "system_classes": [],
  "primitives": [
    {{
      "name": "",
      "layer": "model|application_logic|infra|interface|hardware",
      "explicit_vs_inferred": "explicit|inferred",
      "confidence_0_to_1": 0.0,
      "evidence_snippets": [""]
    }}
  ]
}}

Rules:
- domain: coarse categories like "AI", "Robotics", "Biotech", "Infra", "Logistics" (max 3)
- system_classes: e.g. "Computer vision", "Foundation models", "Control systems" (max 5)
- primitives: specific engineering choices — not industry labels
- Do not claim proprietary certainty — infer from product constraints and language
- Max 10 primitives

COMPANY_PROFILE:
{profile_json}

EVIDENCE_TEXT:
{source_text}
"""

_MODEL = "claude-haiku-4-5-20251001"
_MAX_TOKENS = 1200


@dataclass
class IntelProfile:
    summary: str = ""
    target_user: list = field(default_factory=list)
    workflow: list = field(default_factory=list)
    inputs: list = field(default_factory=list)
    outputs: list = field(default_factory=list)
    claimed_differentiators: list = field(default_factory=list)
    jtbd: str = ""
    confidence: float = 0.0


@dataclass
class IntelPrimitive:
    name: str = ""
    layer: str = ""
    explicit_vs_inferred: str = "inferred"
    confidence: float = 0.0
    evidence_snippets: list = field(default_factory=list)


class IntelExtractor:
    """LLM-based extractor for company profiles and technical primitives."""

    def __init__(self):
        self._api_key = os.environ.get("ANTHROPIC_API_KEY", "")

    async def _call_llm(self, system: str, user: str) -> dict:
        """Call Claude Haiku and parse JSON response. Raises on failure."""
        import anthropic
        client = anthropic.AsyncAnthropic(api_key=self._api_key)
        message = await client.messages.create(
            model=_MODEL,
            max_tokens=_MAX_TOKENS,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        text = message.content[0].text.strip()
        # Strip markdown code fences if present
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        return json.loads(text)

    async def extract_profile(self, source_text: str) -> IntelProfile:
        """Extract company profile from concatenated source text. Never raises."""
        text_truncated = source_text[:8000]
        try:
            data = await self._call_llm(
                _PROFILE_SYSTEM,
                _PROFILE_USER.format(source_text=text_truncated),
            )
            return IntelProfile(
                summary=data.get("company_summary", ""),
                target_user=data.get("target_user", []),
                workflow=data.get("operational_workflow", []),
                inputs=data.get("system_inputs", []),
                outputs=data.get("system_outputs", []),
                claimed_differentiators=data.get("claimed_differentiators", []),
                jtbd=data.get("core_job_to_be_done", ""),
                confidence=float(data.get("confidence_0_to_1", 0.0)),
            )
        except Exception as exc:
            logger.error("[IntelExtractor] Profile extraction failed: %s", exc)
            return IntelProfile(jtbd="Extraction failed", confidence=0.1)

    async def extract_primitives(self, profile: IntelProfile, source_text: str) -> list[IntelPrimitive]:
        """Extract technical primitives from profile + source evidence. Never raises."""
        import json as _json
        text_truncated = source_text[:6000]
        profile_json = _json.dumps({
            "summary": profile.summary,
            "jtbd": profile.jtbd,
            "inputs": profile.inputs,
            "outputs": profile.outputs,
        })
        try:
            data = await self._call_llm(
                _PRIMITIVES_SYSTEM,
                _PRIMITIVES_USER.format(profile_json=profile_json, source_text=text_truncated),
            )
            primitives = []
            for p in data.get("primitives", []):
                primitives.append(IntelPrimitive(
                    name=str(p.get("name", "")),
                    layer=str(p.get("layer", "model")),
                    explicit_vs_inferred=str(p.get("explicit_vs_inferred", "inferred")),
                    confidence=float(p.get("confidence_0_to_1", 0.0)),
                    evidence_snippets=p.get("evidence_snippets", []),
                ))
            return primitives
        except Exception as exc:
            logger.error("[IntelExtractor] Primitive extraction failed: %s", exc)
            return []
```

**Step 4: Run test to verify it passes**

```bash
pytest tests/intel/test_extractors.py -v
```
Expected: `4 passed`

**Step 5: Commit**

```bash
git add backend/intel/extractors.py tests/intel/test_extractors.py
git commit -m "feat(intel): profile extractor + primitive decomposer (Claude Haiku)"
```

---

## Task 4: Ontology normalizer

**Files:**
- Create: `backend/intel/normalizer.py`
- Create: `tests/intel/test_normalizer.py`

**Step 1: Write the failing test**

```python
# tests/intel/test_normalizer.py
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from backend.intel.normalizer import OntologyNormalizer, NormalizationResult

def test_normalization_result():
    r = NormalizationResult(
        raw_name="RAG pipeline",
        canonical_node_id=None,
        canonical_name="Retrieval augmented generation",
        match_type="alias",
        confidence=0.95,
        create_new=False,
    )
    assert r.match_type == "alias"
    assert not r.create_new

@pytest.mark.asyncio
async def test_normalize_finds_exact_match():
    normalizer = OntologyNormalizer()
    ontology = [
        {"id": "abc-123", "canonical_name": "Vector databases", "aliases": ["vector db", "vector store"]}
    ]
    result = await normalizer.normalize_single("vector databases", ontology)
    assert result.canonical_name == "Vector databases"
    assert result.match_type == "exact"
    assert result.confidence > 0.9

@pytest.mark.asyncio
async def test_normalize_finds_alias_match():
    normalizer = OntologyNormalizer()
    ontology = [
        {"id": "abc-123", "canonical_name": "Retrieval augmented generation", "aliases": ["RAG", "retrieval pipeline"]}
    ]
    result = await normalizer.normalize_single("RAG", ontology)
    assert result.canonical_name == "Retrieval augmented generation"
    assert result.match_type == "alias"
```

**Step 2: Run to verify it fails**

```bash
pytest tests/intel/test_normalizer.py -v
```
Expected: `ImportError: cannot import name 'OntologyNormalizer'`

**Step 3: Create `backend/intel/normalizer.py`**

```python
"""
Ontology normalization for Tech Bet Intelligence Engine.

Maps raw extracted primitive names to canonical ontology nodes.
Strategy: exact match → alias match → fuzzy match → LLM fallback → create_new flag.
"""
import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class NormalizationResult:
    raw_name: str
    canonical_node_id: str | None
    canonical_name: str
    match_type: str  # exact|alias|fuzzy|llm|new
    confidence: float
    create_new: bool


def _normalize_str(s: str) -> str:
    return s.lower().strip().replace("-", " ").replace("_", " ")


class OntologyNormalizer:
    """Maps raw primitive names to canonical ontology nodes."""

    _FUZZY_THRESHOLD = 80  # fuzzywuzzy ratio threshold

    async def normalize_single(
        self,
        raw_name: str,
        ontology: list[dict],
    ) -> NormalizationResult:
        """
        Try to match raw_name to a canonical node.
        ontology: list of {id, canonical_name, aliases: [str]}
        """
        raw_norm = _normalize_str(raw_name)

        # 1. Exact match on canonical name
        for node in ontology:
            if _normalize_str(node["canonical_name"]) == raw_norm:
                return NormalizationResult(
                    raw_name=raw_name,
                    canonical_node_id=node["id"],
                    canonical_name=node["canonical_name"],
                    match_type="exact",
                    confidence=1.0,
                    create_new=False,
                )

        # 2. Alias match
        for node in ontology:
            for alias in node.get("aliases", []):
                if _normalize_str(alias) == raw_norm:
                    return NormalizationResult(
                        raw_name=raw_name,
                        canonical_node_id=node["id"],
                        canonical_name=node["canonical_name"],
                        match_type="alias",
                        confidence=0.95,
                        create_new=False,
                    )

        # 3. Fuzzy match
        try:
            from fuzzywuzzy import fuzz
            best_score = 0
            best_node = None
            for node in ontology:
                score = fuzz.ratio(raw_norm, _normalize_str(node["canonical_name"]))
                if score > best_score:
                    best_score = score
                    best_node = node
                for alias in node.get("aliases", []):
                    score = fuzz.ratio(raw_norm, _normalize_str(alias))
                    if score > best_score:
                        best_score = score
                        best_node = node

            if best_score >= self._FUZZY_THRESHOLD and best_node:
                return NormalizationResult(
                    raw_name=raw_name,
                    canonical_node_id=best_node["id"],
                    canonical_name=best_node["canonical_name"],
                    match_type="fuzzy",
                    confidence=best_score / 100,
                    create_new=False,
                )
        except ImportError:
            pass

        # 4. No match — flag for new node creation
        return NormalizationResult(
            raw_name=raw_name,
            canonical_node_id=None,
            canonical_name=raw_name,  # use raw as provisional canonical
            match_type="new",
            confidence=0.5,
            create_new=True,
        )

    async def normalize_batch(
        self,
        raw_names: list[str],
        ontology: list[dict],
    ) -> list[NormalizationResult]:
        """Normalize a batch of raw names against the ontology."""
        results = []
        for name in raw_names:
            result = await self.normalize_single(name, ontology)
            results.append(result)
        return results
```

**Step 4: Run test to verify it passes**

```bash
pytest tests/intel/test_normalizer.py -v
```
Expected: `3 passed`

**Step 5: Commit**

```bash
git add backend/intel/normalizer.py tests/intel/test_normalizer.py
git commit -m "feat(intel): ontology normalizer — exact/alias/fuzzy match + create_new flag"
```

---

## Task 5: Intel pipeline orchestrator

**Files:**
- Create: `backend/intel/pipeline.py`
- Create: `tests/intel/test_pipeline.py`

**Step 1: Write the failing test**

```python
# tests/intel/test_pipeline.py
import pytest
import uuid
from unittest.mock import AsyncMock, patch, MagicMock

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

    # Mock DB execute to return the queue entry
    mock_result = MagicMock()
    mock_result.scalars.return_value.first.return_value = mock_queue
    mock_db.execute = AsyncMock(return_value=mock_result)
    mock_db.commit = AsyncMock()

    with patch("backend.intel.pipeline.ApifyCrawler") as MockCrawler:
        MockCrawler.return_value.crawl = AsyncMock(return_value=[])
        await run_intel_pipeline(mock_queue.id, mock_db)

    assert mock_queue.status == "failed"
```

**Step 2: Run to verify it fails**

```bash
pytest tests/intel/test_pipeline.py -v
```
Expected: `ImportError: cannot import name 'run_intel_pipeline'`

**Step 3: Create `backend/intel/pipeline.py`**

```python
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
    IntelObservation, IntelObservationEvidence, Company, Deal,
)
from backend.intel.crawler import ApifyCrawler
from backend.intel.extractors import IntelExtractor
from backend.intel.normalizer import OntologyNormalizer

logger = logging.getLogger(__name__)

_CHUNK_SIZE = 500   # chars per chunk (approximate)
_PRIORITY_SOURCE_TYPES = ["product", "docs", "homepage", "blog", "careers", "github", "other"]


def _chunk_text(text: str, chunk_size: int = _CHUNK_SIZE) -> list[str]:
    """Split text into overlapping chunks."""
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
    ordered = sorted(sources, key=lambda s: _PRIORITY_SOURCE_TYPES.index(s.source_type)
                     if s.source_type in _PRIORITY_SOURCE_TYPES else 99)
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
        select(IntelOntologyNode)
        .where(IntelOntologyNode.status == "active")
    )
    nodes = result.scalars().all()
    # Load aliases
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

        for i, chunk_text in enumerate(_chunk_text(cr.clean_text)):
            db.add(IntelSourceChunk(
                id=uuid.uuid4(),
                source_id=source.id,
                chunk_index=i,
                clean_text=chunk_text,
                token_count=len(chunk_text.split()),
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
        # Create new ontology node if needed
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

        # Store evidence snippets
        for snippet in primitive.evidence_snippets[:3]:  # max 3 per primitive
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
```

**Step 4: Run test to verify it passes**

```bash
pytest tests/intel/test_pipeline.py -v
```
Expected: `2 passed`

**Step 5: Commit**

```bash
git add backend/intel/pipeline.py tests/intel/test_pipeline.py
git commit -m "feat(intel): pipeline orchestrator — crawl→extract→normalize→store"
```

---

## Task 6: API router + aggregation job

**Files:**
- Create: `backend/routers/intel.py`
- Modify: `backend/main.py` (add router import + include)
- Modify: `backend/scheduler.py` (add daily aggregation job)
- Create: `tests/intel/test_intel_router.py`

**Step 1: Write the failing test**

```python
# tests/intel/test_intel_router.py
import pytest
from backend.routers.intel import router

def test_router_exists():
    from fastapi import APIRouter
    assert isinstance(router, APIRouter)

def test_router_has_queue_routes():
    routes = {r.path for r in router.routes}
    assert "/intel/queue" in routes

def test_router_has_dossier_route():
    routes = {r.path for r in router.routes}
    assert any("dossier" in r for r in routes)
```

**Step 2: Run to verify it fails**

```bash
pytest tests/intel/test_intel_router.py -v
```
Expected: `ImportError: cannot import name 'router'`

**Step 3: Create `backend/routers/intel.py`**

```python
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
    GET    /api/intel/technologies/jtbd-map    JTBD clusters

  Ontology:
    GET    /api/intel/ontology/nodes           full taxonomy
    POST   /api/intel/ontology/nodes/{id}/approve  approve pending node
"""
import logging
import uuid
from datetime import datetime, date
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.database import get_session
from backend.models import (
    IntelQueue, IntelCompanyProfile, IntelObservation,
    IntelObservationEvidence, IntelOntologyNode, IntelTechnologyScore,
    Company, Deal,
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
    # Seed ontology if empty
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
    return result.scalars().all()


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
    background_tasks.add_task(_run_pipeline_bg, entry.id)
    return entry


# ── Company intelligence endpoints ───────────────────────────────────────────

@router.get("/companies/{queue_id}/dossier", response_model=DossierResponse)
async def get_dossier(queue_id: uuid.UUID, db: AsyncSession = Depends(get_session)):
    """Full dossier: profile + inferred stack + evidence."""
    queue_result = await db.execute(select(IntelQueue).where(IntelQueue.id == queue_id))
    queue = queue_result.scalars().first()
    if not queue:
        raise HTTPException(status_code=404, detail="Queue entry not found")

    profile_result = await db.execute(
        select(IntelCompanyProfile).where(IntelCompanyProfile.queue_id == queue_id)
    )
    profile = profile_result.scalars().first()

    # Load observations with node + evidence
    obs_result = await db.execute(
        select(IntelObservation)
        .where(IntelObservation.queue_id == queue_id)
        .options(
            selectinload(IntelObservation.node),
            selectinload(IntelObservation.evidence),
        )
    )
    observations = obs_result.scalars().all()

    # Compute total funding (if linked to a company in deals)
    total_funding = None
    if queue.company_id:
        funding_result = await db.execute(
            select(func.sum(Deal.amount_usd)).where(
                Deal.company_id == queue.company_id,
                Deal.amount_usd.isnot(None),
            )
        )
        total_funding = funding_result.scalar_one_or_none()

    primitives = []
    for obs in observations:
        if not obs.node:
            continue
        primitives.append(PrimitiveItem(
            canonical_name=obs.node.canonical_name,
            layer=obs.layer,
            confidence=float(obs.confidence or 0),
            is_explicit=obs.is_explicit or False,
            evidence=[
                EvidenceItem(evidence_text=e.evidence_text, evidence_type=e.evidence_type)
                for e in obs.evidence
            ],
        ))

    # Sort by confidence desc
    primitives.sort(key=lambda p: p.confidence, reverse=True)

    return DossierResponse(
        queue_id=queue.id,
        company_name=queue.company_name,
        website=queue.website,
        jtbd=profile.jtbd if profile else None,
        summary=profile.summary if profile else None,
        target_user=profile.target_user if profile else [],
        profile_confidence=float(profile.profile_confidence or 0) if profile else 0.0,
        primitives=primitives,
        total_funding_usd=total_funding,
    )


# ── Aggregation endpoints ─────────────────────────────────────────────────────

@router.get("/technologies/graph", response_model=GraphResponse)
async def get_tech_graph(
    min_companies: int = Query(2, ge=1),
    db: AsyncSession = Depends(get_session),
):
    """Co-occurrence graph: nodes=primitives, edges=shared companies."""
    # Nodes: primitives with ≥ min_companies observations
    nodes_result = await db.execute(
        select(IntelOntologyNode, func.count(IntelObservation.id).label("obs_count"))
        .join(IntelObservation, IntelObservation.node_id == IntelOntologyNode.id)
        .where(IntelOntologyNode.status == "active")
        .group_by(IntelOntologyNode.id)
        .having(func.count(IntelObservation.id) >= min_companies)
    )
    node_rows = nodes_result.all()

    if not node_rows:
        return GraphResponse(nodes=[], edges=[])

    node_ids = {str(row.IntelOntologyNode.id) for row in node_rows}

    # Capital weight per node (sum of deal amounts for companies using that primitive)
    capital_map: dict[str, float] = {}
    for row in node_rows:
        node_id = str(row.IntelOntologyNode.id)
        cap_result = await db.execute(
            select(func.coalesce(func.sum(Deal.amount_usd), 0))
            .select_from(IntelObservation)
            .join(IntelQueue, IntelObservation.queue_id == IntelQueue.id)
            .outerjoin(Deal, Deal.company_id == IntelQueue.company_id)
            .where(IntelObservation.node_id == row.IntelOntologyNode.id)
        )
        capital_map[node_id] = float(cap_result.scalar_one_or_none() or 0)

    graph_nodes = [
        GraphNode(
            id=str(row.IntelOntologyNode.id),
            label=row.IntelOntologyNode.canonical_name,
            capital_weight=capital_map.get(str(row.IntelOntologyNode.id), 0),
            company_count=row.obs_count,
        )
        for row in node_rows
    ]

    # Edges: pairs of primitives that co-occur in the same queue entry
    edges_sql = text("""
        SELECT a.node_id::text as source, b.node_id::text as target, COUNT(*) as weight
        FROM intel_observations a
        JOIN intel_observations b ON a.queue_id = b.queue_id AND a.node_id < b.node_id
        GROUP BY a.node_id, b.node_id
        HAVING COUNT(*) >= 1
    """)
    edges_result = await db.execute(edges_sql)
    graph_edges = [
        GraphEdge(source=row.source, target=row.target, weight=float(row.weight))
        for row in edges_result.fetchall()
        if row.source in node_ids and row.target in node_ids
    ]

    return GraphResponse(nodes=graph_nodes, edges=graph_edges)


@router.get("/technologies/trends")
async def get_tech_trends(
    quarters: int = Query(8, ge=1, le=20),
    db: AsyncSession = Depends(get_session),
):
    """Heatmap data: top 30 primitives × last N quarters, capital-weighted."""
    result = await db.execute(
        select(IntelTechnologyScore)
        .join(IntelOntologyNode)
        .where(IntelOntologyNode.status == "active")
        .order_by(IntelTechnologyScore.period_start.desc())
        .limit(30 * quarters)
    )
    scores = result.scalars().all()
    return {"items": [
        {
            "node_id": str(s.node_id),
            "period_start": s.period_start.isoformat() if s.period_start else None,
            "period_end": s.period_end.isoformat() if s.period_end else None,
            "company_count": s.company_count,
            "capital_weighted_score": float(s.capital_weighted_score or 0),
            "growth_rate": float(s.growth_rate or 0),
        }
        for s in scores
    ]}


# ── Ontology endpoints ────────────────────────────────────────────────────────

@router.get("/ontology/nodes")
async def list_ontology_nodes(db: AsyncSession = Depends(get_session)):
    result = await db.execute(
        select(IntelOntologyNode)
        .options(selectinload(IntelOntologyNode.aliases))
        .order_by(IntelOntologyNode.canonical_name)
    )
    nodes = result.scalars().all()
    return [
        {
            "id": str(n.id),
            "canonical_name": n.canonical_name,
            "node_type": n.node_type,
            "status": n.status,
            "aliases": [a.alias for a in n.aliases],
        }
        for n in nodes
    ]


@router.post("/ontology/nodes/{node_id}/approve", status_code=status.HTTP_200_OK)
async def approve_node(node_id: uuid.UUID, db: AsyncSession = Depends(get_session)):
    result = await db.execute(select(IntelOntologyNode).where(IntelOntologyNode.id == node_id))
    node = result.scalars().first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    node.status = "active"
    await db.commit()
    return {"id": str(node.id), "canonical_name": node.canonical_name, "status": node.status}
```

**Step 4: Register router in `backend/main.py`**

Add after `from backend.routers import alerts as alerts_router`:
```python
from backend.routers import intel as intel_router
```

Add after `app.include_router(alerts_router.router, prefix="/api")`:
```python
app.include_router(intel_router.router, prefix="/api")
```

**Step 5: Add aggregation job to `backend/scheduler.py`**

Add this function and register it:
```python
async def daily_intel_aggregation_job() -> None:
    """Runs daily at 6am UTC. Recomputes capital-weighted tech scores."""
    from backend.database import AsyncSessionFactory
    from backend.intel.aggregation import run_aggregation
    logger.info("[Scheduler] Starting daily intel aggregation")
    try:
        async with AsyncSessionFactory() as session:
            await run_aggregation(session)
        logger.info("[Scheduler] Intel aggregation complete")
    except Exception as exc:
        logger.error("[Scheduler] Intel aggregation failed: %s", exc, exc_info=True)
```

Also create `backend/intel/aggregation.py`:
```python
"""Daily aggregation: recomputes intel_technology_scores."""
import uuid
import logging
from datetime import date, timedelta
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession
from backend.models import IntelObservation, IntelTechnologyScore, IntelOntologyNode, IntelQueue, Deal

logger = logging.getLogger(__name__)


async def run_aggregation(db: AsyncSession) -> None:
    """Recompute scores for the current quarter and prior quarter."""
    today = date.today()
    # Current quarter
    quarter_start = date(today.year, ((today.month - 1) // 3) * 3 + 1, 1)
    quarter_end = today

    nodes_result = await db.execute(
        select(IntelOntologyNode).where(IntelOntologyNode.status == "active")
    )
    nodes = nodes_result.scalars().all()

    for node in nodes:
        # Count companies + capital for this quarter
        obs_result = await db.execute(
            select(IntelObservation.queue_id)
            .join(IntelQueue, IntelObservation.queue_id == IntelQueue.id)
            .where(
                IntelObservation.node_id == node.id,
                IntelQueue.completed_at >= quarter_start,
            )
        )
        queue_ids = [row[0] for row in obs_result.fetchall()]
        company_count = len(set(queue_ids))

        # Capital weight
        capital = 0.0
        for qid in set(queue_ids):
            qresult = await db.execute(
                select(IntelQueue.company_id).where(IntelQueue.id == qid)
            )
            company_id = qresult.scalar_one_or_none()
            if company_id:
                cap_result = await db.execute(
                    select(func.coalesce(func.sum(Deal.amount_usd), 0))
                    .where(Deal.company_id == company_id, Deal.amount_usd.isnot(None))
                )
                capital += float(cap_result.scalar_one_or_none() or 0)

        # Upsert score record
        existing = await db.execute(
            select(IntelTechnologyScore).where(
                IntelTechnologyScore.node_id == node.id,
                IntelTechnologyScore.period_start == quarter_start,
            )
        )
        score_row = existing.scalars().first()
        if score_row:
            score_row.company_count = company_count
            score_row.capital_weighted_score = str(capital / 1_000_000)  # in $M
        else:
            db.add(IntelTechnologyScore(
                id=uuid.uuid4(),
                node_id=node.id,
                period_start=quarter_start,
                period_end=quarter_end,
                company_count=company_count,
                capital_weighted_score=str(capital / 1_000_000),
            ))

    await db.commit()
    logger.info("[Aggregation] Scores updated for %d nodes", len(nodes))
```

**Step 6: Run test to verify it passes**

```bash
pytest tests/intel/test_intel_router.py -v
```
Expected: `3 passed`

**Step 7: Verify build still compiles**

```bash
cd C:/Users/ferra/OneDrive/Desktop/Projects/deal-radar/frontend && npm run build
```
Expected: `✓ built` (no backend changes that affect frontend yet)

**Step 8: Commit**

```bash
git add backend/routers/intel.py backend/intel/aggregation.py backend/main.py backend/scheduler.py
git commit -m "feat(intel): API router — queue, dossier, graph, trends, ontology endpoints"
```

---

## Task 7: Frontend — Queue view + Dossier view

**Files:**
- Modify: `frontend/src/components/Sidebar.tsx` (add nav item)
- Modify: `frontend/src/App.tsx` (add routes)
- Create: `frontend/src/views/IntelQueue.tsx`
- Create: `frontend/src/views/IntelDossier.tsx`

**Step 1: Add "Tech Intel" to sidebar nav**

In `frontend/src/components/Sidebar.tsx`, find `navItems` array (line 17). Import `Brain` from lucide-react. Add after the Network item:
```tsx
import {
  LayoutDashboard, Grid3X3, TrendingUp, Users,
  Network, Star, Bell, Settings, Radio, Brain,
} from 'lucide-react'

// In navItems array, add:
{ to: '/intel', label: 'Tech Intel', icon: Brain },
```

**Step 2: Add routes to `frontend/src/App.tsx`**

```tsx
import IntelQueue from './views/IntelQueue'
import IntelDossier from './views/IntelDossier'
import IntelGraph from './views/IntelGraph'
import IntelHeatmap from './views/IntelHeatmap'

// Inside <Route element={<Layout />}>:
<Route path="/intel" element={<IntelQueue />} />
<Route path="/intel/dossier/:queueId" element={<IntelDossier />} />
<Route path="/intel/graph" element={<IntelGraph />} />
<Route path="/intel/heatmap" element={<IntelHeatmap />} />
```

**Step 3: Create `frontend/src/views/IntelQueue.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { Brain, Plus, RefreshCw, AlertTriangle, CheckCircle, Loader2, Clock } from 'lucide-react'
import LoadingSpinner from '../components/LoadingSpinner'
import ErrorBanner from '../components/ErrorBanner'

interface QueueItem {
  id: string
  company_name: string
  website: string
  status: string
  queued_at: string
  completed_at: string | null
  error_log: string | null
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  queued:      { label: 'Queued',      color: 'text-zinc-400 bg-zinc-800',           icon: Clock },
  crawling:    { label: 'Crawling',    color: 'text-sky-400 bg-sky-950/50',           icon: Loader2 },
  extracting:  { label: 'Extracting', color: 'text-amber-400 bg-amber-950/50',       icon: Loader2 },
  normalizing: { label: 'Normalizing',color: 'text-violet-400 bg-violet-950/50',     icon: Loader2 },
  done:        { label: 'Done',        color: 'text-emerald-400 bg-emerald-950/50',  icon: CheckCircle },
  failed:      { label: 'Failed',      color: 'text-rose-400 bg-rose-950/50',        icon: AlertTriangle },
}

export default function IntelQueue() {
  const navigate = useNavigate()
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ company_name: '', website: '' })
  const [adding, setAdding] = useState(false)

  const fetchQueue = () => {
    axios.get('/api/intel/queue')
      .then((r) => setQueue(r.data))
      .catch(() => setError('Could not load intel queue.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchQueue()
    // Poll every 8s for status updates while any item is in-progress
    const interval = setInterval(() => {
      const hasActive = queue.some((q) => ['queued','crawling','extracting','normalizing'].includes(q.status))
      if (hasActive) fetchQueue()
    }, 8000)
    return () => clearInterval(interval)
  }, [queue.length])

  const handleAdd = async () => {
    if (!addForm.company_name || !addForm.website) return
    setAdding(true)
    try {
      await axios.post('/api/intel/queue', addForm)
      setAddForm({ company_name: '', website: '' })
      setShowAdd(false)
      fetchQueue()
    } catch {
      setError('Failed to add company.')
    } finally {
      setAdding(false)
    }
  }

  const handleRetry = async (id: string) => {
    await axios.post(`/api/intel/queue/${id}/retry`)
    fetchQueue()
  }

  const handleDelete = async (id: string) => {
    await axios.delete(`/api/intel/queue/${id}`)
    fetchQueue()
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-6 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-zinc-50 flex items-center gap-2">
            <Brain size={18} className="text-amber-400" strokeWidth={1.5} />
            Tech Intel
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Capital-weighted technology bet inference — add companies to analyze
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate('/intel/graph')}
            className="text-xs px-3 py-1.5 rounded border border-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors font-mono"
          >
            Graph
          </button>
          <button
            onClick={() => navigate('/intel/heatmap')}
            className="text-xs px-3 py-1.5 rounded border border-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors font-mono"
          >
            Heatmap
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="text-xs px-3 py-1.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 transition-colors flex items-center gap-1"
          >
            <Plus size={12} /> Add Company
          </button>
        </div>
      </div>

      {/* Add Company Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-full max-w-md">
            <h2 className="text-sm font-semibold text-zinc-100 mb-4">Add Company to Intel Queue</h2>
            <div className="space-y-3">
              <input
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500/50"
                placeholder="Company name"
                value={addForm.company_name}
                onChange={(e) => setAddForm((f) => ({ ...f, company_name: e.target.value }))}
              />
              <input
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500/50"
                placeholder="https://company.com"
                value={addForm.website}
                onChange={(e) => setAddForm((f) => ({ ...f, website: e.target.value }))}
              />
            </div>
            <div className="flex gap-2 mt-4 justify-end">
              <button onClick={() => setShowAdd(false)} className="text-xs px-3 py-1.5 text-zinc-400 hover:text-zinc-200">Cancel</button>
              <button
                onClick={handleAdd}
                disabled={adding}
                className="text-xs px-4 py-1.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 disabled:opacity-50"
              >
                {adding ? 'Adding...' : 'Add & Analyze'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 px-6 pb-6 overflow-auto">
        {loading ? <LoadingSpinner /> : error ? <ErrorBanner message={error} /> : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="px-4 py-3 text-left text-xs font-mono text-zinc-500 uppercase tracking-wider">Company</th>
                  <th className="px-4 py-3 text-left text-xs font-mono text-zinc-500 uppercase tracking-wider">Website</th>
                  <th className="px-4 py-3 text-left text-xs font-mono text-zinc-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-mono text-zinc-500 uppercase tracking-wider">Queued</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {queue.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-12 text-center text-zinc-600 text-sm">No companies analyzed yet. Add one above.</td></tr>
                )}
                {queue.map((item) => {
                  const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.queued
                  const Icon = cfg.icon
                  const isActive = ['crawling','extracting','normalizing'].includes(item.status)
                  return (
                    <tr key={item.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <button
                          onClick={() => item.status === 'done' && navigate(`/intel/dossier/${item.id}`)}
                          className={`font-medium ${item.status === 'done' ? 'text-zinc-100 hover:text-amber-400 cursor-pointer' : 'text-zinc-400 cursor-default'}`}
                        >
                          {item.company_name}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-zinc-500 font-mono text-xs">{item.website}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded font-mono ${cfg.color}`}>
                          <Icon size={10} className={isActive ? 'animate-spin' : ''} />
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-600 text-xs font-mono">
                        {new Date(item.queued_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center gap-2 justify-end">
                          {item.status === 'failed' && (
                            <button onClick={() => handleRetry(item.id)} className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1">
                              <RefreshCw size={10} /> Retry
                            </button>
                          )}
                          <button onClick={() => handleDelete(item.id)} className="text-xs text-zinc-600 hover:text-rose-400 transition-colors">✕</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
```

**Step 4: Create `frontend/src/views/IntelDossier.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { Brain, ChevronDown, ChevronRight, ExternalLink, ArrowLeft } from 'lucide-react'
import LoadingSpinner from '../components/LoadingSpinner'
import ErrorBanner from '../components/ErrorBanner'

interface EvidenceItem { evidence_text: string; evidence_type: string | null }
interface PrimitiveItem {
  canonical_name: string; layer: string | null;
  confidence: number; is_explicit: boolean; evidence: EvidenceItem[]
}
interface Dossier {
  queue_id: string; company_name: string; website: string
  jtbd: string | null; summary: string | null; target_user: string[]
  profile_confidence: number; primitives: PrimitiveItem[]
  total_funding_usd: number | null
}

const LAYER_ORDER = ['interface','application_logic','model','infra','hardware']
const CONFIDENCE_COLOR = (c: number) =>
  c >= 0.75 ? 'text-emerald-400 bg-emerald-950/40 border-emerald-800/40'
  : c >= 0.5  ? 'text-amber-400 bg-amber-950/40 border-amber-800/40'
  : 'text-zinc-400 bg-zinc-800/40 border-zinc-700/40'

function formatUSD(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`
  return `$${n.toLocaleString()}`
}

export default function IntelDossier() {
  const { queueId } = useParams<{ queueId: string }>()
  const navigate = useNavigate()
  const [dossier, setDossier] = useState<Dossier | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  useEffect(() => {
    axios.get(`/api/intel/companies/${queueId}/dossier`)
      .then((r) => setDossier(r.data))
      .catch(() => setError('Could not load dossier.'))
      .finally(() => setLoading(false))
  }, [queueId])

  if (loading) return <LoadingSpinner />
  if (error || !dossier) return <ErrorBanner message={error || 'Not found'} />

  const byLayer = LAYER_ORDER.reduce((acc, layer) => {
    acc[layer] = dossier.primitives.filter((p) => p.layer === layer)
    return acc
  }, {} as Record<string, PrimitiveItem[]>)

  const LAYER_LABELS: Record<string, string> = {
    interface: 'Interface', application_logic: 'App Logic',
    model: 'Models / Algorithms', infra: 'Infrastructure', hardware: 'Hardware',
  }

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="px-6 pt-6 pb-4">
        <button onClick={() => navigate('/intel')} className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1 mb-4">
          <ArrowLeft size={12} /> Back to queue
        </button>

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-zinc-50 flex items-center gap-2">
              <Brain size={18} className="text-amber-400" strokeWidth={1.5} />
              {dossier.company_name}
            </h1>
            <a href={dossier.website} target="_blank" rel="noreferrer"
              className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1 mt-1">
              {dossier.website} <ExternalLink size={10} />
            </a>
          </div>
          {dossier.total_funding_usd && (
            <div className="text-right">
              <div className="text-xs text-zinc-500">Total Funding</div>
              <div className="text-lg font-bold text-emerald-400 tabular">{formatUSD(dossier.total_funding_usd)}</div>
            </div>
          )}
        </div>

        {/* JTBD card */}
        {dossier.jtbd && (
          <div className="border-l-4 border-amber-400 bg-amber-950/20 px-4 py-3 rounded-r-lg mb-6">
            <div className="text-xs text-amber-500 font-mono uppercase tracking-wider mb-1">Core Job To Be Done</div>
            <p className="text-sm text-zinc-100 leading-relaxed">{dossier.jtbd}</p>
            <div className="text-xs text-zinc-600 mt-2 font-mono">
              Profile confidence: {(dossier.profile_confidence * 100).toFixed(0)}%
            </div>
          </div>
        )}

        {/* Summary */}
        {dossier.summary && (
          <p className="text-sm text-zinc-400 mb-6 leading-relaxed">{dossier.summary}</p>
        )}

        {/* Stack layers */}
        <h2 className="text-xs font-mono text-zinc-500 uppercase tracking-wider mb-3">Inferred Technology Stack</h2>
        <div className="space-y-3 mb-8">
          {LAYER_ORDER.map((layer) => {
            const prims = byLayer[layer]
            if (!prims.length) return null
            return (
              <div key={layer} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                <div className="text-xs text-zinc-500 font-mono uppercase tracking-wider mb-3">
                  {LAYER_LABELS[layer]}
                </div>
                <div className="flex flex-wrap gap-2">
                  {prims.map((p) => (
                    <div key={p.canonical_name}>
                      <button
                        onClick={() => setExpanded((e) => ({ ...e, [p.canonical_name]: !e[p.canonical_name] }))}
                        className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border transition-colors ${CONFIDENCE_COLOR(p.confidence)}`}
                      >
                        {p.is_explicit ? '●' : '○'} {p.canonical_name}
                        <span className="font-mono opacity-70">{(p.confidence * 100).toFixed(0)}%</span>
                        {expanded[p.canonical_name] ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                      </button>
                      {/* Evidence drawer */}
                      {expanded[p.canonical_name] && p.evidence.length > 0 && (
                        <div className="mt-2 ml-1 space-y-1.5">
                          {p.evidence.map((ev, i) => (
                            <div key={i} className="text-xs text-zinc-400 bg-zinc-800/60 border border-zinc-700/50 rounded px-3 py-2 italic">
                              "{ev.evidence_text}"
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* Target users */}
        {dossier.target_user.length > 0 && (
          <div className="mb-6">
            <div className="text-xs text-zinc-500 font-mono uppercase tracking-wider mb-2">Target Users</div>
            <div className="flex flex-wrap gap-2">
              {dossier.target_user.map((u) => (
                <span key={u} className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">{u}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

**Step 5: Build frontend to verify no errors**

```bash
cd C:/Users/ferra/OneDrive/Desktop/Projects/deal-radar/frontend && npm run build
```
Expected: `✓ built`

**Step 6: Commit**

```bash
git add frontend/src/views/IntelQueue.tsx frontend/src/views/IntelDossier.tsx frontend/src/components/Sidebar.tsx frontend/src/App.tsx
git commit -m "feat(intel): Queue view + Dossier view with stack layers and evidence drawer"
```

---

## Task 8: Frontend — Primitive Graph + Trend Heatmap

**Files:**
- Create: `frontend/src/views/IntelGraph.tsx`
- Create: `frontend/src/views/IntelHeatmap.tsx`
- Note: D3 is already installed (used by InvestorNetwork.tsx)

**Step 1: Create `frontend/src/views/IntelGraph.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import * as d3 from 'd3'
import { Cpu, ArrowLeft } from 'lucide-react'
import LoadingSpinner from '../components/LoadingSpinner'
import ErrorBanner from '../components/ErrorBanner'

interface GraphNode { id: string; label: string; capital_weight: number; company_count: number }
interface GraphEdge { source: string | GraphNode; target: string | GraphNode; weight: number }
interface GraphData { nodes: GraphNode[]; edges: GraphEdge[] }

export default function IntelGraph() {
  const navigate = useNavigate()
  const svgRef = useRef<SVGSVGElement>(null)
  const [data, setData] = useState<GraphData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hovered, setHovered] = useState<GraphNode | null>(null)

  useEffect(() => {
    axios.get('/api/intel/technologies/graph')
      .then((r) => setData(r.data))
      .catch(() => setError('Could not load tech graph.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!data || !svgRef.current || data.nodes.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    const width = svgRef.current.clientWidth || 800
    const height = svgRef.current.clientHeight || 600
    const g = svg.append('g')

    svg.call(d3.zoom<SVGSVGElement, unknown>().on('zoom', (e) => g.attr('transform', e.transform)))

    const maxCap = d3.max(data.nodes, (n) => n.capital_weight) || 1
    const r = d3.scaleSqrt().domain([0, maxCap]).range([6, 28])
    const maxEdge = d3.max(data.edges, (e) => e.weight) || 1
    const strokeW = d3.scaleLinear().domain([1, maxEdge]).range([1, 5])

    // Domain color palette
    const DOMAIN_COLORS = ['#34d399','#a78bfa','#38bdf8','#fb7185','#f59e0b','#6ee7b7','#c084fc']
    const domainColor = d3.scaleOrdinal<string>().range(DOMAIN_COLORS)

    const simulation = d3.forceSimulation<GraphNode>(data.nodes)
      .force('link', d3.forceLink<GraphNode, GraphEdge>(data.edges).id((d) => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide<GraphNode>().radius((d) => r(d.capital_weight) + 6))

    const link = g.append('g').selectAll('line').data(data.edges).join('line')
      .attr('stroke', '#3f3f46').attr('stroke-opacity', 0.5)
      .attr('stroke-width', (d) => strokeW(d.weight))

    const node = g.append('g').selectAll('circle').data(data.nodes).join('circle')
      .attr('r', (d) => r(d.capital_weight))
      .attr('fill', (d) => domainColor(d.label.split(' ')[0]))
      .attr('fill-opacity', 0.8)
      .attr('stroke', '#78716c').attr('stroke-width', 1)
      .attr('cursor', 'pointer')
      .call((d3.drag<SVGCircleElement, GraphNode>()
        .on('start', (event, d) => { if (!event.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y })
        .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y })
        .on('end', (event, d) => { if (!event.active) simulation.alphaTarget(0); d.fx = null; d.fy = null })
      ) as any)

    node.on('mouseover', (_e, d) => {
      setHovered(d)
      node.attr('fill-opacity', (n) => n.id === d.id ? 1 : 0.2)
      link.attr('stroke-opacity', (e: any) => {
        const src = typeof e.source === 'object' ? e.source.id : e.source
        const tgt = typeof e.target === 'object' ? e.target.id : e.target
        return (src === d.id || tgt === d.id) ? 0.9 : 0.05
      })
    }).on('mouseout', () => {
      setHovered(null)
      node.attr('fill-opacity', 0.8)
      link.attr('stroke-opacity', 0.5)
    })

    const label = g.append('g').selectAll('text').data(data.nodes.filter((n) => n.company_count >= 2))
      .join('text').text((d) => d.label)
      .attr('font-size', 9).attr('fill', '#a1a1aa').attr('dy', -10).attr('text-anchor', 'middle')

    simulation.on('tick', () => {
      link.attr('x1', (d: any) => d.source.x).attr('y1', (d: any) => d.source.y)
          .attr('x2', (d: any) => d.target.x).attr('y2', (d: any) => d.target.y)
      node.attr('cx', (d: any) => d.x).attr('cy', (d: any) => d.y)
      label.attr('x', (d: any) => d.x).attr('y', (d: any) => d.y)
    })

    return () => { simulation.stop(); svg.on('.zoom', null) }
  }, [data])

  function formatCap(n: number): string {
    if (n >= 1000) return `$${(n / 1000).toFixed(1)}B`
    if (n >= 1) return `$${n.toFixed(0)}M`
    return `<$1M`
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-6 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-zinc-50 flex items-center gap-2">
            <Cpu size={18} className="text-amber-400" strokeWidth={1.5} />
            Primitive Co-occurrence Graph
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Node size = capital weight · Edges = companies using both primitives
          </p>
        </div>
        <button onClick={() => navigate('/intel')} className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1">
          <ArrowLeft size={12} /> Queue
        </button>
      </div>

      <div className="flex-1 px-6 pb-6 relative">
        {loading ? <LoadingSpinner /> : error ? <ErrorBanner message={error} /> :
          !data || data.nodes.length === 0 ? (
            <div className="flex items-center justify-center h-64 bg-zinc-900 border border-zinc-800 rounded-lg">
              <p className="text-zinc-500 text-sm">No graph data yet — analyze some companies first.</p>
            </div>
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden h-[600px] relative">
              <svg ref={svgRef} width="100%" height="100%" />
              {hovered && (
                <div className="absolute top-4 right-4 bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-xs min-w-[160px]">
                  <div className="text-zinc-100 font-semibold mb-1">{hovered.label}</div>
                  <div className="text-zinc-400">Companies: <span className="text-emerald-400">{hovered.company_count}</span></div>
                  <div className="text-zinc-400">Capital: <span className="text-emerald-400">{formatCap(hovered.capital_weight)}</span></div>
                </div>
              )}
            </div>
          )
        }
      </div>
    </div>
  )
}
```

**Step 2: Create `frontend/src/views/IntelHeatmap.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { BarChart2, ArrowLeft } from 'lucide-react'
import LoadingSpinner from '../components/LoadingSpinner'
import ErrorBanner from '../components/ErrorBanner'

interface ScoreItem {
  node_id: string; period_start: string; period_end: string
  company_count: number; capital_weighted_score: number; growth_rate: number
}
interface TrendsResponse { items: ScoreItem[] }

export default function IntelHeatmap() {
  const navigate = useNavigate()
  const [data, setData] = useState<ScoreItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ontology, setOntology] = useState<Record<string, string>>({})

  useEffect(() => {
    Promise.all([
      axios.get<TrendsResponse>('/api/intel/technologies/trends'),
      axios.get<Array<{ id: string; canonical_name: string }>>('/api/intel/ontology/nodes'),
    ])
      .then(([trendsRes, ontRes]) => {
        setData(trendsRes.data.items)
        const map: Record<string, string> = {}
        ontRes.data.forEach((n) => { map[n.id] = n.canonical_name })
        setOntology(map)
      })
      .catch(() => setError('Could not load trend data.'))
      .finally(() => setLoading(false))
  }, [])

  // Build pivot: primitive × period
  const periods = [...new Set(data.map((d) => d.period_start))].sort()
  const nodeIds = [...new Set(data.map((d) => d.node_id))]
  const pivot: Record<string, Record<string, ScoreItem>> = {}
  data.forEach((d) => {
    if (!pivot[d.node_id]) pivot[d.node_id] = {}
    pivot[d.node_id][d.period_start] = d
  })

  // Sort nodes by total capital score desc
  const sortedNodes = nodeIds.sort((a, b) => {
    const sumA = Object.values(pivot[a] || {}).reduce((s, x) => s + x.capital_weighted_score, 0)
    const sumB = Object.values(pivot[b] || {}).reduce((s, x) => s + x.capital_weighted_score, 0)
    return sumB - sumA
  })

  function getCellClass(score: number, maxScore: number): string {
    if (score === 0 || !score) return 'bg-zinc-900 border-zinc-800'
    const r = score / maxScore
    if (r < 0.05) return 'bg-emerald-950 border-emerald-900/40'
    if (r < 0.15) return 'bg-emerald-900 border-emerald-800/50'
    if (r < 0.30) return 'bg-emerald-800 border-emerald-700/60'
    if (r < 0.50) return 'bg-emerald-700 border-emerald-600/70'
    if (r < 0.75) return 'bg-emerald-600 border-emerald-500/80'
    return 'bg-emerald-500 border-emerald-400/80'
  }

  const maxScore = Math.max(...data.map((d) => d.capital_weighted_score), 1)

  function formatPeriod(p: string): string {
    const d = new Date(p)
    return `Q${Math.ceil((d.getMonth() + 1) / 3)} ${d.getFullYear()}`
  }

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="px-6 pt-6 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-zinc-50 flex items-center gap-2">
            <BarChart2 size={18} className="text-amber-400" strokeWidth={1.5} />
            Technology Trend Heatmap
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Capital-weighted primitive adoption over time
          </p>
        </div>
        <button onClick={() => navigate('/intel')} className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1">
          <ArrowLeft size={12} /> Queue
        </button>
      </div>

      <div className="flex-1 px-6 pb-6">
        {loading ? <LoadingSpinner /> : error ? <ErrorBanner message={error} /> :
          sortedNodes.length === 0 ? (
            <div className="flex items-center justify-center h-64 bg-zinc-900 border border-zinc-800 rounded-lg">
              <p className="text-zinc-500 text-sm">No trend data yet — analyze some companies first.</p>
            </div>
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-auto">
              <table className="text-xs w-full">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="px-4 py-3 text-left font-mono text-zinc-500 sticky left-0 bg-zinc-900 min-w-[220px]">Primitive</th>
                    {periods.map((p) => (
                      <th key={p} className="px-3 py-3 text-center font-mono text-zinc-500 min-w-[80px]">{formatPeriod(p)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedNodes.slice(0, 30).map((nodeId) => (
                    <tr key={nodeId} className="border-b border-zinc-800/40">
                      <td className="px-4 py-2 text-zinc-300 sticky left-0 bg-zinc-900 font-medium truncate max-w-[220px]">
                        {ontology[nodeId] || nodeId}
                      </td>
                      {periods.map((period) => {
                        const cell = pivot[nodeId]?.[period]
                        const score = cell?.capital_weighted_score || 0
                        const companies = cell?.company_count || 0
                        return (
                          <td key={period} className="px-1 py-1">
                            <div
                              title={`${score.toFixed(1)}M capital · ${companies} companies`}
                              className={`h-8 rounded border text-center flex items-center justify-center cursor-default transition-all hover:ring-1 hover:ring-emerald-400 ${getCellClass(score, maxScore)}`}
                            >
                              {companies > 0 && <span className="text-zinc-100/70 font-mono">{companies}</span>}
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </div>
    </div>
  )
}
```

**Step 3: Build frontend to verify no errors**

```bash
cd C:/Users/ferra/OneDrive/Desktop/Projects/deal-radar/frontend && npm run build
```
Expected: `✓ built`

**Step 4: Run all intel tests**

```bash
cd C:/Users/ferra/OneDrive/Desktop/Projects/deal-radar && pytest tests/intel/ -v
```
Expected: all tests pass

**Step 5: Commit**

```bash
git add frontend/src/views/IntelGraph.tsx frontend/src/views/IntelHeatmap.tsx
git commit -m "feat(intel): Primitive Graph (D3 force) + Trend Heatmap — Phase 9 complete"
```

---

## Final step: Deploy

```bash
cd C:/Users/ferra/OneDrive/Desktop/Projects/deal-radar && railway up
```

Add `APIFY_API_TOKEN` environment variable in Railway dashboard (Settings → Variables).

After deploy, seed the ontology via the first queue addition (auto-seeds on first POST to `/api/intel/queue` if table is empty).

---

## Summary of all files created/modified

**Backend (new):**
- `backend/intel/__init__.py`
- `backend/intel/seed.py`
- `backend/intel/crawler.py`
- `backend/intel/extractors.py`
- `backend/intel/normalizer.py`
- `backend/intel/pipeline.py`
- `backend/intel/aggregation.py`
- `backend/routers/intel.py`

**Backend (modified):**
- `backend/models.py` (+9 ORM models)
- `backend/main.py` (register router)
- `backend/scheduler.py` (add aggregation job)
- `requirements.txt` (add apify-client)

**Frontend (new):**
- `frontend/src/views/IntelQueue.tsx`
- `frontend/src/views/IntelDossier.tsx`
- `frontend/src/views/IntelGraph.tsx`
- `frontend/src/views/IntelHeatmap.tsx`

**Frontend (modified):**
- `frontend/src/App.tsx` (4 new routes)
- `frontend/src/components/Sidebar.tsx` (Tech Intel nav item)

**Tests (new):**
- `tests/__init__.py`
- `tests/intel/__init__.py`
- `tests/intel/test_models.py`
- `tests/intel/test_crawler.py`
- `tests/intel/test_extractors.py`
- `tests/intel/test_normalizer.py`
- `tests/intel/test_pipeline.py`
- `tests/intel/test_intel_router.py`
