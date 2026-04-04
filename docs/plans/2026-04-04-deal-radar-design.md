# Deal Radar -- Design Document

**Date:** 2026-04-04
**Status:** Approved
**Authors:** Daniel Ferraro + Claude

---

## What We're Building

Deal Radar is a live deals intelligence dashboard that aggregates VC funding rounds, M&A activity,
Crypto/Web3 raises, and IPOs across Crypto/Fintech, LatAm, Spain/Europe, and global top deals.
2-person tool (Daniel + cousin). Deployed on Railway. No auth.

---

## Architecture

```
Ingestion Pipeline (APScheduler, daily 7am UTC)
  CrunchbaseFetcher  -- /v4/searches/funding_rounds API
  TavilyFetcher      -- AI news search for deal announcements
  FirecrawlFetcher   -- scrape TechCrunch, CoinDesk, Expansion, Contxto
  RSSFetcher         -- parse feeds from TechCrunch, CoinDesk, Sifted, Contxto

  All sources produce: RawDeal { source, company_name, amount_raw, date_raw, url, raw_text }
  AI Extraction (Claude Haiku) -- normalizes to structured fields
  Deduplication -- fuzzy match on company_name + date + amount

Manual ingest:
  POST /api/ingest/manual { url | text }
  Firecrawl fetches URL -- AI extracts -- user confirms

FastAPI (Railway)
  /api/* -- data API
  /* -- serves React build as static files

React + Vite (built into FastAPI /static or /app)
  5 views: Deal Feed / Heatmap / Company Profile / Trends / Watchlist

PostgreSQL (Railway addon)
```

Single Railway deployment. FastAPI serves both API and React build.
No CORS configuration needed.

---

## Data Model

```sql
companies (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  sector TEXT[],          -- e.g. ['crypto', 'fintech']
  geo TEXT,               -- e.g. 'latam', 'spain', 'global'
  description TEXT,
  crunchbase_url TEXT,
  website TEXT,
  founded_year INT,
  created_at TIMESTAMPTZ DEFAULT now()
)

deals (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES companies(id),
  deal_type TEXT,         -- 'vc', 'ma', 'crypto', 'ipo'
  amount_usd BIGINT,      -- in USD, nullable if undisclosed
  currency TEXT,
  round_label TEXT,       -- 'Series A', 'Seed', 'Acquisition', etc.
  announced_date DATE,
  closed_date DATE,
  lead_investor TEXT,
  all_investors TEXT[],
  source_url TEXT,
  source_name TEXT,       -- 'crunchbase', 'techcrunch', 'tavily', etc.
  raw_text TEXT,          -- original source text for re-extraction
  ai_summary TEXT,        -- 2-3 sentence LLM summary
  created_at TIMESTAMPTZ DEFAULT now()
)

investors (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT,              -- 'vc', 'corporate', 'angel', 'pe'
  website TEXT
)

watchlist (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES companies(id),
  added_at TIMESTAMPTZ DEFAULT now(),
  notes TEXT
)

ingestion_runs (
  id UUID PRIMARY KEY,
  source TEXT,            -- 'crunchbase', 'tavily', 'firecrawl', 'rss', 'manual'
  status TEXT,            -- 'success', 'partial', 'failed'
  deals_found INT,
  deals_added INT,
  run_at TIMESTAMPTZ DEFAULT now(),
  error_log TEXT
)
```

**Key decision:** `raw_text` stored with every deal. Enables re-running AI extraction
with an improved prompt without re-scraping. Treats the DB as both structured store
and raw content cache.

---

## Ingestion Pipeline Design

### Source Fetchers

Each fetcher implements the base interface:

```python
class BaseFetcher:
    async def fetch(self, date: date) -> list[RawDeal]: ...

@dataclass
class RawDeal:
    source: str
    company_name: str
    amount_raw: str | None   # original string, e.g. "$50M", "undisclosed"
    date_raw: str
    url: str
    raw_text: str
```

Fetchers run in parallel (asyncio.gather) to minimize daily job duration.

### AI Extraction

Input: RawDeal.raw_text
Output: structured fields via LLM structured output (Pydantic model)
Model: Claude Haiku (fast, cheap -- ~$0.10 per 1000 deals)

Extraction fields:
- amount_usd: int | None
- deal_type: Literal['vc', 'ma', 'crypto', 'ipo']
- round_label: str | None
- sector: list[str]
- geo: str
- lead_investor: str | None
- all_investors: list[str]
- ai_summary: str (2-3 sentences)

### Deduplication

1. Normalize company name (lowercase, strip punctuation)
2. Match on: normalized_name + announced_date within 3 days + amount_usd within 10%
3. If match found: merge investor lists, keep highest-confidence source, discard duplicate
4. If no match: insert as new deal

---

## API Endpoints

```
GET  /api/health
GET  /api/deals?date_from=&date_to=&type=&sector=&geo=&amount_min=&page=&limit=
GET  /api/deals/:id
GET  /api/companies/:id
GET  /api/heatmap?period=weekly|monthly|quarterly
GET  /api/trends?weeks=12
GET  /api/watchlist
POST /api/watchlist  { company_id, notes }
DELETE /api/watchlist/:company_id
POST /api/ingest/manual  { url? text? }
POST /api/ingest/run     (trigger pipeline manually)
```

All responses: JSON. Pagination on /api/deals (default limit: 50).

---

## Frontend Views

### Tech Stack

- React 18 + Vite
- React Router v6 (client-side routing)
- Tremor (component library: Table, Badge, BarChart, LineChart, Card, KPI)
- Tailwind CSS (dark mode enabled)
- Axios (HTTP client)

### Views

**/ -- Deal Feed**
- Tremor Table with sortable columns: date, company, round, amount, sector, geo
- Filter bar (Tremor Select + DateRangePicker): type, sector, geo, amount_min
- Click row -> /company/:id
- KPI cards at top: deals this week, total capital raised, top sector

**/heatmap -- Sector Heatmap**
- Custom grid built with Tailwind: rows = sectors, cols = geos
- Cell color: Tailwind scale gray-100 to amber-600 (capital intensity)
- Period toggle: weekly / monthly / quarterly (Tremor SegmentedControl)
- Tooltip on hover: exact amount + deal count

**/company/:id -- Company Profile**
- Header: name, sector badges, geo, website link
- Deal history timeline (Tremor List)
- Investors mentioned
- Watchlist toggle button (add/remove)

**/trends -- Trend Charts**
- Tremor LineChart: capital raised per week by deal type (4 lines)
- Tremor BarChart: top 10 sectors by deal count this month

**/watchlist -- Watchlist**
- Same as Deal Feed but filtered to watchlisted companies
- Notes column with inline edit
- Remove from watchlist button per row

---

## Deployment

### Railway Setup

```
Procfile:
  web: uvicorn backend.main:app --host 0.0.0.0 --port $PORT

Environment variables:
  DATABASE_URL         -- Railway PostgreSQL connection string
  CRUNCHBASE_API_KEY
  TAVILY_API_KEY
  FIRECRAWL_API_KEY
  ANTHROPIC_API_KEY    -- for Claude Haiku extraction
  OPENAI_API_KEY       -- fallback for GPT-4o-mini
```

FastAPI serves the Vite build from `/frontend/dist` as StaticFiles mounted at `/`.
API routes are prefixed `/api/` to avoid collision with frontend routes.

### Build Process

```bash
# In Railway build command:
cd frontend && npm install && npm run build
cd .. && pip install -r requirements.txt
```

---

## Verification Checklist

1. GET /api/health -> 200
2. Run pipeline: POST /api/ingest/run -> check 10+ deals in DB
3. GET /api/deals?sector=crypto -> returns filtered results with correct fields
4. GET /api/heatmap?period=weekly -> returns sector x geo matrix
5. Open / -> deal feed loads with data and filters work
6. Open /heatmap -> grid renders with color scale
7. Click company -> profile page loads with deal history
8. Add to watchlist -> appears in /watchlist view
9. POST /api/ingest/manual with TechCrunch URL -> deal preview returned
10. APScheduler logs show next run scheduled at 7am UTC
