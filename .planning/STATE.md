# State: Deal Radar

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-04)

**Core value:** Surface every relevant deal from the last 24 hours -- normalized, deduplicated, and queryable in one dashboard.
**Current focus:** Phase 4 -- Dashboard Frontend

## Current Position

- Phase 1 (Foundation): COMPLETE (3/3 plans done, commits 248e92f + 9f53212 + bd98b9e)
- Phase 2 (Ingestion Pipeline): COMPLETE (5/5 plans done, last commit ee68219)
- Phase 3 (API Layer): COMPLETE (all routers built: deals, companies, heatmap, trends, kpi, watchlist, ingest)
- Phase 4 (Dashboard Frontend): IN PROGRESS — 04-01 DONE (commits 2d9f252, fc1f768, 368bb33); 04-02 DONE (commit c6e160a); 04-03 pending; 04-04 DONE (commit c7ea1d8)
- Phase 5 (Polish & Deploy): Pending

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

## Next Action

Phase 4 COMPLETE (all 4 plans done). Execute Phase 5 (Polish & Deploy).
