# Roadmap: Deal Radar

**Created:** 2026-04-04
**Total phases:** 5
**Requirements mapped:** 24 / 24

## Phase Overview

| # | Phase | Goal | Requirements | Status |
|---|-------|------|--------------|--------|
| 1 | Foundation | Working skeleton deployed on Railway | DEPLOY-01, DEPLOY-02 | done |
| 2 | Ingestion Pipeline | Daily deal ingestion from all sources | INGEST-01 to INGEST-07 | pending |
| 3 | API Layer | All FastAPI endpoints serving deal data | MANUAL-01, MANUAL-02 | pending |
| 4 | Dashboard Frontend | Full React UI with all 5 views | FEED-01 to FEED-03, HEAT-01, HEAT-02, COMP-01 to COMP-03, TREND-01, TREND-02, WATCH-01, WATCH-02 | planned |
| 5 | Polish & Deploy | Production-ready, DEPLOY-03 live | DEPLOY-03 | pending |

---

## Phase 1: Foundation

**Goal:** FastAPI + React scaffold running on Railway with PostgreSQL connected.

**Plans:**
- Plan 01-01: Create FastAPI skeleton (main.py, database.py, models.py, schemas.py) with /api/health endpoint -- DONE (248e92f)
- Plan 01-02: Create React + Vite scaffold with Tremor + Tailwind, wired to FastAPI static serving -- DONE (9f53212)
- Plan 01-03: Alembic migrations for all DB tables, Railway Procfile + env var config -- DONE (bd98b9e)

**Success criteria:**
1. GET /api/health returns 200 on Railway URL
2. React app loads at the root URL served by FastAPI
3. All DB tables created (companies, deals, investors, watchlist, ingestion_runs)
4. Environment variables (DATABASE_URL, API keys) load from Railway config

**Wave:** Sequential (01-01 -> 01-02 -> 01-03)

---

## Phase 2: Ingestion Pipeline

**Goal:** Daily job runs all fetchers, extracts deals, deduplicates, and persists to DB.

**Plans:**
- Plan 02-01: RawDeal dataclass + base fetcher interface + RSSFetcher (4 feeds)
- Plan 02-02: TavilyFetcher + FirecrawlFetcher (scrape article pages from URLs)
- Plan 02-03: CrunchbaseFetcher (v4 funding rounds API, sector + geo filters)
- Plan 02-04: AI extraction layer (Claude Haiku prompt, structured output, field normalization)
- Plan 02-05: Deduplicator (fuzzy match on company + date + amount) + APScheduler wiring

**Success criteria:**
1. Manual trigger of pipeline ingests 10+ deals to DB
2. Each deal has: company_name, amount_usd, deal_type, announced_date, sector, geo, source_url, ai_summary
3. Running pipeline twice on same day produces 0 new duplicates
4. ingestion_runs table shows source breakdown with deals_found / deals_added counts

**Wave:** 02-01 and 02-02 and 02-03 in parallel, then 02-04, then 02-05

---

## Phase 3: API Layer

**Goal:** All FastAPI endpoints operational and returning correct data shapes.

**Plans:**
- Plan 03-01: GET /api/deals (filters: date, type, sector, geo, amount_min) + GET /api/companies/:id
- Plan 03-02: GET /api/heatmap + GET /api/trends
- Plan 03-03: GET+POST+DELETE /api/watchlist + POST /api/ingest/manual

**Success criteria:**
1. GET /api/deals?sector=crypto&geo=latam returns filtered results
2. GET /api/heatmap returns sector x geo matrix with capital_usd values
3. POST /api/ingest/manual with TechCrunch URL returns extracted deal preview
4. Watchlist endpoints persist across requests

**Wave:** 03-01 and 03-02 in parallel, then 03-03

---

## Phase 4: Dashboard Frontend

**Goal:** All 5 React views render correctly with real data from the API.

**Plans:** 4 plans

- [ ] 04-01-PLAN.md — Deal Feed view: KPI row + FilterBar + Tremor Table + load-more
- [ ] 04-02-PLAN.md — Sector Heatmap: custom CSS grid + color scale + period toggle
- [ ] 04-03-PLAN.md — Company Profile + Watchlist: deal history + WatchlistToggle + InlineNoteEditor
- [ ] 04-04-PLAN.md — Trend Charts: Tremor LineChart (4 deal types) + BarChart (top sectors)

**Success criteria:**
1. Deal Feed loads, filters work, clicking row navigates to company profile
2. Heatmap grid renders with correct color scale for sector x geo capital
3. Watchlist persists pinned companies and shows their deals
4. Trend charts show multi-week data with correct deal type breakdown

**Wave:** Wave 1: 04-01 + 04-02 in parallel | Wave 2: 04-03 + 04-04 in parallel

---

## Phase 5: Polish & Deploy

**Goal:** Production-ready, APScheduler live on Railway, cousin has the URL.

**Plans:** 2 plans

- [ ] 05-01-PLAN.md — Error isolation + /admin ingestion log (backend router + Admin.tsx view)
- [ ] 05-02-PLAN.md — Alembic initial migration + railway.json releaseCommand + README deploy guide

**Success criteria:**
1. Pipeline runs with one source erroring -- other sources still complete successfully
2. /admin shows ingestion run history with per-source breakdown
3. Railway deploy live, cousin can open dashboard from their browser
4. APScheduler confirmed running at 7am UTC

**Wave:** Sequential (05-01 -> 05-02)

---
*Roadmap created: 2026-04-04*
*Last updated: 2026-04-04 after phase 5 planning*
