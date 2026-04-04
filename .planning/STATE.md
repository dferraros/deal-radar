# State: Deal Radar

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-04)

**Core value:** Surface every relevant deal from the last 24 hours -- normalized, deduplicated, and queryable in one dashboard.
**Current focus:** Phase 1 -- Foundation

## Current Position

- Phase 1 (Foundation): READY TO START
- Phases 2-5: Pending

## Decisions Made

- Stack locked: FastAPI + PostgreSQL + React/Vite + Tremor + Tailwind
- Deployment: Railway (FastAPI serves React static build, single URL)
- AI extraction: Claude Haiku / GPT-4o-mini (cheap, ~$0.10/1000 deals)
- Refresh: Daily at 7am via APScheduler
- No auth needed -- 2 users share URL

## Blockers

- [ ] Confirm Crunchbase API subscription (paid) before Phase 2
- [ ] Confirm Tavily API key available
- [ ] Confirm Firecrawl API key available
- [ ] Railway account ready + project created

## Next Action

Start Phase 1 -- Plan 01-01: FastAPI skeleton
Command: /gsd:plan-phase 1
