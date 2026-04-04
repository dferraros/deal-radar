# Phase 6 Plan: Enrichment, Investor Intelligence & Data Quality

**Created:** 2026-04-05
**Status:** PLANNED — not started
**Depends on:** Phase 5 complete (app live at Railway, all endpoints verified)

---

## Overview

Phase 6 expands Deal Radar from a deal aggregator into a richer intelligence platform. Three parallel tracks improve company data quality, unlock investor-level analytics, and raise field-completion rates across the existing deal corpus.

| Track | Goal | Plans |
|-------|------|-------|
| **A — Company Enrichment** | Richer company profiles (logo, description, employees, founding year, tech stack) | A1, A2, A3, A4 |
| **B — Investor Intelligence** | Per-investor stats, co-investment network, investor profile pages, investor finder | B1, B2, B3, B4 |
| **C — Data Quality** | Re-extract low-confidence deals, manual editor, source metrics, Crunchbase integration | C1, C2, C3, C4 |

**Total plans:** 12
**Execution model:** 3 waves (Wave 1 parallel → Wave 2 parallel → Wave 3 parallel)

---

## Execution Sequence

```
Wave 1 (parallel — no dependencies):
  A1: Firecrawl enrichment pipeline
  B1: Investor profile aggregation
  C1: Re-extraction queue

Wave 2 (after Wave 1 complete):
  A2: Logo fetching (depends on A1 DB schema)
  A3: Similar companies engine (depends on A1 enriched data)
  B2: Co-investment network (depends on B1 investor_profiles table)
  C2: Manual deal editor (depends on C1 identified problem deals)

Wave 3 (after Wave 2 complete):
  A4: Company profile page improvements (depends on A2 + A3)
  B3: Investor profile page frontend (depends on B2 network data)
  B4: Investor finder feature (depends on B1 + B2)
  C3: Source quality metrics dashboard (depends on C1 + C2 data)
  C4: Crunchbase API fetcher (depends on C2 editor for validation)
```

---

## DB Schema Changes

### New columns on `companies`

```sql
ALTER TABLE companies ADD COLUMN logo_url TEXT;
ALTER TABLE companies ADD COLUMN employee_count INTEGER;
ALTER TABLE companies ADD COLUMN founded_year INTEGER;
ALTER TABLE companies ADD COLUMN description TEXT;           -- may already exist; enrich if null
ALTER TABLE companies ADD COLUMN tech_stack TEXT[];          -- Postgres array of strings
ALTER TABLE companies ADD COLUMN crunchbase_url TEXT;
ALTER TABLE companies ADD COLUMN enriched_at TIMESTAMP WITH TIME ZONE;
```

### New table: `investor_profiles`

```sql
CREATE TABLE investor_profiles (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    total_deals INTEGER NOT NULL DEFAULT 0,
    total_capital_usd BIGINT,           -- sum of all deal amounts
    avg_check_usd BIGINT,               -- total_capital / total_deals
    top_sectors TEXT[],                 -- top 3 sectors by deal count
    top_geos    TEXT[],                 -- top 3 geos by deal count
    last_deal_date DATE,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### New table: `co_investments`

```sql
CREATE TABLE co_investments (
    id              SERIAL PRIMARY KEY,
    investor_a      TEXT NOT NULL,
    investor_b      TEXT NOT NULL,
    co_invest_count INTEGER NOT NULL DEFAULT 1,
    last_seen_at    DATE,
    UNIQUE(investor_a, investor_b)
);
```

### New columns on `deals`

```sql
ALTER TABLE deals ADD COLUMN editor_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE deals ADD COLUMN editor_notes TEXT;
ALTER TABLE deals ADD COLUMN edited_at TIMESTAMP WITH TIME ZONE;
```

---

## New API Endpoints

| Method | Path | Purpose | Track |
|--------|------|---------|-------|
| POST | `/api/companies/{id}/enrich` | Trigger Firecrawl enrichment for one company | A1 |
| GET | `/api/investors` | List all investor profiles with stats | B1 |
| GET | `/api/investors/{name}` | Single investor profile + deals + co-investors | B3 |
| GET | `/api/investors/{name}/co-investors` | Co-investment network for one investor | B2 |
| GET | `/api/investors/find` | Query: `?sector=fintech&geo=Spain&stage=Series A` → matching investors | B4 |
| GET | `/api/admin/re-extraction-queue` | List low-confidence deals needing re-extraction | C1 |
| POST | `/api/admin/re-extraction-queue/run` | Trigger re-extraction run | C1 |
| PATCH | `/api/deals/{id}` | Manual deal editor — update fields | C2 |
| GET | `/api/admin/source-quality` | Per-source extraction success rates | C3 |
| POST | `/api/companies/{id}/crunchbase` | Fetch + merge Crunchbase data for one company | C4 |

---

## New Frontend Views / Components

| Component / View | Route | Track |
|-----------------|-------|-------|
| `CompanyLogo.tsx` | inline component | A2 |
| `SimilarCompanies.tsx` | inline widget in CompanyProfile | A3 |
| `CompanyProfile.tsx` (updated) | `/companies/:id` | A4 |
| `InvestorList.tsx` | `/investors` | B1 |
| `InvestorProfile.tsx` | `/investors/:name` | B3 |
| `CoInvestmentGraph.tsx` | inline widget in InvestorProfile | B2 |
| `InvestorFinder.tsx` | `/investors/find` | B4 |
| `DealEditor.tsx` | modal overlay on any deal row | C2 |
| `SourceQuality.tsx` | `/admin` tab addition | C3 |

---

## Wave 1 — Plans

---

### Plan A1: Firecrawl Company Enrichment Pipeline

**Complexity:** M
**Dependencies:** None (Wave 1)
**Track:** A — Company Enrichment

#### What to build

A background enrichment job that fires when a new Company row is created (or can be triggered manually). Uses the existing `FirecrawlFetcher` infrastructure from Phase 2 to scrape the company's website and extract structured metadata via AI.

**Backend tasks:**

1. Add DB columns to `companies` table via Alembic migration:
   - `description TEXT` (nullable)
   - `employee_count INTEGER` (nullable)
   - `founded_year INTEGER` (nullable)
   - `tech_stack TEXT[]` (nullable)
   - `crunchbase_url TEXT` (nullable)
   - `enriched_at TIMESTAMP WITH TIME ZONE` (nullable)

2. Create `backend/ingestion/company_enricher.py`:
   - `enrich_company(company_id: int, db: AsyncSession)` async function
   - If `company.website` is null → skip, log warning
   - Call Firecrawl to scrape `company.website`
   - Pass scraped markdown to Claude Haiku with extraction prompt:
     ```
     Extract from this webpage: company description (1-2 sentences),
     approximate employee_count (integer), founded_year (integer),
     tech_stack (list of strings: programming languages, frameworks, tools),
     crunchbase_url (if linked). Return JSON only.
     ```
   - Merge extracted fields into Company row (only overwrite if field is currently null)
   - Set `enriched_at = now()`

3. Hook into `db_writer.py`: after Company upsert, if `company.website` is set and `enriched_at` is null → enqueue enrichment (run async, non-blocking, do not block ingestion pipeline)

4. Add `POST /api/companies/{id}/enrich` endpoint in `backend/routers/companies.py` for manual trigger

**Acceptance criteria:**
- [ ] Alembic migration runs cleanly on Railway PostgreSQL
- [ ] After daily ingestion, at least 50% of new companies with a website field get enriched within 10 minutes
- [ ] `GET /api/companies/{id}` response includes `description`, `employee_count`, `founded_year`, `tech_stack`, `crunchbase_url`, `enriched_at`
- [ ] Enrichment failures (Firecrawl 429, parse error, missing website) are logged to `IngestionRun.errors` and do not crash the pipeline
- [ ] Manual `/enrich` endpoint returns `{"status": "queued"}` within 200ms

---

### Plan B1: Investor Profile Aggregation

**Complexity:** M
**Dependencies:** None (Wave 1)
**Track:** B — Investor Intelligence

#### What to build

A materialized stats table for every investor name that appears in the `deals.investors` array. Built by a SQL aggregation job that runs after each ingestion cycle and on-demand.

**Backend tasks:**

1. Add `investor_profiles` table via Alembic migration (schema above)

2. Create `backend/analytics/investor_stats.py`:
   - `rebuild_investor_profiles(db: AsyncSession)` async function
   - Query: `SELECT unnest(investors) AS name, COUNT(*), SUM(amount_usd), ... FROM deals GROUP BY name`
   - For each investor name: upsert into `investor_profiles` with computed stats
   - Top sectors: `SELECT sector, COUNT(*) FROM deals WHERE investor_name = ANY(investors) GROUP BY sector ORDER BY 2 DESC LIMIT 3`
   - Top geos: same pattern for `geo`
   - Last deal date: `MAX(announced_date)`

3. Hook into `pipeline.py`: call `rebuild_investor_profiles()` as Step 9 after db_writer finishes

4. Create `backend/routers/investors.py`:
   - `GET /api/investors` — paginated list, sortable by total_deals / total_capital_usd
   - `GET /api/investors/{name}` — single profile + recent 20 deals where investor appears

5. Register router in `backend/main.py`

**Acceptance criteria:**
- [ ] `investor_profiles` table is populated after first post-migration ingestion run
- [ ] `GET /api/investors` returns at minimum one result per investor that appears in `deals.investors`
- [ ] Stats are accurate: `total_deals` matches manual SQL count for spot-checked investor
- [ ] `GET /api/investors/{name}` returns `top_sectors`, `top_geos`, `avg_check_usd`, `last_deal_date`, and a `deals` array
- [ ] Rebuild job completes in under 30 seconds for current DB size (~100 deals)
- [ ] 404 returned for unknown investor name

---

### Plan C1: Re-Extraction Queue

**Complexity:** M
**Dependencies:** None (Wave 1)
**Track:** C — Data Quality

#### What to build

A targeted re-extraction pass for low-quality deal records. Identifies deals where `round_label = 'UNKNOWN'` AND `amount_usd IS NULL` AND `confidence < 0.5`, then re-runs AI extraction with an improved prompt on their stored `raw_text`.

**Backend tasks:**

1. Create `backend/ingestion/reextractor.py`:
   - `get_reextraction_queue(db: AsyncSession, limit: int = 200)` → list of Deal IDs matching filter
   - `reextract_deal(deal_id: int, db: AsyncSession)` → re-runs `AIExtractor.extract()` on `deal.raw_text`
   - Improved prompt hint: explicitly ask for round label from this list: `["Pre-Seed", "Seed", "Series A", "Series B", "Series C", "Series D+", "Growth", "IPO", "M&A", "Token Sale", "UNKNOWN"]` and amount in USD as integer
   - If new extraction has `confidence >= 0.5` AND fills at least one previously-null field → update the deal record; set `confidence` to new value
   - If extraction still fails → leave record unchanged, log attempt

2. `run_reextraction_batch(db: AsyncSession, limit: int = 200)` → runs full queue, returns `{"processed": N, "improved": M}`

3. Hook into `scheduler.py`: add a weekly Sunday 08:00 UTC job that calls `run_reextraction_batch()`

4. Add admin endpoints in `backend/routers/admin.py`:
   - `GET /api/admin/re-extraction-queue` — returns count + sample of 20 low-quality deals
   - `POST /api/admin/re-extraction-queue/run` — triggers immediate batch (async background task)

**Acceptance criteria:**
- [ ] Queue query correctly identifies deals with `round_label='UNKNOWN'` AND `amount_usd IS NULL` AND `confidence < 0.5`
- [ ] Re-extraction improves at least 20% of queued deals on first run (based on current 37-deal corpus sample)
- [ ] Improved deals have `confidence` updated and at least one previously-null field filled
- [ ] Deals that still fail re-extraction are NOT degraded (no field overwrite with worse data)
- [ ] `GET /api/admin/re-extraction-queue` endpoint returns queue size and sample correctly
- [ ] Weekly scheduler job fires without error (verify in APScheduler logs)

---

## Wave 2 — Plans

---

### Plan A2: Company Logo Fetching

**Complexity:** S
**Dependencies:** A1 (requires new `companies.logo_url` column from A1 migration)
**Track:** A — Company Enrichment

#### What to build

Fetch company logos using the free Clearbit Logo API (`https://logo.clearbit.com/{domain}`). Store the URL (not the image) on the Company record. Fall back gracefully when the logo is not found.

**Backend tasks:**

1. Add `logo_url TEXT` column to `companies` via Alembic migration (can be in same migration as A1 or a new one)

2. Add `fetch_logo(website: str) -> str | None` utility in `backend/ingestion/company_enricher.py`:
   - Parse domain from `company.website` (strip `https://`, `www.`, path)
   - Construct URL: `https://logo.clearbit.com/{domain}`
   - HTTP HEAD request (not GET — avoid downloading the image)
   - If response is 200 → store `https://logo.clearbit.com/{domain}` as `logo_url`
   - If 404 or error → store None, do not retry

3. Call `fetch_logo()` inside `enrich_company()` during the enrichment step (after Firecrawl scrape)

4. Add a backfill utility: `backfill_logos(db: AsyncSession)` — runs logo fetch for all companies where `logo_url IS NULL` AND `website IS NOT NULL`

5. Expose backfill via: `POST /api/admin/backfill-logos`

**Acceptance criteria:**
- [ ] `companies.logo_url` column exists and is populated for companies with a known domain
- [ ] Logo URL format is always `https://logo.clearbit.com/{domain}` (no trailing slash, no path)
- [ ] Companies with no website or Clearbit 404 have `logo_url = NULL` (not an error string)
- [ ] `GET /api/companies/{id}` response includes `logo_url` field
- [ ] Backfill endpoint processes all eligible companies in a single run
- [ ] No HTTP GET download of image data — only HEAD check to validate existence

---

### Plan A3: Similar Companies Engine

**Complexity:** M
**Dependencies:** A1 (requires enriched sector/geo data to be more reliable)
**Track:** A — Company Enrichment

#### What to build

A lightweight "similar companies" feature that suggests 3–5 related companies from the existing DB based on matching sector, geo, and round_label. Pure SQL — no ML required.

**Backend tasks:**

1. Create `backend/analytics/similar_companies.py`:
   - `get_similar_companies(company_id: int, db: AsyncSession, limit: int = 5)` async function
   - Scoring query: for each other company, compute similarity score:
     - +3 if same sector
     - +2 if same geo
     - +1 if same round_label from most recent deal
   - Exclude the source company from results
   - Return top N companies sorted by score DESC, then by most recent deal date DESC

2. Add endpoint to `backend/routers/companies.py`:
   - `GET /api/companies/{id}/similar` → returns list of `{id, name, sector, geo, logo_url, score}` objects

**Acceptance criteria:**
- [ ] Returns exactly 0–5 results (never errors if fewer than 5 similar companies exist)
- [ ] Results always exclude the queried company itself
- [ ] Same-sector match always ranks higher than geo-only match
- [ ] Response time under 200ms for current DB size
- [ ] Returns empty array (not 404) when no similar companies are found

---

### Plan B2: Co-Investment Network

**Complexity:** M
**Dependencies:** B1 (requires `investor_profiles` table and investor name normalization)
**Track:** B — Investor Intelligence

#### What to build

Identify pairs of investors who frequently appear together in the same deal. Build a `co_investments` table and expose it as an API. This powers the co-investor widget in the investor profile page (Wave 3).

**Backend tasks:**

1. Add `co_investments` table via Alembic migration (schema above)

2. Create `backend/analytics/co_investments.py`:
   - `rebuild_co_investments(db: AsyncSession)` async function
   - For each deal where `len(investors) >= 2`: generate all pairs from the investor list (itertools.combinations)
   - Upsert each pair into `co_investments` (increment `co_invest_count`, update `last_seen_at`)
   - Always store pair in alphabetical order (investor_a < investor_b) to avoid duplicate (A,B) and (B,A)

3. Hook into `pipeline.py`: call `rebuild_co_investments()` alongside `rebuild_investor_profiles()` in Step 9

4. Add endpoint to `backend/routers/investors.py`:
   - `GET /api/investors/{name}/co-investors` → returns list of `{investor_name, co_invest_count, last_seen_at}` sorted by count DESC

**Acceptance criteria:**
- [ ] `co_investments` table populated after first post-migration run
- [ ] Pairs are always stored with investor_a < investor_b (alphabetical), no duplicates
- [ ] `co_invest_count` correctly increments for investors appearing together across multiple deals
- [ ] `GET /api/investors/{name}/co-investors` returns empty array (not 404) when investor has no co-investments
- [ ] Rebuild job handles deals with 0 or 1 investor without error (no pairs generated)

---

### Plan C2: Manual Deal Editor

**Complexity:** M
**Dependencies:** C1 (targets deals identified by re-extraction queue as low quality)
**Track:** C — Data Quality

#### What to build

A frontend form that lets the user correct any deal's fields inline. Accessible from the deal feed and the admin panel. Corrections are saved immediately via API.

**Backend tasks:**

1. Add columns to `deals` via Alembic migration:
   - `editor_verified BOOLEAN DEFAULT FALSE`
   - `editor_notes TEXT`
   - `edited_at TIMESTAMP WITH TIME ZONE`

2. Add `PATCH /api/deals/{id}` endpoint in `backend/routers/deals.py`:
   - Accepts partial JSON body with any subset of: `company_name`, `amount_usd`, `round_label`, `sector`, `geo`, `announced_date`
   - Updates the deal record + sets `editor_verified = TRUE` + sets `edited_at = now()`
   - Returns full updated deal object

3. Add `DealPatchSchema` Pydantic model in `schemas.py` (all fields optional)

**Frontend tasks:**

4. Create `frontend/src/components/DealEditor.tsx`:
   - Modal dialog (Tremor Dialog or simple overlay) triggered by an edit icon (pencil) on deal rows
   - Fields: Company Name (text), Amount USD (number), Round Label (select from enum), Sector (text), Geo (text), Announced Date (date picker)
   - Submit → `PATCH /api/deals/{id}`, optimistic update of local state
   - Shows `editor_verified` badge on verified deals (green checkmark)
   - Cancel → no change

5. Add edit pencil icon to deal rows in `DealFeed.tsx` and to the deal list in `Admin.tsx`

**Acceptance criteria:**
- [ ] Edit modal opens and closes without page reload
- [ ] Saving a partial edit (e.g. only `round_label`) updates only that field; others unchanged
- [ ] `editor_verified` flag is set to TRUE after any manual edit
- [ ] Verified deals show a visual indicator in the deal feed
- [ ] `edited_at` timestamp is set correctly on save
- [ ] API returns 404 for unknown deal ID; frontend shows error toast

---

## Wave 3 — Plans

---

### Plan A4: Company Profile Page Improvements

**Complexity:** M
**Dependencies:** A2 (logo), A3 (similar companies)
**Track:** A — Company Enrichment

#### What to build

Update the existing `CompanyProfile.tsx` view (built in Phase 4 Plan 03) to surface all enriched data: logo, description, tech stack, founded year, employee count, and the similar companies widget.

**Frontend tasks:**

1. Update `CompanyProfile.tsx`:
   - Header: show `logo_url` as a 48×48 rounded image (fallback to initials avatar if null)
   - Below company name: show `founded_year` and `employee_count` if available ("Founded 2018 · ~50 employees")
   - Tech stack: render as small gray pill badges below the sector/geo badges
   - Description: if enriched description is longer than existing short description, prefer enriched
   - Show `enriched_at` as subtle "Data enriched X days ago" line

2. Add `SimilarCompanies.tsx` widget:
   - Renders below the deal history list
   - Calls `GET /api/companies/{id}/similar`
   - Displays as a horizontal card row: logo + name + sector badge
   - Each card is clickable → navigates to that company's profile
   - Loading skeleton while fetching
   - Hidden entirely if 0 results

3. Add `enriched` indicator in company header (small sparkle or dot if `enriched_at` is set)

**Acceptance criteria:**
- [ ] Logo renders in header (or initials fallback if no logo)
- [ ] Tech stack pills appear for companies with `tech_stack` data
- [ ] Similar companies widget renders 1–5 cards, each navigable
- [ ] Widget is hidden (not empty state) when no similar companies exist
- [ ] All enriched fields degrade gracefully to nothing when null — no "undefined" or empty UI elements visible

---

### Plan B3: Investor Profile Page (Frontend)

**Complexity:** M
**Dependencies:** B2 (co-investment network data)
**Track:** B — Investor Intelligence

#### What to build

A dedicated investor profile view. Accessible by clicking any investor name in the deal feed. Shows stats, portfolio companies, and co-investor network.

**Frontend tasks:**

1. Create `frontend/src/views/InvestorProfile.tsx`:
   - Route: `/investors/:name`
   - Header: investor name + key stats row (Total Deals, Total Capital, Avg Check, Last Deal)
   - Top Sectors: horizontal bar chart (Tremor BarList) — top 3 sectors by deal count
   - Top Geos: same component — top 3 geos
   - Portfolio table: deals where this investor appears — columns: Date / Company / Round / Amount / Sector / Geo
   - Co-investors section: list of investors sorted by co-invest_count, showing count badge

2. Update `InvestorList.tsx` (from B1): add clickable link on each investor name → `/investors/:name`

3. Update `DealFeed.tsx` and `CompanyProfile.tsx`: investor name chips in deal rows should be clickable links

4. Add `/investors` and `/investors/:name` routes to `App.tsx`

5. Add "Investors" link to `Navbar.tsx`

**Acceptance criteria:**
- [ ] Investor profile page loads for any investor name present in DB
- [ ] All 4 stat cards (total deals, total capital, avg check, last deal) show correct values
- [ ] Top sectors and top geos sections render correctly
- [ ] Portfolio table lists deals in reverse chronological order
- [ ] Co-investor list sorted by co-invest_count descending
- [ ] 404/empty state shown for unknown investor name
- [ ] Clicking investor name anywhere in the app navigates to their profile

---

### Plan B4: Investor Finder

**Complexity:** S
**Dependencies:** B1, B2
**Track:** B — Investor Intelligence

#### What to build

A query tool: given sector + geo + stage, return matching investors from the DB ranked by relevance. Useful for deal sourcing — "who invests in Fintech in Spain at Series A?"

**Backend tasks:**

1. Add `GET /api/investors/find` endpoint in `backend/routers/investors.py`:
   - Query params: `sector` (optional), `geo` (optional), `stage` (optional — maps to `round_label`)
   - Scoring: +3 if sector appears in `investor.top_sectors`, +2 if geo in `investor.top_geos`, +1 if stage matches a recent deal
   - Returns top 10 investors sorted by score DESC, then `total_deals` DESC
   - Empty array if no params provided (not an error)

**Frontend tasks:**

2. Create `frontend/src/views/InvestorFinder.tsx`:
   - Route: `/investors/find`
   - Three dropdowns: Sector, Geo, Stage (populated from distinct values in DB)
   - Results list: investor name, score, top sectors, total deals, last deal date
   - Each result links to investor profile page
   - "No results" empty state

3. Add "Find Investors" link/tab on the Investors list page

**Acceptance criteria:**
- [ ] API returns ranked results for any combination of 1–3 filter params
- [ ] Sector-only query returns investors sorted by sector match count
- [ ] Empty param combination returns empty array with 200 (not error)
- [ ] Frontend dropdowns are populated dynamically from DB values
- [ ] Result count shown ("Found 8 matching investors")

---

### Plan C3: Source Quality Metrics

**Complexity:** S
**Dependencies:** C1 (re-extraction data needed for before/after comparison), C2 (editor_verified flag needed)
**Track:** C — Data Quality

#### What to build

A per-source quality dashboard tab in Admin. Shows extraction success rates so we can identify which sources produce the worst data and tune accordingly.

**Backend tasks:**

1. Add `GET /api/admin/source-quality` endpoint in `backend/routers/admin.py`:
   - Aggregates from `deals` grouped by `source`:
     - `total_deals`: COUNT(*)
     - `pct_with_amount`: COUNT(*) FILTER (WHERE amount_usd IS NOT NULL) / total * 100
     - `pct_with_round_label`: COUNT(*) FILTER (WHERE round_label != 'UNKNOWN') / total * 100
     - `pct_with_sector`: COUNT(*) FILTER (WHERE sector IS NOT NULL) / total * 100
     - `avg_confidence`: AVG(confidence)
     - `editor_verified_count`: COUNT(*) FILTER (WHERE editor_verified = TRUE)
   - Returns list of source quality objects

**Frontend tasks:**

2. Add "Source Quality" tab to `Admin.tsx`:
   - Tremor Table showing per-source metrics
   - Color-code `pct_with_amount` column: green >70%, yellow 40-70%, red <40%
   - Same color coding for `pct_with_round_label`
   - Sort by `avg_confidence` DESC by default

**Acceptance criteria:**
- [ ] API returns one row per distinct source in the `deals` table
- [ ] All percentage values are 0–100 (not decimals)
- [ ] Color thresholds applied correctly in frontend
- [ ] Zero-division handled: sources with 0 deals return 0% for all rates
- [ ] Tab is accessible from existing `/admin` route without new URL

---

### Plan C4: Crunchbase API Fetcher

**Complexity:** L
**Dependencies:** C2 (manual editor used to validate Crunchbase merges before automating)
**Track:** C — Data Quality
**Blocker:** Requires paid Crunchbase API key (confirm before executing)

#### What to build

Integrate the Crunchbase Basic API (originally deferred from Phase 2) to enrich company records with authoritative data: funding rounds history, employee count, founding year, description, and the canonical Crunchbase URL.

**Backend tasks:**

1. Add `CRUNCHBASE_API_KEY` to `.env.example` and Railway environment variables

2. Create `backend/ingestion/crunchbase_fetcher.py`:
   - `CrunchbaseFetcher` class with `search_company(name: str) -> dict | None`
   - Uses Crunchbase Basic API: `GET https://api.crunchbase.com/api/v4/entities/organizations/{permalink}?user_key={key}&field_ids=short_description,num_employees_enum,founded_on,homepage_url`
   - Search by name: `GET /searches/organizations` with name filter
   - Returns normalized dict: `{description, employee_count, founded_year, crunchbase_url}`

3. Add `enrich_from_crunchbase(company_id: int, db: AsyncSession)` in `company_enricher.py`:
   - Only runs if `CRUNCHBASE_API_KEY` is set (graceful degradation if key not present)
   - Search Crunchbase for company name
   - If match found with confidence >80% (fuzzy name match): merge fields into Company record
   - Prefer Crunchbase data over Firecrawl-extracted data for `employee_count` and `founded_year` (more authoritative)
   - Set `crunchbase_url` field

4. Add `POST /api/companies/{id}/crunchbase` endpoint for manual per-company trigger

5. Add Crunchbase as a deal ingestion source in `pipeline.py` (optional — only if API supports deal search):
   - If Crunchbase deal search endpoint is available on the subscribed tier, add `CrunchbaseFetcher` as a `BaseFetcher` subclass
   - Filter: deals from last 7 days matching tracked sectors/geos

**Acceptance criteria:**
- [ ] `CRUNCHBASE_API_KEY` absent → no error, enrichment step silently skipped
- [ ] API key present → `enrich_from_crunchbase()` populates `crunchbase_url` for matched companies
- [ ] Fuzzy name match threshold of 80% prevents false positives
- [ ] Crunchbase `employee_count` overwrites Firecrawl estimate when both exist
- [ ] Manual endpoint returns `{"status": "enriched", "fields_updated": [...]}` or `{"status": "no_match"}`
- [ ] Rate limiting: max 1 request/second to Crunchbase API (add `asyncio.sleep(1)` between calls in batch mode)

---

## Summary Table

| Plan | Track | Wave | Complexity | Status |
|------|-------|------|------------|--------|
| A1 | Enrichment | 1 | M | pending |
| B1 | Investor Intel | 1 | M | pending |
| C1 | Data Quality | 1 | M | pending |
| A2 | Enrichment | 2 | S | pending |
| A3 | Enrichment | 2 | M | pending |
| B2 | Investor Intel | 2 | M | pending |
| C2 | Data Quality | 2 | M | pending |
| A4 | Enrichment | 3 | M | pending |
| B3 | Investor Intel | 3 | M | pending |
| B4 | Investor Intel | 3 | S | pending |
| C3 | Data Quality | 3 | S | pending |
| C4 | Data Quality | 3 | L | pending — blocked on Crunchbase key |

**Total complexity:** 3S + 8M + 1L
**Estimated sessions:** 4–6 (2 per wave, running plans in parallel within each wave)

---

## Pre-Flight Checklist (before starting Wave 1)

- [ ] Confirm Firecrawl API key is set in Railway (already confirmed in Phase 5 deploy)
- [ ] Confirm Crunchbase API key available (needed only for C4, can defer)
- [ ] Verify `companies.website` field is populated for at least some companies (check DB)
- [ ] Verify `deals.investors` array is populated (check ingestion output)
- [ ] Run `GET /api/admin/runs` to confirm ingestion has been running and producing data

---

*Written: 2026-04-05 | Next review: after Wave 1 completion*
