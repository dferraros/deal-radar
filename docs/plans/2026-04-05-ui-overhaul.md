# Deal Radar UI Overhaul Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform Deal Radar from a functional-but-generic dashboard into a visually compelling financial intelligence product that competes with Crunchbase/PitchBook.

**Architecture:** All changes are frontend-only except Task 1 (backend fix). Each task is an independent UI improvement — no shared state changes, no new API endpoints needed. The existing dark zinc palette is kept; we layer amber accents, visual hierarchy, and density improvements on top.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Tremor charts (already installed), D3 (already installed), Axios

---

## Phase 1 — Quick Fixes (Data Quality)

### Task 1: Fix `UNKNOWN` round labels + zero amounts in Deal Feed

**Files:**
- Modify: `frontend/src/views/DealFeed.tsx`

**Context:** The deal table shows `UNKNOWN` for round_label and `$0` for amount_usd=0. Both are noise. Replace with `—` dash.

**Step 1: Find the table row render in DealFeed.tsx**

Search for where `round_label` and `amount_usd` are rendered in the table. They'll be inside a `<tr>` or `<td>` element in the deals table.

**Step 2: Add two small formatter helpers near the top of the file (after imports)**

```tsx
function fmtRound(label: string | null | undefined): string {
  if (!label || label.toUpperCase() === 'UNKNOWN') return '—'
  return label
}

function fmtAmount(usd: number | null | undefined): string {
  if (!usd || usd === 0) return '—'
  const m = usd / 1_000_000
  if (m >= 1000) return `$${(m / 1000).toFixed(1)}B`
  if (m >= 1) return `$${m.toFixed(1)}M`
  return `$${Math.round(usd / 1000)}K`
}
```

**Step 3: Replace raw `deal.round_label` with `fmtRound(deal.round_label)` in the table row**

**Step 4: Replace raw `deal.amount_usd` display with `fmtAmount(deal.amount_usd)`**

**Step 5: Verify locally**
```bash
cd frontend && npm run dev
```
Navigate to `/` — deal rows should show `—` instead of `UNKNOWN` and `$0`.

**Step 6: Commit**
```bash
git add frontend/src/views/DealFeed.tsx
git commit -m "fix(ui): replace UNKNOWN round labels and zero amounts with dash"
```

---

## Phase 2 — Deal Feed Overhaul

### Task 2: KPI bar above the deal table

**Files:**
- Modify: `frontend/src/views/DealFeed.tsx`

**Context:** Bloomberg-style stat bar at the top of the feed showing today's biggest deal, total capital this week, deal count, and top sector. Data already comes from the existing `/api/deals` response + `/api/heatmap?period=weekly` — compute from the loaded deals array locally (no new API call needed).

**Step 1: Add a `useEffect` that derives KPI values from the loaded `deals` array**

After the deals are loaded, compute:
```tsx
const kpis = useMemo(() => {
  if (!deals.length) return null
  const totalCapital = deals.reduce((s, d) => s + (d.amount_usd ?? 0), 0)
  const biggest = deals.reduce((max, d) =>
    (d.amount_usd ?? 0) > (max.amount_usd ?? 0) ? d : max, deals[0])
  const sectorCounts: Record<string, number> = {}
  deals.forEach(d => d.sector?.forEach(s => { sectorCounts[s] = (sectorCounts[s] ?? 0) + 1 }))
  const topSector = Object.entries(sectorCounts).sort(([,a],[,b]) => b-a)[0]?.[0] ?? '—'
  return { totalCapital, biggest, topSector, count: deals.length }
}, [deals])
```

**Step 2: Add the KPI bar JSX above the filter row**

```tsx
{kpis && (
  <div className="grid grid-cols-4 gap-px bg-zinc-800 border border-zinc-800 rounded-lg overflow-hidden mb-4">
    {[
      { label: 'DEALS LOADED', value: String(kpis.count) },
      { label: 'TOTAL CAPITAL', value: fmtAmount(kpis.totalCapital) },
      { label: 'BIGGEST DEAL', value: kpis.biggest?.company_name ?? '—' },
      { label: 'TOP SECTOR', value: kpis.topSector.toUpperCase() },
    ].map(({ label, value }) => (
      <div key={label} className="bg-zinc-950 px-4 py-3">
        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1">{label}</div>
        <div className="text-sm font-semibold text-zinc-100 truncate">{value}</div>
      </div>
    ))}
  </div>
)}
```

**Step 3: Add `useMemo` import if not already present**

```tsx
import { useState, useEffect, useMemo } from 'react'
```

**Step 4: Verify locally** — KPI bar appears above filter row, values update when filters change.

**Step 5: Commit**
```bash
git add frontend/src/views/DealFeed.tsx
git commit -m "feat(ui): add KPI bar above deal feed table"
```

---

### Task 3: Amount-based row visual hierarchy

**Files:**
- Modify: `frontend/src/views/DealFeed.tsx`

**Context:** Deals ≥ $1B should visually stand out. Use a subtle amber left-border accent on table rows with large amounts. This makes the feed scannable like a Bloomberg ticker.

**Step 1: Add a helper to classify deal size**

```tsx
function dealTier(usd: number | null | undefined): 'mega' | 'large' | 'normal' {
  if (!usd) return 'normal'
  if (usd >= 1_000_000_000) return 'mega'   // $1B+
  if (usd >= 100_000_000) return 'large'    // $100M+
  return 'normal'
}
```

**Step 2: Apply conditional classes to the `<tr>` element**

```tsx
const tier = dealTier(deal.amount_usd)
<tr
  className={`
    border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors cursor-pointer
    ${tier === 'mega' ? 'border-l-2 border-l-amber-400/70' : ''}
    ${tier === 'large' ? 'border-l-2 border-l-zinc-600' : ''}
  `}
>
```

**Step 3: Make the amount cell use amber text for mega deals**

```tsx
<td className={`px-4 py-2.5 font-mono text-sm tabular-nums font-semibold
  ${tier === 'mega' ? 'text-amber-400' : 'text-zinc-200'}`}>
  {fmtAmount(deal.amount_usd)}
</td>
```

**Step 4: Verify** — $1B+ deals get amber amount text and amber left border.

**Step 5: Commit**
```bash
git add frontend/src/views/DealFeed.tsx
git commit -m "feat(ui): highlight mega-deals with amber accent and border"
```

---

### Task 4: Sortable columns (Amount + Date)

**Files:**
- Modify: `frontend/src/views/DealFeed.tsx`

**Context:** Add client-side sort on Amount and Date columns. Data is already loaded. No new API call.

**Step 1: Add sort state**

```tsx
type SortKey = 'amount_usd' | 'announced_date' | null
type SortDir = 'asc' | 'desc'
const [sortKey, setSortKey] = useState<SortKey>(null)
const [sortDir, setSortDir] = useState<SortDir>('desc')
```

**Step 2: Add sort logic with `useMemo`**

```tsx
const sortedDeals = useMemo(() => {
  if (!sortKey) return deals
  return [...deals].sort((a, b) => {
    const av = a[sortKey] ?? 0
    const bv = b[sortKey] ?? 0
    const cmp = av < bv ? -1 : av > bv ? 1 : 0
    return sortDir === 'desc' ? -cmp : cmp
  })
}, [deals, sortKey, sortDir])
```

**Step 3: Add a toggle function**

```tsx
function toggleSort(key: SortKey) {
  if (sortKey === key) {
    setSortDir(d => d === 'desc' ? 'asc' : 'desc')
  } else {
    setSortKey(key)
    setSortDir('desc')
  }
}
```

**Step 4: Update table headers for sortable columns**

```tsx
{/* Amount header */}
<th
  className="text-left text-xs uppercase tracking-wider text-zinc-500 px-4 py-3 font-medium cursor-pointer hover:text-zinc-300 select-none"
  onClick={() => toggleSort('amount_usd')}
>
  Amount {sortKey === 'amount_usd' ? (sortDir === 'desc' ? '↓' : '↑') : '↕'}
</th>

{/* Date header */}
<th
  className="text-left text-xs uppercase tracking-wider text-zinc-500 px-4 py-3 font-medium cursor-pointer hover:text-zinc-300 select-none"
  onClick={() => toggleSort('announced_date')}
>
  Date {sortKey === 'announced_date' ? (sortDir === 'desc' ? '↓' : '↑') : '↕'}
</th>
```

**Step 5: Use `sortedDeals` instead of `deals` when rendering rows**

**Step 6: Verify** — clicking Amount sorts descending first, clicking again reverses.

**Step 7: Commit**
```bash
git add frontend/src/views/DealFeed.tsx
git commit -m "feat(ui): sortable amount and date columns in deal feed"
```

---

### Task 5: Company favicons in deal rows

**Files:**
- Modify: `frontend/src/views/DealFeed.tsx`

**Context:** Google's Favicon API returns 16x16 favicons for any domain. Use `company.website` or derive domain from `source_url`. Shows logos like Crunchbase does.

**Step 1: Add a favicon helper**

```tsx
function getFaviconUrl(website: string | null | undefined, sourceUrl: string | null | undefined): string | null {
  const url = website || sourceUrl
  if (!url) return null
  try {
    const domain = new URL(url.startsWith('http') ? url : `https://${url}`).hostname
    return `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=32`
  } catch {
    return null
  }
}
```

**Step 2: Add favicon to the company name cell**

```tsx
const favicon = getFaviconUrl(deal.company?.website, deal.source_url)

<td className="px-4 py-2.5">
  <div className="flex items-center gap-2">
    {favicon && (
      <img
        src={favicon}
        alt=""
        className="w-4 h-4 rounded-sm opacity-80 flex-shrink-0"
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
      />
    )}
    <span className="font-medium text-zinc-100">{deal.company_name}</span>
  </div>
</td>
```

**Step 3: Verify** — company logos appear for rows with known websites. `onError` hides broken images silently.

**Step 4: Commit**
```bash
git add frontend/src/views/DealFeed.tsx
git commit -m "feat(ui): add company favicons to deal feed rows"
```

---

### Task 6: Source badge pills (colored)

**Files:**
- Modify: `frontend/src/views/DealFeed.tsx`

**Context:** Currently sources show as plain gray text (`tavily`, `rss`). Make them colored pills to signal data provenance at a glance.

**Step 1: Add a source color map**

```tsx
const SOURCE_COLORS: Record<string, string> = {
  crunchbase: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  tavily:     'bg-violet-500/15 text-violet-400 border-violet-500/30',
  rss:        'bg-zinc-700/50 text-zinc-400 border-zinc-600',
  firecrawl:  'bg-orange-500/15 text-orange-400 border-orange-500/30',
  manual:     'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
}

function SourceBadge({ source }: { source: string | null }) {
  if (!source) return null
  const cls = SOURCE_COLORS[source.toLowerCase()] ?? SOURCE_COLORS.rss
  return (
    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${cls}`}>
      {source.toLowerCase()}
    </span>
  )
}
```

**Step 2: Replace raw source text in the table with `<SourceBadge source={deal.source_name} />`**

**Step 3: Verify** — crunchbase=blue, tavily=violet, rss=zinc, etc.

**Step 4: Commit**
```bash
git add frontend/src/views/DealFeed.tsx
git commit -m "feat(ui): colored source badge pills in deal feed"
```

---

## Phase 3 — Visual Identity

### Task 7: Sidebar branding + active nav state

**Files:**
- Modify: `frontend/src/components/Sidebar.tsx`

**Context:** The sidebar shows "DEAL RADAR" and "Intelligence Platform" without visual punch. Add an amber accent line under the logo, tighten the nav, and add an active state indicator.

**Step 1: Read `frontend/src/components/Sidebar.tsx` fully before editing**

**Step 2: Update the logo section — add amber accent bar**

```tsx
{/* Logo block */}
<div className="px-4 pt-5 pb-4 border-b border-zinc-800">
  <div className="flex items-center gap-2 mb-0.5">
    <div className="w-1.5 h-5 bg-amber-400 rounded-full" />   {/* amber accent bar */}
    <span className="text-sm font-bold tracking-tight text-zinc-50 font-mono">DEAL RADAR</span>
  </div>
  <p className="text-[10px] text-zinc-600 tracking-wider uppercase ml-3.5">Intelligence Platform</p>
</div>
```

**Step 3: Update nav link active state to use amber left border**

Find where `NavLink` or `Link` active classes are set. Replace with:
```tsx
// Active state: amber left border + slightly brighter text
const activeClass = "flex items-center gap-2.5 px-3 py-1.5 rounded text-xs font-medium border-l-2 border-amber-400 bg-amber-400/5 text-zinc-100"
const inactiveClass = "flex items-center gap-2.5 px-3 py-1.5 rounded text-xs font-medium border-l-2 border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
```

**Step 4: Commit**
```bash
git add frontend/src/components/Sidebar.tsx
git commit -m "feat(ui): amber accent bar + active nav state in sidebar"
```

---

### Task 8: Sector filter as scrollable pill row

**Files:**
- Modify: `frontend/src/views/DealFeed.tsx`

**Context:** The sector filter is currently an opaque "All sectors" button. Replace with a scrollable horizontal pill row showing each sector (from the sectors API), matching the deal type pill buttons. Unifies the filter UX.

**Step 1: Add sectors state (likely already fetched — check existing code)**

If not already present:
```tsx
const [sectors, setSectors] = useState<string[]>([])
useEffect(() => {
  axios.get('/api/deals/sectors').then(r => setSectors(r.data.sectors ?? []))
}, [])
```

**Step 2: Replace the sector button/dropdown with a pill row**

```tsx
<div className="flex gap-1 overflow-x-auto scrollbar-none">
  {['all', ...sectors].map((s) => (
    <button
      key={s}
      onClick={() => setSector(s === 'all' ? null : s)}
      className={`px-2.5 py-1 rounded text-xs font-mono whitespace-nowrap transition-colors flex-shrink-0 ${
        (s === 'all' && !sector) || sector === s
          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
          : 'text-zinc-500 hover:text-zinc-300 border border-zinc-800'
      }`}
    >
      {s === 'all' ? 'All' : s.toUpperCase()}
    </button>
  ))}
</div>
```

**Step 3: Verify** — sector pills scroll horizontally if many. Clicking highlights amber, clicking "All" clears.

**Step 4: Commit**
```bash
git add frontend/src/views/DealFeed.tsx
git commit -m "feat(ui): sector filter as amber pill row (matches type filter)"
```

---

## Phase 4 — Heatmap Improvements

### Task 9: Heatmap hover tooltip

**Files:**
- Modify: `frontend/src/views/Heatmap.tsx`

**Context:** Cells currently show capital + deal count but no hover interaction. Add a tooltip that appears on hover with formatted details.

**Step 1: Read `frontend/src/views/Heatmap.tsx` fully**

**Step 2: Add hover state**

```tsx
const [tooltip, setTooltip] = useState<{
  sector: string; geo: string; capital: number; deals: number;
  x: number; y: number
} | null>(null)
```

**Step 3: Add onMouseEnter / onMouseLeave to each heatmap cell**

```tsx
<td
  onMouseEnter={(e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setTooltip({ sector, geo, capital: cell.total_capital_usd, deals: cell.deal_count, x: rect.left, y: rect.top })
  }}
  onMouseLeave={() => setTooltip(null)}
>
```

**Step 4: Add tooltip overlay (absolute positioned, portal not needed)**

```tsx
{tooltip && (
  <div
    className="fixed z-50 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl px-3 py-2 pointer-events-none text-xs"
    style={{ left: tooltip.x + 8, top: tooltip.y - 60 }}
  >
    <div className="font-semibold text-zinc-100 mb-1">{tooltip.sector} × {tooltip.geo}</div>
    <div className="text-zinc-300">{fmtCapital(tooltip.capital)} · {tooltip.deals} deals</div>
  </div>
)}
```

**Step 5: Verify** — hovering a cell shows tooltip with sector, geo, capital, deal count.

**Step 6: Commit**
```bash
git add frontend/src/views/Heatmap.tsx
git commit -m "feat(ui): hover tooltip on heatmap cells"
```

---

### Task 10: Heatmap cell click → filtered deal list

**Files:**
- Modify: `frontend/src/views/Heatmap.tsx`

**Context:** Clicking a cell should open a modal showing the deals that make up that cell. Uses the existing `/api/deals?sector=X&geo=Y` endpoint.

**Step 1: Add modal state**

```tsx
const [drilldown, setDrilldown] = useState<{ sector: string; geo: string } | null>(null)
const [drillDeals, setDrillDeals] = useState<any[]>([])
const [drillLoading, setDrillLoading] = useState(false)
```

**Step 2: Fetch on cell click**

```tsx
function handleCellClick(sector: string, geo: string) {
  setDrilldown({ sector, geo })
  setDrillLoading(true)
  axios.get('/api/deals', { params: { sector, geo, limit: 50 } })
    .then(r => setDrillDeals(r.data.deals ?? []))
    .finally(() => setDrillLoading(false))
}
```

**Step 3: Add click handler to cells** — `onClick={() => handleCellClick(sector, geo)}` + `cursor-pointer` class

**Step 4: Add modal JSX** (at bottom of return, before closing div)

```tsx
{drilldown && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setDrilldown(null)}>
    <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-2xl max-h-[80vh] overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
        <h3 className="font-semibold text-zinc-100">
          {drilldown.sector.toUpperCase()} · {drilldown.geo.toUpperCase()}
        </h3>
        <button onClick={() => setDrilldown(null)} className="text-zinc-500 hover:text-zinc-200">✕</button>
      </div>
      <div className="overflow-y-auto max-h-[60vh] divide-y divide-zinc-800">
        {drillLoading ? (
          <div className="p-8 text-center text-zinc-500 text-sm">Loading...</div>
        ) : drillDeals.length === 0 ? (
          <div className="p-8 text-center text-zinc-500 text-sm">No deals found</div>
        ) : drillDeals.map(d => (
          <div key={d.id} className="px-5 py-3 hover:bg-zinc-800/40">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-zinc-100">{d.company_name}</span>
              <span className="text-sm font-mono text-amber-400">{fmtCapital(d.amount_usd)}</span>
            </div>
            <div className="text-xs text-zinc-500 mt-0.5">{d.round_label || d.deal_type} · {d.announced_date}</div>
          </div>
        ))}
      </div>
    </div>
  </div>
)}
```

**Step 5: Add `fmtCapital` helper to Heatmap.tsx** (copy from DealFeed or extract to a shared utils file)

**Step 6: Verify** — clicking a colored cell opens modal with deals, clicking backdrop closes it.

**Step 7: Commit**
```bash
git add frontend/src/views/Heatmap.tsx
git commit -m "feat(ui): heatmap cell click opens deal drill-down modal"
```

---

## Phase 5 — Tech Intel Onboarding

### Task 11: Intel Queue empty state with onboarding guidance

**Files:**
- Modify: `frontend/src/views/IntelQueue.tsx`

**Context:** The empty queue state just shows the heading and 3 buttons. Add a descriptive empty state that explains the feature and shows example companies to add.

**Step 1: Read `frontend/src/views/IntelQueue.tsx` fully**

**Step 2: Find the empty state condition** — when `queue.length === 0` after loading, render this instead:

```tsx
{!loading && queue.length === 0 && (
  <div className="mt-8 flex flex-col items-center text-center max-w-lg mx-auto">
    <div className="w-12 h-12 rounded-full bg-amber-400/10 flex items-center justify-center mb-4">
      <Brain size={24} className="text-amber-400" />
    </div>
    <h3 className="text-zinc-100 font-semibold mb-2">No companies analyzed yet</h3>
    <p className="text-zinc-500 text-sm mb-6 leading-relaxed">
      Add a funded company to infer which technical primitives they actually build on —
      from their product pages, docs, blog, and careers listings.
      Capital-weighted across the portfolio.
    </p>
    <div className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Try these examples</p>
      <div className="grid grid-cols-1 gap-2">
        {[
          { name: 'Mistral AI', website: 'https://mistral.ai' },
          { name: 'Cohere', website: 'https://cohere.com' },
          { name: 'Scale AI', website: 'https://scale.com' },
        ].map(({ name, website }) => (
          <button
            key={name}
            onClick={() => {
              setModalCompanyName(name)
              setModalWebsite(website)
              setModalOpen(true)
            }}
            className="flex items-center justify-between px-3 py-2 rounded bg-zinc-800 hover:bg-zinc-700 transition-colors text-left"
          >
            <span className="text-sm text-zinc-200">{name}</span>
            <span className="text-xs text-zinc-500">{website}</span>
          </button>
        ))}
      </div>
    </div>
  </div>
)}
```

Note: `setModalCompanyName`, `setModalWebsite`, `setModalOpen` are the modal state variables — check the actual names used in the file and match them.

**Step 3: Verify** — empty queue shows guidance with example companies. Clicking an example pre-fills the add modal.

**Step 4: Commit**
```bash
git add frontend/src/views/IntelQueue.tsx
git commit -m "feat(ui): Intel queue empty state with example companies"
```

---

### Task 12: "Analyze with Intel" button on each deal row

**Files:**
- Modify: `frontend/src/views/DealFeed.tsx`
- Modify: `frontend/src/views/IntelQueue.tsx` (export or expose an add function — actually not needed, just navigate)

**Context:** Each deal row in the feed should have a small "→ Intel" action button that one-click adds the company to the Intel queue. Uses `POST /api/intel/queue` directly.

**Step 1: Add an `addToIntel` function in DealFeed.tsx**

```tsx
async function addToIntel(companyName: string, website: string | null) {
  if (!website) return
  try {
    await axios.post('/api/intel/queue', {
      company_name: companyName,
      website: website,
    })
    // Navigate to intel queue to see it
    window.location.href = '/intel'
  } catch (e) {
    console.error('Failed to add to intel queue', e)
  }
}
```

**Step 2: Add the button to each deal row** (in the last column or as a hover action)

```tsx
{/* Actions column — show on row hover */}
<td className="px-2 py-2 opacity-0 group-hover:opacity-100 transition-opacity">
  {deal.company?.website && (
    <button
      onClick={(e) => {
        e.stopPropagation()
        addToIntel(deal.company_name ?? '', deal.company?.website ?? null)
      }}
      title="Analyze with Tech Intel"
      className="text-[10px] font-mono px-2 py-1 rounded border border-zinc-700 text-zinc-500 hover:text-amber-400 hover:border-amber-500/50 transition-colors whitespace-nowrap"
    >
      + Intel
    </button>
  )}
</td>
```

**Step 3: Add `group` class to the `<tr>` element** so `group-hover:opacity-100` works.

**Step 4: Add the Actions column header**

```tsx
<th className="px-2 py-3 text-xs text-zinc-600 font-medium"></th>
```

**Step 5: Verify** — hovering a deal row reveals `+ Intel` button. Clicking it POSTs to the queue and navigates to `/intel`.

**Step 6: Commit**
```bash
git add frontend/src/views/DealFeed.tsx
git commit -m "feat(ui): + Intel quick-add button on deal feed rows"
```

---

## Deployment

After all tasks are committed:

```bash
cd /path/to/deal-radar
railway up --detach
```

Wait ~2 minutes for build + deploy. Verify at `https://deal-radar-app-production.up.railway.app`.

---

## Verification Checklist

- [ ] Deal table rows show `—` instead of `UNKNOWN` and `$0`
- [ ] KPI bar shows totals above the filter row
- [ ] $1B+ deals have amber amount text and left border accent
- [ ] Clicking Amount/Date header sorts the visible rows
- [ ] Company favicons appear (16×16) in company name column
- [ ] Source badges are colored pills (violet=tavily, zinc=rss, blue=crunchbase)
- [ ] Sidebar has amber accent bar and amber active nav highlight
- [ ] Sector filter is a scrollable horizontal pill row
- [ ] Heatmap cells show tooltip on hover
- [ ] Clicking a heatmap cell opens deal list modal
- [ ] Intel empty state shows onboarding card with example companies
- [ ] Deal rows show `+ Intel` button on hover
