# State: Deal Radar

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-04)

**Core value:** Surface every relevant deal from the last 24 hours -- normalized, deduplicated, and queryable in one dashboard.
**Current focus:** Phase 2 -- Ingestion Pipeline

## Current Position

- Phase 1 (Foundation): COMPLETE (3/3 plans done, commits 248e92f + 9f53212 + bd98b9e)
- Phase 2 (Ingestion Pipeline): READY TO START
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

## Next Action

Start Phase 2 -- Plan 02-01: RawDeal dataclass + base fetcher interface + RSSFetcher
Note: Plans 02-01, 02-02, 02-03 can run in parallel (independent fetchers)
