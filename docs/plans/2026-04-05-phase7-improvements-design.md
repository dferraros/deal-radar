# Deal Radar — Phase 7 Improvements Design

**Date:** 2026-04-05
**Author:** Daniel Ferraro
**Status:** Approved

---

## Overview

Five improvements in priority order: data quality, search, volume, intelligence, and investor network visualization.

---

## 1. Fix Sector / Deal Type Tagging

**Problem:** Most deals surface with `deal_type = "unknown"` and `sector = ["other"]`. The LLM prompt lacks explicit enums, examples, and inference rules.

**Changes:**
- Rewrite `ai_extractor.py` `_SYSTEM_PROMPT` and `_USER_TEMPLATE`:
  - Require `deal_type` from explicit enum `["vc", "ma", "crypto", "ipo", "unknown"]` with keyword hints (e.g. "Series A/B/C/Seed → vc", "acquired/merger → ma", "token/IDO/blockchain → crypto", "IPO/listed → ipo")
  - Require `sector` from enum with inference rules (e.g. "lending/payments/neobank → fintech", "blockchain/token/web3 → crypto", "AI/ML/model → saas", "hospital/biotech/pharma → healthtech")
  - Add post-extraction pass in `db_writer.py`: if `deal_type == "unknown"` and `round_label` contains "Series" → set `deal_type = "vc"`
- Filter `amount_usd == 0` → treat as null before DB write (in `db_writer.py`)

**Files:** `backend/ingestion/ai_extractor.py`, `backend/ingestion/db_writer.py`

---

## 2. Search Bar in Deal Feed

**Problem:** No way to find a specific company by name.

**Changes:**
- Backend: add `q: Optional[str]` param to `GET /api/deals`. When present, adds `ILIKE '%q%'` filter on `companies.name`.
- Frontend: text input above filter row in `DealFeed.tsx`, debounced 300ms, clears to page 1 on change.

**Files:** `backend/routers/deals.py`, `frontend/src/views/DealFeed.tsx`

---

## 3. Connect Crunchbase Fetcher

**Problem:** `backend/ingestion/crunchbase.py` exists but is stubbed and returns `[]`.

**Changes:**
- Wire to Crunchbase v4 `/searches/funding_rounds` API using `CRUNCHBASE_API_KEY` env var
- Query: `announced_on` last 7 days, all geo, paginate up to 100 results
- Normalize to `RawDeal`: map `funded_organization_identifier.value` → `company_name`, `money_raised.value_usd` → `amount_raw`, `announced_on` → `date_raw`, `investment_type` → maps to round_label
- Add `CRUNCHBASE_API_KEY` to Railway environment variables docs

**Files:** `backend/ingestion/crunchbase.py`

---

## 4. Weekly AI Briefing Narrative

**Problem:** `/api/briefing/latest` returns structured data but no human-readable summary.

**Changes:**
- Add `generate_summary(deals, structured_data) → str` in `backend/routers/briefing.py` using Claude Haiku
- Prompt: top 5 deals of the week → 3-sentence narrative (biggest raise, notable sector trend, one standout deal)
- Cache strategy: store `ai_summary` + `generated_at` in a new `briefing_summaries` table (single row, upserted weekly). Re-generate if `generated_at` is >1hr old.
- New migration `0004_add_briefing_summaries.py`

**Files:** `backend/routers/briefing.py`, `backend/models.py`, `alembic/versions/0004_add_briefing_summaries.py`

---

## 5. Investor Co-Investment Network

**Problem:** No visibility into which investors co-invest together.

**Changes:**
- New endpoint `GET /api/investors/network` — queries deals with 2+ investors in `all_investors[]`, builds investor pairs, returns `{nodes: [{id, deal_count}], edges: [{source, target, weight}]}`
- New frontend view `/network` — force-directed graph using `d3-force` with zoom/pan, node size = deal count, edge thickness = co-investment count
- Add "Network" nav item to Sidebar

**Files:** `backend/routers/investors_leaderboard.py` (add endpoint), `frontend/src/views/InvestorNetwork.tsx` (new), `frontend/src/components/Sidebar.tsx`, `frontend/src/App.tsx`

---

## Execution Order

| # | Feature | Impact | Effort |
|---|---------|--------|--------|
| 1 | Sector/deal_type tagging | High | Low |
| 2 | Search bar | High | Low |
| 3 | Crunchbase fetcher | High | Medium |
| 4 | Briefing narrative | Medium | Low |
| 5 | Investor network graph | Medium | Medium |

All changes are additive — no breaking schema changes except migration 0004.
