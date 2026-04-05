# Deal Radar — Tech Bet Intelligence Engine

**Date:** 2026-04-05
**Author:** Daniel Ferraro
**Status:** Approved

---

## Goal

Build a system that infers the latent technological bet distribution of the economy from observable signals — funded companies, their products, and the technical primitives underlying those products.

**Core JTBD (precise):**
> "Infer which technologies are being seriously bet on (capital-weighted), and how they are actually implemented in products."

This is NOT startup tracking. It is reconstructing the hidden R&D allocation function of the economy from funding + product artifacts.

**Key differentiator:** No existing product combines funding data + web evidence + inferred technical primitives in one inference layer. The market is fragmented: strong funding data tools, strong market map tools, strong website tech detectors — none unified with capital weighting and evidence-linked confidence.

---

## Design Philosophy

- **Evidence-first:** Never store a primitive without a source snippet that supports it
- **Confidence-explicit:** Every observation carries a float; users always know how certain the inference is
- **Capital-weighted:** Trends ranked by total funding behind them, not raw company count
- **Inference over classification:** Infer what companies actually build, not what industry label they claim
- **Ontology-anchored:** Normalize synonyms before aggregation — same primitive = same node

---

## Architecture

```
Existing deal feed
  ↓  (user clicks "Add to Tech Intel")
intel_queue table
  ↓  (FastAPI BackgroundTask)
Apify Website Content Crawler
  → homepage, product, docs, blog, careers (max 15 pages)
  ↓
intel_sources + intel_source_chunks
  ↓
Claude Haiku — Profile extractor
  → JTBD, summary, inputs/outputs, target user, confidence
  ↓
intel_company_profiles
  ↓
Claude Haiku — Primitive decomposer
  → domain, system_classes, primitives [{name, layer, confidence, explicit, evidence[]}]
  ↓
Claude Haiku — Ontology normalizer
  → maps raw terms → canonical intel_ontology_nodes (creates pending_review for unknowns)
  ↓
intel_observations + intel_observation_evidence
  ↓
APScheduler daily aggregation (6am)
  → intel_technology_scores (capital-weighted, growth rate, co-occurrence)
  ↓
4 frontend views: Queue / Dossier / Primitive Graph / Trend Heatmap
```

**Reused from existing stack:** FastAPI BackgroundTasks, PostgreSQL + SQLAlchemy async, Claude Haiku, companies + deals tables (funding data already present)

**New:** Apify integration, 9 new DB tables, `backend/routers/intel.py`, 4 new React views

---

## Data Model

### intel_queue
```sql
id UUID PK
company_id UUID FK NULL  -- links to existing companies table if available
company_name TEXT
website TEXT
status TEXT  -- queued | crawling | extracting | done | failed
queued_at TIMESTAMP
started_at TIMESTAMP
completed_at TIMESTAMP
error_log TEXT
```

### intel_sources
```sql
id UUID PK
company_id UUID FK NULL
queue_id UUID FK
url TEXT
source_type TEXT  -- homepage | product | docs | blog | careers | github
raw_text TEXT
clean_text TEXT
content_hash TEXT
fetched_at TIMESTAMP
http_status INT
```

### intel_source_chunks
```sql
id UUID PK
source_id UUID FK
chunk_index INT
clean_text TEXT
token_count INT
```

### intel_company_profiles
```sql
id UUID PK
company_id UUID FK NULL
queue_id UUID FK
summary TEXT
target_user TEXT[]
workflow TEXT[]
inputs TEXT[]
outputs TEXT[]
claimed_differentiators TEXT[]
jtbd TEXT
profile_confidence FLOAT
generated_at TIMESTAMP
model_version TEXT
```

### intel_ontology_nodes
```sql
id UUID PK
canonical_name TEXT UNIQUE
node_type TEXT  -- domain | system_class | primitive | layer
parent_id UUID NULL FK self
description TEXT
status TEXT  -- active | pending_review
created_at TIMESTAMP
```

### intel_ontology_aliases
```sql
id UUID PK
node_id UUID FK
alias TEXT
alias_type TEXT  -- extracted | manual
```

### intel_observations
```sql
id UUID PK
company_id UUID FK NULL
queue_id UUID FK
node_id UUID FK
layer TEXT  -- model | application_logic | infra | interface | hardware
confidence FLOAT
is_explicit BOOLEAN
inference_method TEXT
generated_at TIMESTAMP
model_version TEXT
```

### intel_observation_evidence
```sql
id UUID PK
observation_id UUID FK
source_id UUID FK
chunk_id UUID FK NULL
evidence_text TEXT
evidence_reason TEXT
evidence_type TEXT  -- product_page | docs | careers | blog | github
```

### intel_technology_scores
```sql
id UUID PK
node_id UUID FK
period_start DATE
period_end DATE
company_count INT
capital_weighted_score FLOAT
growth_rate FLOAT
novelty_score FLOAT
co_occurrence_density FLOAT
```

---

## Pipeline Detail

### Stage 1 — Crawl (Apify)
- Actor: `apify/website-content-crawler`
- Targets: homepage, /product, /solutions, /docs, /blog, /careers, /about, /technology
- Max 15 pages per company
- Returns cleaned markdown
- Stored in `intel_sources`, chunked into `intel_source_chunks` (500 tokens, 50 overlap)

### Stage 2 — Profile Extraction (Claude Haiku)
- Input: concatenated clean_text (max 8k tokens, priority: product > docs > homepage > blog)
- Output: `summary`, `target_user[]`, `workflow[]`, `inputs[]`, `outputs[]`, `jtbd`, `profile_confidence`
- Single LLM call, strict JSON output
- Stored in `intel_company_profiles`

### Stage 3 — Primitive Decomposition (Claude Haiku)
- Input: profile JSON + source chunks (max 6k tokens)
- Output: `domain[]`, `system_classes[]`, `primitives[{name, layer, confidence, explicit, evidence[]}]`
- Single LLM call, strict JSON output
- Raw primitives held in memory for normalization

### Stage 4 — Ontology Normalization (Claude Haiku)
- Input: raw primitive names + current canonical ontology (names + aliases)
- Output: each primitive → `{canonical_node_id, match_type, confidence, create_new}`
- New terms with `create_new=true` → inserted as `status=pending_review`
- Final `intel_observations` + `intel_observation_evidence` stored

### Daily Aggregation (APScheduler 6am)
- Recomputes `intel_technology_scores` per node per quarter
- Capital weighting: joins `intel_observations` → `intel_queue` → `companies` → `deals`
- Co-occurrence matrix from observation pairs sharing same `queue_id`
- Growth rate: current quarter vs prior quarter capital score

---

## API Specification

```
Queue:
  POST   /api/intel/queue              { company_id?, website, company_name }
  GET    /api/intel/queue              → list with status, progress
  DELETE /api/intel/queue/{id}
  POST   /api/intel/queue/{id}/retry

Company intelligence:
  GET    /api/intel/companies/{id}/dossier   → profile + stack + evidence
  GET    /api/intel/companies/{id}/stack     → layers + primitives only

Aggregation:
  GET    /api/intel/technologies/graph       → {nodes, edges} for D3
  GET    /api/intel/technologies/trends      → heatmap data (primitive × quarter)
  GET    /api/intel/technologies/jtbd-map    → JTBD clusters × primitive clusters

Ontology:
  GET    /api/intel/ontology/nodes
  POST   /api/intel/ontology/nodes/{id}/approve
  PUT    /api/intel/ontology/nodes/{id}      → edit / merge
```

---

## UI Views

### View 1 — Queue (`/intel`)
Table: company, website, status badge, queued time, retry button.
"Add to Intel" button → modal (pick from deal feed OR paste URL manually).
Processing status updates via polling (same pattern as admin runs page).

### View 2 — Company Dossier (`/intel/company/:id`)
- Header: name, total funding, last round
- JTBD card (amber left border, large text, confidence badge)
- Stack layers: Interface → App Logic → Models → Infra → Hardware
  - Each row: primitive pills with confidence % color-coded (emerald ≥ 0.75, amber 0.5–0.75, zinc < 0.5)
- Evidence drawer: click any primitive pill → slides open with source snippets + URLs
- Peer cluster: companies sharing ≥ 3 primitives (links to their dossiers)

### View 3 — Primitive Graph (`/intel/graph`)
D3 force-directed graph.
- Nodes = primitives, size = capital-weighted score, color = domain
- Edges = co-occurrence (two primitives appear together in same company)
- Edge weight = co-occurrence frequency × average capital
- Hover node → top 5 companies, total capital, top co-occurring primitives
- Filters: date range, domain, min capital

### View 4 — Trend Heatmap (`/intel/trends`)
- Rows = top 30 primitives by capital score
- Columns = quarters (last 8 quarters)
- Cell = capital-weighted score, emerald saturation ramp
- Click cell → modal: companies using that primitive in that quarter
- Toggle: raw count vs capital-weighted

---

## Seed Ontology (30 primitives, shipped in Alembic migration)

| Canonical Name | Domain | Parent |
|---|---|---|
| Transformer architectures | AI | Foundation models |
| Diffusion models | AI | Foundation models |
| RLHF / preference optimization | AI | Foundation models |
| Retrieval augmented generation | AI | Retrieval systems |
| Vector databases | AI | Retrieval systems |
| Tool calling / function calling | AI | Agent orchestration |
| Agent orchestration | AI | Foundation models |
| Long-context reasoning | AI | Foundation models |
| Multimodal encoders | AI | Computer vision |
| Vision-language models | AI | Computer vision |
| Computer vision (CNN-based) | AI | Computer vision |
| Foundation model fine-tuning | AI | Foundation models |
| SLAM | Robotics | Autonomous navigation |
| Sensor fusion | Robotics | Perception |
| Motion planning | Robotics | Autonomous navigation |
| Robotic manipulation | Robotics | Control systems |
| Reinforcement learning policies | Robotics | Control systems |
| Imitation learning | Robotics | Control systems |
| Sim-to-real transfer | Robotics | Simulation |
| Edge inference | Infra | Deployment |
| GPU inference optimization | Infra | Deployment |
| Synthetic data generation | Data | Training pipelines |
| Data labeling pipelines | Data | Training pipelines |
| Model evaluation frameworks | Data | Training pipelines |
| Experiment automation | Data | Training pipelines |
| High-throughput biological screening | Biotech | Lab automation |
| Protein structure prediction | Biotech | Computational biology |
| Fleet routing | Logistics | Operations |
| Real-time operating systems | Infra | Hardware integration |
| Autonomy stack | Robotics | Autonomous navigation |

---

## LLM Prompt Templates

### A — Profile Extractor
```
SYSTEM: You are a product analyst. Extract only what the company likely does in practice.
Return strict JSON only. Do not copy marketing language verbatim.

USER: Given the text below, identify:
1. company_summary (1–2 sentences, practical)
2. target_user (array of user types)
3. operational_workflow (array of steps)
4. system_inputs (array)
5. system_outputs (array)
6. claimed_differentiators (array)
7. core_job_to_be_done (one sentence: "When X needs to Y, they use this to Z under constraint W.")
8. confidence_0_to_1

TEXT: {{source_text}}
```

### B — Primitive Decomposer
```
SYSTEM: You are a technical due diligence analyst.
Infer technical primitives from product evidence. Return strict JSON only.
Separate explicit claims from inferred claims. Use low confidence when evidence is thin.

USER: Given the company profile and evidence text, identify:
1. domain (array, max 3)
2. system_classes (array, max 5)
3. primitives: [{name, layer, explicit_vs_inferred, confidence_0_to_1, evidence_snippets[]}]

Do NOT state proprietary certainty. Prefer primitives at engineering decision level.

COMPANY_PROFILE: {{profile_json}}
EVIDENCE_TEXT: {{source_chunks}}
```

### C — Ontology Normalizer
```
SYSTEM: You map extracted terms to a canonical ontology. Return strict JSON only.

USER: For each extracted term, return:
{alias, canonical_name, ontology_node_id (if found), match_type (exact|fuzzy|new), confidence, create_new}

ONTOLOGY: {{ontology_terms_and_aliases}}
EXTRACTED_TERMS: {{terms}}
```

---

## Scoring Logic

```
capital_weighted_score(primitive, period) =
  SUM(company_round_amount_usd * observation_confidence)
  for all observations in period

growth_rate =
  (score_current_quarter - score_prior_quarter) / score_prior_quarter

novelty_score =
  1 / log(1 + months_since_first_observation)

co_occurrence_weight(A, B) =
  SUM(capital_weighted_score of companies where both A and B observed)
```

---

## MVP Scope

**In:**
- Queue management (add from deal feed + manual URL)
- Apify crawl (15 pages per company)
- Profile extraction + primitive decomposition
- Ontology normalization with seed 30 primitives
- Evidence storage per observation
- Views: Queue, Dossier, Primitive Graph, Trend Heatmap

**Out of MVP:**
- GitHub repo analysis
- Job posting scraping
- Auto-analysis on every ingested deal
- JTBD cross-company clustering
- Export / report generation

---

## Build Order

| Phase | Scope | Why first |
|---|---|---|
| 1 | DB migrations + seed ontology | Everything depends on schema |
| 2 | Apify integration + crawl pipeline | Data before analysis |
| 3 | Profile + primitive extractors | Core inference value |
| 4 | Ontology normalizer + evidence storage | Makes results trustworthy |
| 5 | Aggregation job (scores + co-occurrence) | Powers visualizations |
| 6 | API router (all endpoints) | Frontend needs this |
| 7 | Queue view + Dossier view | User entry point |
| 8 | Primitive Graph + Trend Heatmap | The "map" payoff |

---

## Non-Negotiables

- Never store a primitive without evidence
- Never present inferred stack as certain fact
- Confidence always visible in UI
- Normalize synonyms before aggregation
- Weight trends by capital, not company count alone
