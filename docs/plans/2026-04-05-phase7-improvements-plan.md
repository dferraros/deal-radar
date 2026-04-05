# Phase 7 Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Five improvements: fix sector/deal_type tagging, add search, wire Crunchbase, add briefing top-deals context, and add investor co-investment network endpoint + view.

**Architecture:** Prompt rewrite improves future extractions; search adds a `q` param to existing deals endpoint; Crunchbase adds a new fetcher to the pipeline; briefing passes top-5 deals to the AI prompt; investor network uses a raw SQL self-join on the `all_investors` JSONB array.

**Tech Stack:** FastAPI, SQLAlchemy async, React + Vite, Tailwind, D3 (for network graph)

---

## Task 1: Fix Sector / Deal Type Tagging in AI Extractor

**Files:**
- Modify: `backend/ingestion/ai_extractor.py` (lines 105–150)
- Modify: `backend/ingestion/db_writer.py` (line 94 area)

**Step 1: Rewrite `_SYSTEM_PROMPT` in `ai_extractor.py`**

Replace the current `_SYSTEM_PROMPT` (line 105) with:

```python
_SYSTEM_PROMPT = (
    "You are a financial deals analyst specializing in investment data extraction. "
    "Extract structured deal information from the provided text. "
    "Return only valid JSON — no markdown, no explanation, just the JSON object. "
    "company_name is REQUIRED and must never be null or empty. "
    "If you cannot identify a clear deal in the text, set confidence below 0.3. "
    "deal_type MUST be one of: vc, ma, crypto, ipo, unknown — never leave it as unknown if clues exist. "
    "sector MUST come from the allowed list — never return 'other' if a better fit exists."
)
```

**Step 2: Rewrite `_USER_TEMPLATE` in `ai_extractor.py`**

Replace the current `_USER_TEMPLATE` (lines 113–150) with:

```python
_USER_TEMPLATE = """\
Extract deal information from this text:

---
{raw_text}
---

Source: {source}
Date hint: {date_raw}
Amount hint: {amount_raw}

Return a single JSON object with these exact fields:

REQUIRED:
- company_name (string — MUST be the company that raised/was acquired, never null)

OPTIONAL (use null if not found):
- company_description (string, 1 sentence max)
- company_website (string URL)
- deal_type: classify using these rules:
    "vc"     → startup raised funding: Seed, Series A/B/C/D/E, Pre-seed, growth round, venture round
    "ma"     → acquisition, merger, buyout, takeover — company bought by another
    "crypto" → token sale, IDO, IEO, ICO, blockchain/Web3/DeFi/NFT project raise
    "ipo"    → IPO, direct listing, SPAC, going public, stock market debut
    "unknown"→ only if truly cannot determine from text
- amount_usd (integer in USD — convert currencies; null if undisclosed; NEVER 0)
- currency (original currency string, e.g. "EUR", "USD")
- round_label (e.g. "Seed", "Series A", "Series B", "Acquisition", "Token Sale")
- announced_date (YYYY-MM-DD)
- sector: pick from this list using these rules (array, up to 2):
    "crypto"    → blockchain, Web3, DeFi, NFT, token, crypto exchange, wallet
    "fintech"   → payments, lending, neobank, insurtech, wealthtech, trading, remittance
    "saas"      → B2B software, SaaS, AI/ML platform, developer tools, cloud infrastructure
    "healthtech"→ health, medical, biotech, pharma, genomics, telemedicine, medtech
    "edtech"    → education, e-learning, online courses, tutoring, skills training
    "proptech"  → real estate, property, construction tech, smart buildings
    "other"     → only if none of the above apply
- geo: pick one:
    "latam"  → Latin America: Mexico, Brazil, Colombia, Argentina, Chile, Peru, etc.
    "spain"  → Spain only
    "europe" → Europe (excluding Spain): UK, France, Germany, Netherlands, etc.
    "us"     → United States or Canada
    "asia"   → Asia Pacific: China, India, Japan, Korea, Singapore, SEA, etc.
    "africa" → Africa
    "mena"   → Middle East and North Africa
    "global" → explicitly global/cross-border, or genuinely unclear geography
- lead_investor (string)
- all_investors (array of strings)
- tech_stack (array: technologies/frameworks/platforms, e.g. ["Solidity","EVM"] or ["Python","AWS"])
- ai_summary (2-3 sentences describing the deal)

REQUIRED:
- confidence (float 0.0-1.0):
    0.8-1.0 = company name certain + amount/date both present and clear
    0.5-0.7 = company name certain but amount or date missing/unclear
    0.3-0.5 = partial extraction, some key fields ambiguous
    0.0-0.3 = not a real deal announcement, or company name unclear\
"""
```

**Step 3: Fix `amount_usd = 0` in `db_writer.py`**

In `write_deals()`, after the confidence gate (around line 61), add a zero-amount fix:

```python
# Treat amount_usd = 0 as null (undisclosed)
if extracted.amount_usd == 0:
    extracted.amount_usd = None
```

Add this block immediately after `if extracted.confidence < _MIN_CONFIDENCE:` block.

**Step 4: Add round_label → deal_type inference in `db_writer.py`**

In `write_deals()`, after the zero-amount fix, add:

```python
# Infer deal_type from round_label if LLM returned "unknown"
if extracted.deal_type == "unknown" and extracted.round_label:
    rl = extracted.round_label.lower()
    if any(k in rl for k in ("seed", "series", "pre-seed", "venture", "growth")):
        extracted.deal_type = "vc"
    elif any(k in rl for k in ("acqui", "merger", "buyout")):
        extracted.deal_type = "ma"
    elif any(k in rl for k in ("token", "ido", "ico", "ieo")):
        extracted.deal_type = "crypto"
    elif any(k in rl for k in ("ipo", "spac", "listing")):
        extracted.deal_type = "ipo"
```

**Step 5: Commit**

```bash
git add backend/ingestion/ai_extractor.py backend/ingestion/db_writer.py
git commit -m "fix(extraction): rewrite prompt for sector/deal_type accuracy, filter zero amounts"
```

---

## Task 2: Search Bar in Deal Feed

**Files:**
- Modify: `backend/routers/deals.py` (add `q` param to `list_deals`)
- Modify: `frontend/src/views/DealFeed.tsx` (wire existing `search` state to UI + API)

**Step 1: Add `q` param to `list_deals` in `backend/routers/deals.py`**

Add `q` after `amount_min` in the function signature:

```python
q: Optional[str] = Query(None, description="Search by company name"),
```

Add filter after the `amount_min` filter block:

```python
if q is not None and q.strip():
    base_stmt = base_stmt.where(
        Company.name.ilike(f"%{q.strip()}%")
    )
```

Do the same for `export_deals_csv` (same pattern).

**Step 2: Wire search to `fetchDeals` in `DealFeed.tsx`**

In `buildParams`, add `q` support:

```typescript
if (f.search) params.q = f.search
```

But `search` is separate state, not in FilterState. Instead, pass it directly in `fetchDeals`:

In the `fetchDeals` callback, change the params line to:

```typescript
const params = { ...buildParams(f), page: '1', limit: '50', ...(searchQuery ? { q: searchQuery } : {}) }
```

Where `searchQuery` is passed as a parameter to `fetchDeals`. Update the function signature:

```typescript
const fetchDeals = useCallback(async (f: FilterState, searchQuery = '') => {
```

**Step 3: Add debounced search input above FilterBar in `DealFeed.tsx`**

Add a `useRef` for the debounce timer and a `handleSearchChange` function:

```typescript
const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

const handleSearchChange = (val: string) => {
  setSearch(val)
  if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
  searchTimerRef.current = setTimeout(() => {
    fetchDeals(filters, val)
    setPage(1)
  }, 300)
}
```

Add the search input in JSX, above the `<FilterBar />` component:

```tsx
<div className="px-6 pt-4 pb-2">
  <input
    type="text"
    placeholder="Search company name..."
    value={search}
    onChange={(e) => handleSearchChange(e.target.value)}
    className="w-full max-w-sm bg-zinc-900 border border-zinc-700 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-amber-500 rounded-md px-3 py-1.5 text-sm"
  />
</div>
```

**Step 4: Also pass `search` when filters change**

In the `useEffect` that calls `fetchDeals(filters)`, change to `fetchDeals(filters, search)`.

**Step 5: Commit**

```bash
git add backend/routers/deals.py frontend/src/views/DealFeed.tsx
git commit -m "feat(search): add company name search to deal feed"
```

---

## Task 3: Wire Crunchbase Fetcher

**Files:**
- Create: `backend/ingestion/crunchbase.py`
- Modify: `backend/ingestion/pipeline.py` (add to fetch_tasks)

**Step 1: Create `backend/ingestion/crunchbase.py`**

```python
"""
Crunchbase Fetcher — Phase 7

Fetches recent funding rounds from Crunchbase v4 API.
Requires CRUNCHBASE_API_KEY environment variable.

Returns RawDeal objects normalized from Crunchbase funding_round entities.
"""

import asyncio
import logging
import os
from datetime import date, timedelta

import aiohttp

from backend.ingestion.base import RawDeal

logger = logging.getLogger(__name__)

_API_BASE = "https://api.crunchbase.com/api/v4"
_INVESTMENT_TYPE_TO_ROUND = {
    "seed": "Seed",
    "pre_seed": "Pre-Seed",
    "series_a": "Series A",
    "series_b": "Series B",
    "series_c": "Series C",
    "series_d": "Series D",
    "series_e": "Series E",
    "series_f": "Series F",
    "venture": "Venture Round",
    "corporate_round": "Corporate Round",
    "convertible_note": "Convertible Note",
    "debt_financing": "Debt Financing",
    "equity_crowdfunding": "Equity Crowdfunding",
    "post_ipo_equity": "Post-IPO Equity",
    "post_ipo_debt": "Post-IPO Debt",
    "secondary_market": "Secondary Market",
    "grant": "Grant",
    "non_equity_assistance": "Non-Equity Assistance",
    "initial_coin_offering": "ICO",
    "product_crowdfunding": "Crowdfunding",
    "undisclosed": None,
}


class CrunchbaseFetcher:
    """Fetch recent funding rounds from Crunchbase v4 API."""

    def __init__(self):
        self._api_key = os.environ.get("CRUNCHBASE_API_KEY")

    async def fetch(self, target_date: date) -> list[RawDeal]:
        if not self._api_key:
            logger.info("[Crunchbase] CRUNCHBASE_API_KEY not set — skipping")
            return []

        date_from = (target_date - timedelta(days=7)).isoformat()
        date_to = target_date.isoformat()

        try:
            return await self._fetch_funding_rounds(date_from, date_to)
        except Exception as exc:
            logger.error("[Crunchbase] Fetch failed: %s", exc, exc_info=True)
            return []

    async def _fetch_funding_rounds(
        self, date_from: str, date_to: str
    ) -> list[RawDeal]:
        """Query /searches/funding_rounds for the date range."""
        url = f"{_API_BASE}/searches/funding_rounds"
        headers = {
            "X-cb-user-key": self._api_key,
            "Content-Type": "application/json",
        }
        payload = {
            "field_ids": [
                "identifier",
                "announced_on",
                "money_raised",
                "investment_type",
                "funded_organization_identifier",
                "funded_organization_location",
                "lead_investor_identifiers",
                "investor_identifiers",
                "short_description",
            ],
            "query": [
                {
                    "type": "predicate",
                    "field_id": "announced_on",
                    "operator_id": "gte",
                    "values": [date_from],
                },
                {
                    "type": "predicate",
                    "field_id": "announced_on",
                    "operator_id": "lte",
                    "values": [date_to],
                },
            ],
            "order": [{"field_id": "announced_on", "sort": "desc"}],
            "limit": 100,
        }

        loop = asyncio.get_event_loop()

        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload, headers=headers) as resp:
                if resp.status == 401:
                    logger.error("[Crunchbase] Invalid API key (401)")
                    return []
                if resp.status == 429:
                    logger.warning("[Crunchbase] Rate limited (429)")
                    return []
                resp.raise_for_status()
                data = await resp.json()

        entities = data.get("entities", [])
        logger.info("[Crunchbase] Received %d funding rounds", len(entities))

        deals = []
        for entity in entities:
            raw = self._entity_to_raw_deal(entity)
            if raw:
                deals.append(raw)

        return deals

    def _entity_to_raw_deal(self, entity: dict) -> RawDeal | None:
        props = entity.get("properties", {})

        # Company name — required
        org = props.get("funded_organization_identifier", {})
        company_name = org.get("value") if isinstance(org, dict) else None
        if not company_name:
            return None

        # Amount
        money = props.get("money_raised", {})
        amount_usd = None
        currency = None
        if isinstance(money, dict):
            amount_usd = money.get("value_usd")
            currency = money.get("currency")
        amount_raw = f"{amount_usd} USD" if amount_usd else "undisclosed"

        # Date
        announced_on = props.get("announced_on", "")
        date_raw = announced_on or ""

        # Round label
        inv_type = props.get("investment_type", "")
        round_label = _INVESTMENT_TYPE_TO_ROUND.get(inv_type, inv_type or None)

        # Investors
        lead_investors = props.get("lead_investor_identifiers", []) or []
        all_investors = props.get("investor_identifiers", []) or []
        lead_str = lead_investors[0].get("value", "") if lead_investors else ""
        all_inv_str = ", ".join(
            i.get("value", "") for i in all_investors if isinstance(i, dict)
        )

        # Description / summary text
        desc = props.get("short_description", "") or ""
        raw_text = (
            f"{company_name} raised {amount_raw} in a {round_label or inv_type} round. "
            f"Announced: {announced_on}. {desc} "
            f"Lead investor: {lead_str}. All investors: {all_inv_str}."
        ).strip()

        return RawDeal(
            source="crunchbase",
            company_name=company_name,
            amount_raw=amount_raw,
            date_raw=date_raw,
            url=f"https://www.crunchbase.com/funding_round/{entity.get('identifier', {}).get('permalink', '')}",
            raw_text=raw_text,
        )
```

**Step 2: Add aiohttp to requirements if not present**

Check `requirements.txt` — if `aiohttp` is missing, add it:
```
aiohttp>=3.9.0
```

**Step 3: Add Crunchbase to pipeline fetch tasks in `pipeline.py`**

Find the `fetch_tasks` list in `pipeline.py`. Add Crunchbase:

```python
from backend.ingestion.crunchbase import CrunchbaseFetcher

# In run_ingestion(), add to fetch_tasks:
crunchbase_fetcher = CrunchbaseFetcher()
fetch_tasks.append(("crunchbase", crunchbase_fetcher.fetch(target_date)))
```

**Step 4: Commit**

```bash
git add backend/ingestion/crunchbase.py backend/ingestion/pipeline.py requirements.txt
git commit -m "feat(ingestion): wire Crunchbase v4 funding rounds fetcher"
```

---

## Task 4: Briefing — Pass Top 5 Deals to AI Prompt

**Files:**
- Modify: `backend/routers/briefing.py` (lines 43–83)

The briefing AI summary already exists but uses aggregate numbers only. Improve it by passing the top 5 deals with company names and amounts.

**Step 1: Collect top 5 deals by amount in `get_latest_briefing`**

After `top_deal` is computed (around line 111), add:

```python
# Top 5 deals for AI context
top_5_deals = sorted(
    [d for d in deals if d.amount_usd and d.company],
    key=lambda d: d.amount_usd or 0,
    reverse=True,
)[:5]
top_5_lines = [
    f"- {d.company.name}: ${d.amount_usd / 1_000_000:.0f}M ({d.deal_type or 'deal'}, {', '.join(d.company.sector or ['unknown'])})"
    for d in top_5_deals
]
```

**Step 2: Pass `top_5_lines` to `_generate_ai_summary`**

Update the function signature:

```python
async def _generate_ai_summary(
    total_deals: int,
    total_capital: int,
    top_company: Optional[str],
    top_amount: Optional[int],
    sectors: list[str],
    geos: list[str],
    top_5_lines: list[str],  # ← new
) -> Optional[str]:
```

Update the prompt inside `_generate_ai_summary`:

```python
top_deals_str = "\n".join(top_5_lines) if top_5_lines else "No deals with disclosed amounts."
prompt = (
    f"You are a financial analyst writing a weekly deal intelligence briefing.\n"
    f"This week's data: {total_deals} deals tracked, ${total_capital / 1_000_000_000:.2f}B total capital.\n"
    f"Top deals by amount:\n{top_deals_str}\n"
    f"Top sectors: {', '.join(sectors[:5]) or 'N/A'}. Top geos: {', '.join(geos[:5]) or 'N/A'}.\n"
    f"Write exactly 3 sentences: (1) headline stat, (2) notable deal or sector trend, (3) geographic insight. "
    f"Be specific. Use company names. No preamble."
)
```

**Step 3: Update the call site to pass `top_5_lines`**

```python
ai_summary = await _generate_ai_summary(
    total_deals=deal_count,
    total_capital=total_capital,
    top_company=top_company,
    top_amount=top_amount,
    sectors=top_sectors,
    geos=top_geos,
    top_5_lines=top_5_lines,
)
```

**Step 4: Force cache refresh by resetting `_briefing_cache`**

The in-memory cache holds the old summary. Force regeneration by lowering the freshness check TTL from 6 days to 1 hour for now (revert after testing):

Change `_cache_is_fresh`:
```python
def _cache_is_fresh() -> bool:
    """Return True if cached briefing is less than 1 hour old."""
    generated_at = _briefing_cache.get("generated_at")
    if generated_at is None:
        return False
    age = datetime.now(timezone.utc) - generated_at
    return age.total_seconds() < 3600
```

**Step 5: Commit**

```bash
git add backend/routers/briefing.py
git commit -m "feat(briefing): pass top-5 deals to AI summary for richer narrative"
```

---

## Task 5: Investor Co-Investment Network

**Files:**
- Modify: `backend/routers/investors_leaderboard.py` (add `/investors/network` endpoint)
- Modify: `backend/schemas.py` (add response schemas)
- Create: `frontend/src/views/InvestorNetwork.tsx`
- Modify: `frontend/src/components/Sidebar.tsx`
- Modify: `frontend/src/App.tsx`

### 5a: Backend endpoint

**Step 1: Add schemas to `backend/schemas.py`**

```python
class InvestorNetworkNode(BaseModel):
    id: str
    deal_count: int
    total_capital_usd: int

class InvestorNetworkEdge(BaseModel):
    source: str
    target: str
    weight: int  # number of co-investments

class InvestorNetworkResponse(BaseModel):
    nodes: list[InvestorNetworkNode]
    edges: list[InvestorNetworkEdge]
    date_from: date
    date_to: date
```

**Step 2: Add `GET /investors/network` in `investors_leaderboard.py`**

```python
from backend.schemas import InvestorNetworkNode, InvestorNetworkEdge, InvestorNetworkResponse

@router.get("/investors/network", response_model=InvestorNetworkResponse)
async def investor_network(
    period: str = Query("monthly", description="weekly | monthly | quarterly"),
    min_deals: int = Query(2, description="Min co-investments to include an edge"),
    db: AsyncSession = Depends(get_session),
) -> InvestorNetworkResponse:
    """Return investor co-investment graph edges and nodes."""

    if period not in ("weekly", "monthly", "quarterly"):
        period = "monthly"

    date_from, date_to = _period_dates(period)

    # Build investor pairs from deals with 2+ investors
    edges_stmt = text("""
        SELECT
            LEAST(a.investor, b.investor)    AS source,
            GREATEST(a.investor, b.investor) AS target,
            COUNT(*)::int                    AS weight
        FROM (
            SELECT id, UNNEST(all_investors) AS investor
            FROM deals
            WHERE announced_date >= :date_from
              AND announced_date <= :date_to
              AND array_length(all_investors, 1) >= 2
        ) a
        JOIN (
            SELECT id, UNNEST(all_investors) AS investor
            FROM deals
            WHERE announced_date >= :date_from
              AND announced_date <= :date_to
        ) b ON a.id = b.id AND a.investor < b.investor
        WHERE a.investor <> '' AND b.investor <> ''
        GROUP BY 1, 2
        HAVING COUNT(*) >= :min_deals
        ORDER BY weight DESC
        LIMIT 200
    """)

    edges_result = await db.execute(
        edges_stmt,
        {"date_from": date_from, "date_to": date_to, "min_deals": min_deals},
    )
    edge_rows = edges_result.fetchall()

    # Collect all investor names from edges
    investor_names: set[str] = set()
    edges = []
    for row in edge_rows:
        investor_names.add(row.source)
        investor_names.add(row.target)
        edges.append(InvestorNetworkEdge(
            source=row.source,
            target=row.target,
            weight=row.weight,
        ))

    # Node stats: deal_count + total_capital per investor
    if not investor_names:
        return InvestorNetworkResponse(nodes=[], edges=[], date_from=date_from, date_to=date_to)

    nodes_stmt = text("""
        SELECT
            investor_name,
            COUNT(*)::int                               AS deal_count,
            COALESCE(SUM(amount_usd), 0)::bigint        AS total_capital_usd
        FROM deals,
             UNNEST(all_investors) AS investor_name
        WHERE announced_date >= :date_from
          AND announced_date <= :date_to
          AND investor_name = ANY(:names)
        GROUP BY investor_name
    """)

    nodes_result = await db.execute(
        nodes_stmt,
        {"date_from": date_from, "date_to": date_to, "names": list(investor_names)},
    )
    node_rows = nodes_result.fetchall()

    nodes = [
        InvestorNetworkNode(
            id=row.investor_name,
            deal_count=row.deal_count,
            total_capital_usd=int(row.total_capital_usd),
        )
        for row in node_rows
    ]

    return InvestorNetworkResponse(
        nodes=nodes,
        edges=edges,
        date_from=date_from,
        date_to=date_to,
    )
```

### 5b: Frontend view

**Step 3: Install d3 if not already installed**

```bash
cd frontend && npm list d3 || npm install d3 && npm install --save-dev @types/d3
```

**Step 4: Create `frontend/src/views/InvestorNetwork.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import * as d3 from 'd3'
import { Network } from 'lucide-react'
import LoadingSpinner from '../components/LoadingSpinner'
import ErrorBanner from '../components/ErrorBanner'

interface Node {
  id: string
  deal_count: number
  total_capital_usd: number
  x?: number
  y?: number
  vx?: number
  vy?: number
  fx?: number | null
  fy?: number | null
}

interface Edge {
  source: string | Node
  target: string | Node
  weight: number
}

interface NetworkData {
  nodes: Node[]
  edges: Edge[]
}

const PERIODS = ['weekly', 'monthly', 'quarterly'] as const

export default function InvestorNetwork() {
  const svgRef = useRef<SVGSVGElement>(null)
  const [data, setData] = useState<NetworkData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState<'weekly' | 'monthly' | 'quarterly'>('monthly')

  useEffect(() => {
    setLoading(true)
    setError(null)
    axios
      .get('/api/investors/network', { params: { period, min_deals: 1 } })
      .then((r) => setData(r.data))
      .catch(() => setError('Could not load investor network.'))
      .finally(() => setLoading(false))
  }, [period])

  useEffect(() => {
    if (!data || !svgRef.current) return
    if (data.nodes.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const width = svgRef.current.clientWidth || 800
    const height = svgRef.current.clientHeight || 600

    const g = svg.append('g')

    // Zoom
    svg.call(
      d3.zoom<SVGSVGElement, unknown>().on('zoom', (event) => {
        g.attr('transform', event.transform)
      })
    )

    // Scale node radius by deal_count
    const maxDeals = d3.max(data.nodes, (n) => n.deal_count) || 1
    const r = d3.scaleSqrt().domain([1, maxDeals]).range([5, 20])

    // Scale edge width by weight
    const maxWeight = d3.max(data.edges, (e) => e.weight) || 1
    const strokeW = d3.scaleLinear().domain([1, maxWeight]).range([1, 4])

    const simulation = d3
      .forceSimulation(data.nodes as d3.SimulationNodeDatum[])
      .force('link', d3.forceLink(data.edges).id((d: any) => d.id).distance(80))
      .force('charge', d3.forceManyBody().strength(-120))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius((d: any) => r(d.deal_count) + 4))

    const link = g
      .append('g')
      .selectAll('line')
      .data(data.edges)
      .join('line')
      .attr('stroke', '#3f3f46')
      .attr('stroke-width', (d) => strokeW(d.weight))

    const node = g
      .append('g')
      .selectAll('circle')
      .data(data.nodes)
      .join('circle')
      .attr('r', (d) => r(d.deal_count))
      .attr('fill', '#f59e0b')
      .attr('fill-opacity', 0.8)
      .attr('stroke', '#78716c')
      .attr('stroke-width', 1)
      .call(
        d3
          .drag<SVGCircleElement, Node>()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart()
            d.fx = d.x
            d.fy = d.y
          })
          .on('drag', (event, d) => {
            d.fx = event.x
            d.fy = event.y
          })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0)
            d.fx = null
            d.fy = null
          })
      )

    const label = g
      .append('g')
      .selectAll('text')
      .data(data.nodes.filter((n) => n.deal_count >= 2))
      .join('text')
      .text((d) => d.id)
      .attr('font-size', 10)
      .attr('fill', '#a1a1aa')
      .attr('dy', -8)
      .attr('text-anchor', 'middle')

    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y)

      node.attr('cx', (d: any) => d.x).attr('cy', (d: any) => d.y)

      label.attr('x', (d: any) => d.x).attr('y', (d: any) => d.y)
    })

    return () => simulation.stop()
  }, [data])

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-6 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-zinc-50 flex items-center gap-2">
            <Network size={18} className="text-amber-400" strokeWidth={1.5} />
            Investor Network
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Co-investment relationships — node size = deal count
          </p>
        </div>
        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`text-xs px-3 py-1.5 rounded font-mono transition-colors ${
                period === p
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'text-zinc-500 hover:text-zinc-300 border border-zinc-800'
              }`}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 px-6 pb-6">
        {loading ? (
          <LoadingSpinner />
        ) : error ? (
          <ErrorBanner message={error} />
        ) : !data || data.nodes.length === 0 ? (
          <div className="flex items-center justify-center h-64 bg-zinc-900 border border-zinc-800 rounded-lg">
            <p className="text-zinc-500 text-sm">No co-investment data for this period.</p>
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden h-[600px]">
            <svg ref={svgRef} width="100%" height="100%" />
          </div>
        )}
      </div>
    </div>
  )
}
```

**Step 5: Add route to `App.tsx`**

```tsx
import InvestorNetwork from './views/InvestorNetwork'
// In Routes:
<Route path="/network" element={<InvestorNetwork />} />
```

**Step 6: Add nav item to `Sidebar.tsx`**

```tsx
import { Network } from 'lucide-react'
// In navItems array, add:
{ to: '/network', label: 'Network', icon: Network },
```

**Step 7: Commit**

```bash
git add backend/routers/investors_leaderboard.py backend/schemas.py \
  frontend/src/views/InvestorNetwork.tsx frontend/src/components/Sidebar.tsx \
  frontend/src/App.tsx frontend/package.json frontend/package-lock.json
git commit -m "feat(network): add investor co-investment network graph"
```

---

## Final Deploy

After all 5 tasks:

```bash
railway service deal-radar-app && railway up
```

Verify:
1. `curl /api/deals?q=stripe` → filters by name
2. `curl /api/investors/network?period=monthly` → returns nodes + edges JSON
3. `curl /api/briefing/latest` → `ai_summary` mentions specific company names
4. Open `/network` in browser → force-directed graph renders
5. Trigger a new ingestion → check deal_type distribution improves
