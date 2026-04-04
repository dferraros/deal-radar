# Deal Radar

Live deals intelligence dashboard. Aggregates VC funding rounds, M&A, crypto raises,
and IPOs from Tavily, Firecrawl, and RSS feeds. Normalizes via Claude Haiku, deduplicates,
and presents a queryable dashboard.

**Stack:** FastAPI + PostgreSQL + React 18 + Tremor + APScheduler
**Deploy:** Railway (single service, FastAPI serves React static build)

---

## Local Development

### Prerequisites

- Python 3.11+
- Node.js 18+
- PostgreSQL running locally (or use Railway's Postgres URL directly)

### Setup

```bash
# Clone and install Python dependencies
pip install -r requirements.txt

# Install frontend dependencies and build
cd frontend && npm install && npm run build && cd ..

# Copy env vars
cp .env.example .env
# Edit .env and fill in your keys
```

### Run

```bash
# Start FastAPI (serves API + React build on :8000)
uvicorn backend.main:app --reload --port 8000
```

Visit http://localhost:8000

### Run DB migrations locally

```bash
# Requires DATABASE_URL in .env pointing to a local Postgres instance
alembic upgrade head
```

---

## Railway Deployment

### One-time setup

1. Create a Railway project at https://railway.app
2. Add a PostgreSQL addon: **+ New → Database → Add PostgreSQL**
3. Railway injects `DATABASE_URL` automatically into your service — no manual copy needed
4. In your service's **Variables** tab, set:

| Variable | Source |
|----------|--------|
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys |
| `TAVILY_API_KEY` | app.tavily.com → Dashboard → API Keys |
| `FIRECRAWL_API_KEY` | firecrawl.dev → Dashboard → API Keys |
| `OPENAI_API_KEY` | platform.openai.com → API Keys (optional) |

5. Connect your GitHub repo to the Railway service
6. Push to your main branch — Railway builds and deploys automatically

### What Railway does on each deploy

1. **Build:** `cd frontend && npm install && npm run build && cd ..`
   (Vite compiles React into `frontend/dist/`)
2. **Release:** `alembic upgrade head`
   (Applies any pending DB migrations — safe to run on every deploy)
3. **Start:** `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
   (FastAPI serves the API + React SPA at the Railway URL)

### Verify the deploy

```bash
# Health check
curl https://YOUR-RAILWAY-URL.railway.app/api/health

# Should return:
# {"status":"ok","version":"1.0.0"}

# Check ingestion run log (empty on first deploy)
curl https://YOUR-RAILWAY-URL.railway.app/api/admin/runs
```

---

## Pipeline

### Automatic (APScheduler)

The ingestion pipeline runs daily at **7:00 AM UTC** via APScheduler, which starts
with the FastAPI process. No cron job or Railway scheduler needed.

Sources: RSS feeds (TechCrunch, VentureBeat, CoinDesk, etc.) → Tavily search →
Firecrawl enrichment → Claude Haiku extraction → deduplication → PostgreSQL.

### Manual trigger

```bash
curl -X POST https://YOUR-RAILWAY-URL.railway.app/api/ingest/run
```

This runs the full pipeline synchronously. Expect 30–120 seconds depending on API
response times. The response is a JSON summary of deals found/added per source.

---

## Views

| Route | Description |
|-------|-------------|
| `/` | Deal Feed — chronological list with filters |
| `/heatmap` | Sector × Geo capital heatmap |
| `/trends` | Weekly capital trends + top sectors bar chart |
| `/watchlist` | Pinned companies with inline notes |
| `/company/:id` | Company profile with deal history |
| `/admin` | Ingestion run log (source, status, errors) |

---

## Environment Variables

See `.env.example` for the full list. `DATABASE_URL` is injected automatically by
Railway when you add the PostgreSQL addon. All other keys must be set manually.
