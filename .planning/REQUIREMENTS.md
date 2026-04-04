# Requirements: Deal Radar

**Defined:** 2026-04-04
**Core Value:** Surface every relevant deal that closed in the last 24 hours -- normalized, deduplicated, and queryable in one dashboard.

## v1 Requirements

### Ingestion Pipeline

- [ ] **INGEST-01**: System fetches funding rounds daily from Crunchbase API (VC, M&A, IPO deal types)
- [ ] **INGEST-02**: System searches for deal announcements daily via Tavily API
- [ ] **INGEST-03**: System scrapes deal articles via Firecrawl from TechCrunch, CoinDesk, Expansion, Contxto
- [ ] **INGEST-04**: System parses RSS feeds from deal-focused publications
- [ ] **INGEST-05**: AI extraction layer (Claude Haiku) normalizes all RawDeal records into structured fields
- [ ] **INGEST-06**: Deduplication merges deal records from multiple sources covering the same announcement
- [ ] **INGEST-07**: Ingestion runs are logged (source, status, deals_found, deals_added, errors)

### Manual Ingest

- [ ] **MANUAL-01**: User can paste a URL; system fetches + AI-extracts the deal and returns a preview
- [ ] **MANUAL-02**: User can confirm or discard the extracted deal before it enters the database

### Deal Feed

- [ ] **FEED-01**: User can view a chronological list of deals with columns: date, company, round, amount, sector, geo, investors
- [ ] **FEED-02**: User can filter deals by date range, deal type, sector, geo, and minimum amount
- [ ] **FEED-03**: User can click a deal row to navigate to the company profile

### Sector Heatmap

- [ ] **HEAT-01**: User can view a grid of sector x geo cells showing total capital raised per period
- [ ] **HEAT-02**: User can toggle the heatmap period between weekly, monthly, and quarterly

### Company Profile

- [ ] **COMP-01**: User can view a company's name, sector, geo, description, and website
- [ ] **COMP-02**: User can view a timeline of all deals for a company
- [ ] **COMP-03**: User can add or remove a company from their watchlist from the profile page

### Trend Charts

- [ ] **TREND-01**: User can view a line chart of capital raised per week broken down by deal type
- [ ] **TREND-02**: User can view a bar chart of top sectors by deal count

### Watchlist

- [ ] **WATCH-01**: User can view a deal feed filtered to their watchlisted companies
- [ ] **WATCH-02**: User can add notes to a watchlisted company

### Deployment

- [ ] **DEPLOY-01**: App is deployed on Railway and accessible via public URL
- [ ] **DEPLOY-02**: PostgreSQL database is provisioned as a Railway addon
- [ ] **DEPLOY-03**: Ingestion pipeline runs automatically daily at 7am via APScheduler

## v2 Requirements

### Notifications

- **NOTIF-01**: Weekly AI-generated briefing email summarizing top deals of the week
- **NOTIF-02**: In-app banner showing weekly summary on Monday

### Admin

- **ADMIN-01**: /admin route shows ingestion run history (deals found, errors per source)
- **ADMIN-02**: User can trigger a manual pipeline run from the UI

## Out of Scope

| Feature | Reason |
|---------|--------|
| User authentication | 2 users, shared URL, no auth needed |
| Mobile native app | Web-first; browser on mobile is acceptable |
| Real-time streaming | Daily refresh sufficient for the use case |
| Multi-tenancy / SaaS | Personal tool, not a product |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INGEST-01 to INGEST-07 | Phase 2 | Pending |
| MANUAL-01, MANUAL-02 | Phase 3 | Pending |
| FEED-01 to FEED-03 | Phase 4 | Pending |
| HEAT-01, HEAT-02 | Phase 4 | Pending |
| COMP-01 to COMP-03 | Phase 4 | Pending |
| TREND-01, TREND-02 | Phase 4 | Pending |
| WATCH-01, WATCH-02 | Phase 4 | Pending |
| DEPLOY-01 to DEPLOY-03 | Phase 1 + Phase 5 | Pending |

**Coverage:**
- v1 requirements: 24 total
- Mapped to phases: 24
- Unmapped: 0

---
*Requirements defined: 2026-04-04*
