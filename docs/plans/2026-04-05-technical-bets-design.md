# Technical Bets — Design Document

**Date:** 2026-04-05
**Branch:** feat/technical-bets
**Status:** Approved

---

## Problem

The current Intel dossier shows raw technology primitive chips (Python, PyTorch, Kubernetes)
grouped by layer. These answer "what tools do they use?" — not "what thesis are they executing?"

An engineer doing competitive intelligence needs the interpretation, not just the inventory.
The primitives are evidence. The technical bets are the insight.

---

## Goal

Make Technical Bets the headline of the Intel dossier. Keep primitives as supporting evidence
("show your work"). Generate bets using Sonnet via a first-principles engineering prompt —
not tool extraction but thesis extraction.

---

## Design

### Pipeline — new Stage 4.5

```
Stage 4:   Extract primitives  (Haiku)   ← unchanged
Stage 4.5: Extract technical bets (Sonnet) ← NEW
Stage 5:   Normalize ontology           ← unchanged
Stage 6:   Store observations + bets    ← extended
```

`IntelExtractor.extract_bets(profile, primitives, context_text)` calls
`claude-sonnet-4-6` and returns 3–5 `TechnicalBet` Pydantic objects.

### Prompt frame

**System:**
```
You are a senior software engineer doing competitive technical intelligence.
Analyze companies from first principles to understand what technical theses
they are executing — not what tools they use, but what bets they are making
about how software and systems should be built.
Return valid JSON only.
```

**User template:**
```
Company: {company_name}
Job to be done: {jtbd}
Summary: {summary}
Primitives detected (by layer):
{primitives_text}

Context from crawled sources:
{context_text}

Identify 3-5 technical bets this company is making.
A "technical bet" is an architectural thesis — the reasoning behind a system design decision.

For each bet return:
- thesis: one crisp sentence stating the bet
- implication: 2-3 sentences on what this means architecturally and competitively
- signals: 2-4 specific pieces of evidence from primitives or context
- confidence: 0.0–1.0

Return JSON: {"bets": [{"thesis": "...", "implication": "...", "signals": ["..."], "confidence": 0.85}]}
```

### Data model — new table

```python
class IntelTechnicalBet(Base):
    __tablename__ = "intel_technical_bets"

    id            = Column(UUID, primary_key=True, default=uuid4)
    queue_id      = Column(UUID, ForeignKey("intel_queue.id", ondelete="CASCADE"), nullable=False, index=True)
    bet_index     = Column(Integer, nullable=False)   # ordering 0–4
    thesis        = Column(Text, nullable=False)
    implication   = Column(Text, nullable=True)
    signals       = Column(ARRAY(Text), nullable=True, server_default="{}")
    confidence    = Column(Float, nullable=True)
    model_version = Column(String(100), nullable=True)
    created_at    = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
```

New Alembic migration: `0008_add_intel_technical_bets.py`

### API — dossier endpoint extension

`GET /api/intel/companies/{id}/dossier` adds:

```python
class TechnicalBet(BaseModel):
    bet_index:   int
    thesis:      str
    implication: Optional[str]
    signals:     list[str]
    confidence:  float

class Dossier(BaseModel):
    ...existing fields...
    technical_bets: list[TechnicalBet]  # ← new, ordered by bet_index
```

Bets are loaded from DB in the same dossier query — no extra round-trip.

### Frontend — IntelDossier.tsx layout

New section order:

```
Company header          (unchanged)
JTBD card               (unchanged)
────────────────────────────────────
TECHNICAL BETS          ← new headline section
  [Bet card × 3–5]
────────────────────────────────────
Signal quality panel    (demoted, smaller)
Target users
Evidence Stack          (primitives, labelled "Supporting Evidence")
```

**Bet card anatomy:**
- Amber left border (`border-l-4 border-amber-400`)
- Confidence badge (emerald/amber/zinc per threshold)
- Thesis: `text-slate-900 font-semibold text-sm`
- Expand arrow → reveals implication paragraph + signal chips
- Signal chips: `bg-slate-100 text-slate-600 border-slate-200 text-xs font-mono`
- Default state: thesis + confidence visible; implication collapsed

---

## Cost model

| Pass | Model | Cost/company | Notes |
|---|---|---|---|
| Primitive extraction | Haiku | ~$0.001 | unchanged |
| Technical bets | Sonnet | ~$0.015 | 3-5 bets, ~800 token output |
| **Total** | | **~$0.016** | manually triggered, acceptable |

Bets are stored permanently in DB — re-runs only on explicit retry.

---

## Files

| File | Change |
|---|---|
| `backend/models.py` | Add `IntelTechnicalBet` model |
| `backend/migrations/versions/0008_add_intel_technical_bets.py` | New migration |
| `backend/intel/extractors.py` | Add `extract_bets()` method + `TechnicalBet` dataclass |
| `backend/intel/pipeline.py` | Add Stage 4.5 — call extract_bets, store results |
| `backend/routers/intel.py` | Add `TechnicalBet` schema, include in dossier response |
| `frontend/src/views/IntelDossier.tsx` | Technical Bets section, reorder layout |
