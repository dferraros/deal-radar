# Deal Radar

## What This Is

Deal Radar is a live deals tracking dashboard and intelligence engine that aggregates VC funding rounds, M&A activity, Crypto/Web3 raises, and IPOs across Crypto/Fintech, LatAm, Spain/Europe, and global top deals. Built for Daniel Ferraro and his cousin as a shared competitive intelligence + opportunity spotting tool.

## Core Value

Surface every relevant deal that closed in the last 24 hours — from any source — normalized, deduplicated, and queryable in one dashboard before the morning coffee.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Daily ingestion pipeline aggregates deals from Crunchbase, Tavily, Firecrawl, RSS feeds, and manual paste
- [ ] AI extraction layer normalizes all sources into structured deal records
- [ ] Live dashboard with deal feed, sector heatmap, company profiles, trend charts, and watchlist
- [ ] Deployed on Railway, accessible by both users via shared URL
- [ ] Company watchlist — pin companies from dashboard, view their deal history
- [ ] Manual ingest — paste a URL or text, AI extracts the deal, user confirms

### Out of Scope

- User authentication / login — 2 users, shared URL, no auth needed
- Mobile app — web-first
- Real-time streaming — daily refresh is sufficient
- Multi-tenant / SaaS — personal tool, not a product

## Context

- Existing tools (LC-OS dashboard, A/B Machine) use FastAPI + vanilla JS. This project upgrades to React for a richer interactive experience.
- Windows Desktop path: use python3 write workaround for file writes to Desktop paths.
- Daniel may already have API keys for Tavily and Firecrawl from other projects.
- Crunchbase API requires a paid subscription — confirm availability before Phase 2.

## Constraints

- **Budget**: Hosting ~$5-10/mo on Railway (FastAPI + PostgreSQL addon)
- **Tech stack**: FastAPI + PostgreSQL + React/Vite + Tremor + Tailwind — locked
- **Refresh cadence**: Daily (7am cron) — no real-time requirement
- **Users**: 2 (Daniel + cousin) — no auth, no role system

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| FastAPI serves React build as static files | One URL, no CORS, single Railway deployment | — Pending |
| Tremor + Tailwind for frontend | Pre-built financial dashboard components, fastest to ship heatmaps/charts | — Pending |
| Claude Haiku / GPT-4o-mini for extraction | Cheap extraction (~$0.10 per 1000 deals), expensive model reserved for weekly summary | — Pending |
| Store raw_text alongside structured fields | Enables re-extraction without re-scraping if prompt improves | — Pending |
| Fuzzy dedup on company_name + date + amount | Prevent duplicate deals from multiple sources covering same announcement | — Pending |

---
*Last updated: 2026-04-04 after initialization*
