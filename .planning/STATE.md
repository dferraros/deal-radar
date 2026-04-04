# State: Deal Radar

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-04)

**Core value:** Surface every relevant deal from the last 24 hours -- normalized, deduplicated, and queryable in one dashboard.
**Current focus:** Phase 2 -- Ingestion Pipeline

## Current Position

- Phase 1 (Foundation): COMPLETE (3/3 plans done, commits 248e92f + 9f53212 + bd98b9e)
- Phase 2 (Ingestion Pipeline): COMPLETE (5/5 plans done, last commit ee68219)
- Phases 3-5: Pending

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

## Next Action

Start Phase 3 -- API + Dashboard (deals query endpoints + React data tables)
