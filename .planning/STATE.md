# State: Deal Radar

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-04)

**Core value:** Surface every relevant deal from the last 24 hours -- normalized, deduplicated, and queryable in one dashboard.
**Current focus:** Phase 5 -- Polish & Deploy

## Current Position

- Phase 1 (Foundation): COMPLETE (3/3 plans done, commits 248e92f + 9f53212 + bd98b9e)
- Phase 2 (Ingestion Pipeline): COMPLETE (5/5 plans done, last commit ee68219)
- Phase 3 (API Layer): COMPLETE (all routers built: deals, companies, heatmap, trends, kpi, watchlist, ingest)
- Phase 4 (Dashboard Frontend): COMPLETE — all 4 plans done (04-01..04-04, commits 2d9f252 → 75626fb)
- Phase 5 (Polish & Deploy): IN PROGRESS — 05-01 COMPLETE (commits 22f56f9 + 9495cc2)

## Decisions Made

- Stack locked: FastAPI + PostgreSQL + React/Vite + Tremor + Tailwind
- Deployment: Railway (FastAPI serves React static build, single URL)
- AI extraction: Claude Haiku / GPT-4o-mini (cheap, ~$0.10/1000 deals)
- Refresh: Daily at 7am via APScheduler
- No auth needed -- 2 users share URL
- FastAPI catch-all route serves React SPA index.html for client-side routing
- Railway URL normalization (postgres:// -> postgresql+asyncpg://) in both database.py and alembic/env.py
- tsconfig.json uses bundler moduleResolution (Vite 5 requirement)

## Blockers

- [ ] Confirm Crunchbase API subscription (paid) before Phase 2 Plan 02-03
- [ ] Confirm Tavily API key available
- [ ] Confirm Firecrawl API key available
- [ ] Railway account ready + project created (needed for Phase 5)

## What Was Built in Phase 1

- backend/main.py: FastAPI with /api/health + React static serving
- backend/database.py: async SQLAlchemy engine, get_session dependency
- backend/models.py: 5 ORM models (Company, Deal, Investor, Watchlist, IngestionRun)
- backend/schemas.py: Pydantic v2 response schemas (6 schemas)
- requirements.txt: full Python dependency set
- frontend/: React 18 + Vite + Tremor + Tailwind + 5 routes + dark Navbar
- alembic/: async migrations env, script template, versions dir
- Procfile + railway.json + .env.example + .gitignore

## What Was Built in Phase 2

- backend/ingestion/base.py: RawDeal dataclass + BaseFetcher ABC
- backend/ingestion/rss.py: RSSFetcher (6 feeds: TechCrunch, VentureBeat, etc.)
- backend/ingestion/tavily.py: TavilyFetcher (Tavily Search API)
- backend/ingestion/firecrawl.py: FirecrawlFetcher (Firecrawl enrichment)
- backend/ingestion/ai_extractor.py: AIExtractor (Claude Haiku / GPT-4o-mini, ExtractedDeal Pydantic model)
- backend/ingestion/deduplicator.py: Deduplicator (fuzzy name + date + amount, fuzzywuzzy)
- backend/ingestion/db_writer.py: write_deals() — Company upsert + Deal insert, confidence gate
- backend/ingestion/pipeline.py: run_ingestion() — full 8-step pipeline
- backend/scheduler.py: APScheduler daily job at 07:00 UTC
- backend/main.py: lifespan startup hook + POST /api/ingest/run endpoint

## Decisions Made (Phase 2 additions)

- Dedup thresholds: name ratio>=85, date within 5d, amount within 15%
- Confidence gate at 0.3 for DB writes
- Per-deal commit (not batch) for partial failure safety
- Lazy imports in scheduler job to avoid circular imports
- FastAPI lifespan replaces deprecated on_event handlers

## Phase 4 Plans (ready to execute)

| Plan | Description | Wave |
|------|-------------|------|
| 04-01 | Deal Feed: KPI row + FilterBar + Tremor Table + load-more | 1 (parallel with 04-02) |
| 04-02 | Sector Heatmap: custom CSS grid + color scale + period toggle | 1 (parallel with 04-01) |
| 04-03 | Company Profile + Watchlist: deal history + optimistic toggle + inline notes | 2 (after Wave 1) |
| 04-04 | Trend Charts: Tremor LineChart (4 series) + BarChart | 2 (after Wave 1) |

## Phase 4 Progress

| Plan | Status | Key commits |
|------|--------|-------------|
| 04-01 | DONE | 2d9f252 + fc1f768 + 368bb33 |
| 04-02 | DONE | c6e160a |
| 04-03 | DONE | 3a1dc67 |
| 04-04 | DONE | c7ea1d8 |

## What Was Built in Phase 4 Plan 01

- frontend/src/components/LoadingSpinner.tsx — centered amber spinner
- frontend/src/components/ErrorBanner.tsx — full-width red error bar
- frontend/src/components/DealTypeBadge.tsx — Tremor Badge with vc/ma/crypto/ipo color map
- frontend/src/components/FilterBar.tsx — reusable filter row (type, sector, geo, amount, date); exports FilterState + defaultFilters
- frontend/src/views/DealFeed.tsx — full Deal Feed: KPI row + FilterBar + Table + all 4 states + load-more

## What Was Built in Phase 4 Plan 04

- frontend/src/views/Trends.tsx — full Trends view with Tremor LineChart + BarChart
- buildLineData(): pivots WeekPoint[] (long format) into Tremor-ready wide-format objects per week
- buildBarData(): maps SectorBar[] to { sector, Deals } for BarChart
- formatWeekLabel(): formats ISO date as "Mar W1", "Apr W2" etc.
- fmtCapital(): formats USD as $XM / $XB for Y-axis
- Responsive two-column grid (lg:grid-cols-2), stacked on mobile
- Loading, error, and per-chart empty states all handled

## What Was Built in Phase 4 Plan 03

- frontend/src/components/WatchlistToggle.tsx — optimistic star toggle (POST/DELETE /api/watchlist), reverts on error
- frontend/src/components/InlineNoteEditor.tsx — click-to-edit note field, Enter/blur saves via PUT, Escape cancels, 3s inline error
- frontend/src/views/CompanyProfile.tsx — full company profile: header card (badges, geo, website, description show-more), WatchlistToggle, deal history list, known investors, 404 state
- frontend/src/views/Watchlist.tsx — watchlist table: 9 columns (Date/Company/Round/Amount/Sector/Geo/Investors/Notes/Remove), client-side FilterBar, inline remove confirm, empty state

## What Was Built in Phase 5 Plan 01

- backend/ingestion/pipeline.py: Step 7 fixed — per-source rows use deals_added=0; new "pipeline" summary row carries real count
- backend/routers/admin.py: GET /api/admin/runs — newest 50 IngestionRun rows, newest first
- backend/main.py: admin router registered at /api prefix
- frontend/src/views/Admin.tsx: ingestion run history table (StatusBadge, expandable errors, run_at formatting)
- frontend/src/components/Navbar.tsx: Admin link after divider, font-bold throughout (no font-medium)
- frontend/src/App.tsx: /admin route added

## Phase 5 Deploy Status (2026-04-04)

### Railway Deployment
- **URL:** https://deal-radar-app-production.up.railway.app
- **Service:** deal-radar-app (d7fa3e67-ad9a-4788-8df5-df19e061b278)
- **Project:** 1e9483fe-35f5-4c30-908b-fe38e1c6b77a
- **DB:** Railway managed PostgreSQL (auto-provisioned volume)

### API Keys set in Railway
- ANTHROPIC_API_KEY ✓
- TAVILY_API_KEY ✓
- FIRECRAWL_API_KEY ✓
- DATABASE_URL ✓ (auto-injected by Railway Postgres addon)

### Bugs Fixed During Deploy
- `TIMESTAMPTZ` not a valid SQLAlchemy import → `DateTime(timezone=True)`
- Alembic path: `python -m alembic` in startCommand (adds CWD to sys.path)
- Claude Haiku JSON wrapped in markdown fences → strip before json.loads()
- Heatmap AmbiguousParameterError on NULL deal_type → conditional SQL (omit param when None)

### Verified Endpoints (2026-04-04)
- GET /api/health → 200
- GET /api/deals → 200
- GET /api/heatmap → 200 (all filters working)
- GET /api/trends → 200
- GET /api/watchlist → 200
- GET /api/admin/runs → 200

### DB State
- First ingestion run: 70 deals found, 37 added (Claude Haiku primary extractor)
- Rate limiting (429) on large batches is acceptable — non-blocking, daily runs stay well under limit

## Next Action

Phase 5 COMPLETE. App is live. Share URL with cousin:
https://deal-radar-app-production.up.railway.app
