# Phase 8: Dark SaaS Premium UI Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform Deal Radar from a generic admin dashboard into a polished Dark SaaS Premium product — semantic color system, deal feed hero strip, command palette, upgraded charts, company timeline.

**Architecture:** Purely frontend — all changes are in `frontend/src/`. No backend changes. No new API endpoints. All new visual logic (color scales, momentum dots, pills) lives in the components that render them. Design tokens live in `tailwind.config.js` and `index.css`.

**Tech Stack:** React 18, Vite, Tailwind CSS 3, Tremor 3, D3 7, lucide-react, axios

**Design doc:** `docs/plans/2026-04-05-phase8-ui-redesign-design.md`

---

## Context for the implementer

Deal Radar is a financial intelligence dashboard. The codebase is at `deal-radar/frontend/src/`.

Key existing files you will modify:
- `frontend/src/components/Sidebar.tsx` — left nav (220px fixed)
- `frontend/src/components/Layout.tsx` — wraps all views with Sidebar + `<Outlet />`
- `frontend/src/components/Navbar.tsx` — TOP navbar (will be REMOVED from Layout, file kept)
- `frontend/src/components/HeatmapGrid.tsx` — renders the sector×geo heatmap cells
- `frontend/src/components/FilterBar.tsx` — deal type / sector / geo dropdowns
- `frontend/src/views/DealFeed.tsx` — main deal table view (homepage `/`)
- `frontend/src/views/Trends.tsx` — Tremor line + bar charts
- `frontend/src/views/InvestorLeaderboard.tsx` — investor ranking table
- `frontend/src/views/InvestorNetwork.tsx` — D3 force graph
- `frontend/src/views/CompanyProfile.tsx` — company detail page
- `frontend/src/views/Alerts.tsx` — alert rule management
- `frontend/src/views/Watchlist.tsx` — pinned companies

After every task: run `cd frontend && npm run build` and confirm it exits with `✓ built in`.

---

## Task 1: Design tokens — Tailwind config + CSS utilities

**Files:**
- Modify: `frontend/tailwind.config.js`
- Modify: `frontend/src/index.css`

**Step 1: Update tailwind.config.js**

Replace entire file content:

```js
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./node_modules/@tremor/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Semantic deal-type signals
        'signal-vc':     '#34d399', // emerald-400
        'signal-crypto': '#a78bfa', // violet-400
        'signal-ma':     '#38bdf8', // sky-400
        'signal-ipo':    '#fb7185', // rose-400
      },
      dropShadow: {
        'amount': '0 0 8px rgba(52, 211, 153, 0.4)',
      },
    },
  },
  plugins: [require("@tailwindcss/forms")],
};
```

**Step 2: Update index.css**

Replace entire file content:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  background-color: #09090b;
  color: #fafafa;
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
}

.mono {
  font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
}

/* Tabular numbers — all numeric columns align perfectly */
.tabular {
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum";
}

/* Emerald glow for large amounts */
.amount-glow {
  filter: drop-shadow(0 0 8px rgba(52, 211, 153, 0.45));
}
```

**Step 3: Build check**

```bash
cd frontend && npm run build
```
Expected: `✓ built in`

**Step 4: Commit**

```bash
git add frontend/tailwind.config.js frontend/src/index.css
git commit -m "feat(phase8): add design tokens — semantic signal colors + tabular/glow utilities"
```

---

## Task 2: Sidebar upgrade + remove Navbar from Layout

**Files:**
- Modify: `frontend/src/components/Sidebar.tsx`
- Modify: `frontend/src/components/Layout.tsx`

### Step 1: Rewrite Sidebar.tsx

Replace entire file:

```tsx
import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Grid3X3,
  TrendingUp,
  Users,
  Network,
  Star,
  Bell,
  Settings,
  Radio,
} from 'lucide-react'
import axios from 'axios'

const navItems = [
  { to: '/', label: 'Deal Feed', icon: LayoutDashboard, end: true },
  { to: '/heatmap', label: 'Heatmap', icon: Grid3X3 },
  { to: '/trends', label: 'Trends', icon: TrendingUp },
  { to: '/investors', label: 'Investors', icon: Users },
  { to: '/network', label: 'Network', icon: Network },
  { to: '/alerts', label: 'Alerts', icon: Bell },
  { to: '/watchlist', label: 'Watchlist', icon: Star },
]

interface SidebarCounts {
  alerts: number
  watchlist: number
}

export default function Sidebar() {
  const [lastSync, setLastSync] = useState<string>('')
  const [ingesting, setIngesting] = useState(false)
  const [counts, setCounts] = useState<SidebarCounts>({ alerts: 0, watchlist: 0 })

  useEffect(() => {
    // Last sync time
    axios.get('/api/admin/runs').then((r) => {
      const latest = r.data?.[0]
      if (latest?.run_at) {
        const d = new Date(latest.run_at)
        setLastSync(
          d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
        )
      }
    }).catch(() => {})

    // Badge counts
    axios.get('/api/alerts').then((r) => {
      setCounts((c) => ({ ...c, alerts: (r.data || []).filter((a: any) => a.is_active).length }))
    }).catch(() => {})
    axios.get('/api/watchlist').then((r) => {
      setCounts((c) => ({ ...c, watchlist: (r.data || []).length }))
    }).catch(() => {})
  }, [])

  // Poll for active ingestion run every 10s
  useEffect(() => {
    const check = () => {
      axios.get('/api/admin/runs?limit=1').then((r) => {
        const run = r.data?.[0]
        setIngesting(run?.status === 'running')
      }).catch(() => {})
    }
    check()
    const id = setInterval(check, 10_000)
    return () => clearInterval(id)
  }, [])

  return (
    <aside className="fixed top-0 left-0 h-screen w-[220px] bg-zinc-900 border-r border-zinc-800 flex flex-col z-10">
      {/* Global pulse bar — top 2px */}
      <div
        className={`absolute top-0 left-0 right-0 h-[2px] ${
          ingesting
            ? 'bg-amber-400 animate-pulse'
            : 'bg-amber-400/40'
        }`}
      />

      {/* Brand */}
      <div className="px-5 pt-6 pb-5 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Radio size={14} className="text-amber-400" strokeWidth={1.5} />
          <div className="text-amber-400 font-mono font-bold tracking-widest text-sm">
            DEAL RADAR
          </div>
        </div>
        <div className="text-zinc-600 text-xs mt-0.5 pl-[22px]">Intelligence Platform</div>
      </div>

      {/* Cmd+K hint */}
      <div className="px-5 pt-3 pb-1">
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('open-command-palette'))}
          className="w-full flex items-center justify-between bg-zinc-800/60 border border-zinc-700/60 rounded-md px-3 py-1.5 text-xs text-zinc-500 hover:border-zinc-600 hover:text-zinc-400 transition-colors"
        >
          <span>Search...</span>
          <span className="font-mono text-[10px] bg-zinc-700/60 px-1.5 py-0.5 rounded">⌘K</span>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 space-y-0.5">
        {navItems.map(({ to, label, icon: Icon, end }) => {
          const badge =
            label === 'Alerts' ? counts.alerts :
            label === 'Watchlist' ? counts.watchlist : 0

          return (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors group ${
                  isActive
                    ? 'border-l-2 border-amber-400 bg-amber-400/5 text-zinc-50 pl-[10px]'
                    : 'text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800/50 border-l-2 border-transparent'
                }`
              }
            >
              <div className="flex items-center gap-3">
                <Icon size={16} strokeWidth={1.5} />
                {label}
              </div>
              {badge > 0 && (
                <span className="text-[10px] font-mono bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded-full border border-amber-500/30">
                  {badge}
                </span>
              )}
            </NavLink>
          )
        })}
      </nav>

      {/* Admin link */}
      <div className="px-3 pb-2">
        <NavLink
          to="/admin"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2 rounded-md text-xs transition-colors border-l-2 ${
              isActive
                ? 'border-amber-400 bg-amber-400/5 text-zinc-50 pl-[10px]'
                : 'border-transparent text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800/50'
            }`
          }
        >
          <Settings size={14} strokeWidth={1.5} />
          Admin
        </NavLink>
      </div>

      {/* Status */}
      <div className="px-5 py-4 border-t border-zinc-800">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full ${
              ingesting ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'
            }`}
          />
          <span className="text-xs font-mono text-zinc-500">
            {ingesting ? 'SYNCING' : `LIVE${lastSync ? ` · ${lastSync}` : ''}`}
          </span>
        </div>
      </div>
    </aside>
  )
}
```

### Step 2: Update Layout.tsx — remove Navbar

Replace entire file:

```tsx
import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import CommandPalette from './CommandPalette'

export default function Layout() {
  return (
    <div className="flex min-h-screen bg-zinc-950">
      <Sidebar />
      <main className="ml-[220px] flex-1 min-h-screen overflow-auto">
        <Outlet />
      </main>
      <CommandPalette />
    </div>
  )
}
```

Note: `CommandPalette` is created in Task 3. If you need to build before Task 3, temporarily remove it.

**Step 3: Build check**

```bash
cd frontend && npm run build
```
Expected: `✓ built in` (will fail if CommandPalette not yet created — do Task 3 first)

**Step 4: Commit**

```bash
git add frontend/src/components/Sidebar.tsx frontend/src/components/Layout.tsx
git commit -m "feat(phase8): upgrade sidebar — brand mark, active amber border, live badges, pulse bar"
```

---

## Task 3: Command Palette (Cmd+K)

**Files:**
- Create: `frontend/src/components/CommandPalette.tsx`

**Step 1: Create CommandPalette.tsx**

```tsx
import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { Search, LayoutDashboard, TrendingUp, Grid3X3, Users, Network, Bell, Star } from 'lucide-react'

interface DealResult {
  id: string
  company_id: string | null
  company_name: string | null
  deal_type: string | null
  amount_usd: number | null
  round_label: string | null
}

const VIEWS = [
  { label: 'Deal Feed', path: '/', icon: LayoutDashboard },
  { label: 'Trends', path: '/trends', icon: TrendingUp },
  { label: 'Heatmap', path: '/heatmap', icon: Grid3X3 },
  { label: 'Investors', path: '/investors', icon: Users },
  { label: 'Network', path: '/network', icon: Network },
  { label: 'Alerts', path: '/alerts', icon: Bell },
  { label: 'Watchlist', path: '/watchlist', icon: Star },
]

function formatAmount(usd: number | null): string {
  if (!usd) return ''
  const m = usd / 1_000_000
  return m >= 1000 ? `$${(m / 1000).toFixed(1)}B` : `$${m.toFixed(1)}M`
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [deals, setDeals] = useState<DealResult[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  // Open on Cmd+K / Ctrl+K and on custom event from sidebar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    const onCustom = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('open-command-palette', onCustom)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('open-command-palette', onCustom)
    }
  }, [])

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
      setQuery('')
      setDeals([])
    }
  }, [open])

  // Search deals debounced
  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      setDeals([])
      return
    }
    setLoading(true)
    const timer = setTimeout(() => {
      axios
        .get('/api/deals', { params: { q: query, limit: 6 } })
        .then((r) => setDeals(r.data?.deals || []))
        .catch(() => setDeals([]))
        .finally(() => setLoading(false))
    }, 250)
    return () => clearTimeout(timer)
  }, [query])

  const filteredViews = query.trim()
    ? VIEWS.filter((v) => v.label.toLowerCase().includes(query.toLowerCase()))
    : VIEWS

  function go(path: string) {
    navigate(path)
    setOpen(false)
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/60 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800">
          <Search size={16} className="text-zinc-500 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search companies or navigate..."
            className="flex-1 bg-transparent text-zinc-100 placeholder-zinc-600 text-sm outline-none"
          />
          <span className="text-[10px] font-mono text-zinc-600 bg-zinc-800 px-1.5 py-0.5 rounded">ESC</span>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto">
          {/* Company matches */}
          {deals.length > 0 && (
            <div>
              <div className="px-4 py-1.5 text-[10px] uppercase tracking-widest text-zinc-600 font-mono">
                Companies
              </div>
              {deals.map((d) => (
                <button
                  key={d.id}
                  onClick={() => d.company_id && go(`/company/${d.company_id}`)}
                  className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-zinc-800 text-left transition-colors"
                >
                  <span className="text-sm text-zinc-200">{d.company_name}</span>
                  <div className="flex items-center gap-2">
                    {d.amount_usd && (
                      <span className="text-xs font-mono text-emerald-400">
                        {formatAmount(d.amount_usd)}
                      </span>
                    )}
                    {d.round_label && (
                      <span className="text-[10px] font-mono text-zinc-500 uppercase">
                        {d.round_label}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* View shortcuts */}
          {filteredViews.length > 0 && (
            <div>
              <div className="px-4 py-1.5 text-[10px] uppercase tracking-widest text-zinc-600 font-mono">
                Navigate
              </div>
              {filteredViews.map((v) => (
                <button
                  key={v.path}
                  onClick={() => go(v.path)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-800 text-left transition-colors"
                >
                  <v.icon size={14} className="text-zinc-500" strokeWidth={1.5} />
                  <span className="text-sm text-zinc-300">{v.label}</span>
                </button>
              ))}
            </div>
          )}

          {loading && (
            <div className="px-4 py-4 text-xs text-zinc-600 text-center">Searching...</div>
          )}

          {!loading && query.length >= 2 && deals.length === 0 && filteredViews.length === 0 && (
            <div className="px-4 py-4 text-xs text-zinc-600 text-center">No results for "{query}"</div>
          )}
        </div>
      </div>
    </div>
  )
}
```

**Step 2: Build check**

```bash
cd frontend && npm run build
```
Expected: `✓ built in`

**Step 3: Commit**

```bash
git add frontend/src/components/CommandPalette.tsx frontend/src/components/Layout.tsx
git commit -m "feat(phase8): add command palette (Cmd+K) — company search + view navigation"
```

---

## Task 4: Deal Feed — Hero strip + Hero deal cards

**Files:**
- Modify: `frontend/src/views/DealFeed.tsx`

### Context

The current view has a briefing text banner + 3 small KPI cards (`bg-zinc-900 border border-zinc-800 rounded-lg`). Replace this entire section with:
1. A "Today at a Glance" horizontal strip
2. 3 hero deal cards showing today's top 3 deals by amount

### Step 1: Add helper constants and functions near the top of DealFeed.tsx

Add these after the existing `formatAmount` / `formatCapital` functions:

```tsx
const GEO_FLAGS: Record<string, string> = {
  latam: '🌎', spain: '🇪🇸', europe: '🇪🇺', us: '🇺🇸',
  asia: '🌏', africa: '🌍', mena: '🕌', global: '🌐',
}

const DEAL_TYPE_COLORS: Record<string, string> = {
  vc:      'border-emerald-500 bg-emerald-500/5',
  crypto:  'border-violet-500 bg-violet-500/5',
  ma:      'border-sky-500 bg-sky-500/5',
  ipo:     'border-rose-500 bg-rose-500/5',
  unknown: 'border-zinc-700 bg-zinc-900',
}

const SECTOR_PILL_COLORS: Record<string, string> = {
  crypto:    'bg-violet-500/15 text-violet-300 border-violet-500/30',
  fintech:   'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  saas:      'bg-sky-500/15 text-sky-300 border-sky-500/30',
  healthtech:'bg-rose-500/15 text-rose-300 border-rose-500/30',
  edtech:    'bg-amber-500/15 text-amber-300 border-amber-500/30',
  proptech:  'bg-orange-500/15 text-orange-300 border-orange-500/30',
  other:     'bg-zinc-500/15 text-zinc-400 border-zinc-600/30',
}

function SectorPill({ sector }: { sector: string }) {
  const cls = SECTOR_PILL_COLORS[sector.toLowerCase()] ?? SECTOR_PILL_COLORS['other']
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-mono uppercase tracking-wide ${cls}`}>
      {sector}
    </span>
  )
}

function MomentumDots({ count }: { count: number }) {
  const filled = Math.min(count, 6)
  return (
    <div className="flex gap-0.5 items-center" title={`${count} funding round${count !== 1 ? 's' : ''}`}>
      {Array.from({ length: 6 }).map((_, i) => (
        <span
          key={i}
          className={`w-1.5 h-1.5 rounded-full transition-colors ${
            i < filled ? 'bg-emerald-400' : 'bg-zinc-800'
          }`}
        />
      ))}
    </div>
  )
}
```

### Step 2: Replace the briefing banner + KPI cards section in the render

Find the section that starts with `{briefing && (` and ends with the closing `</div>` of the 3-card KPI grid. Replace it entirely with:

```tsx
{/* === TODAY AT A GLANCE STRIP === */}
<div className="px-6 pb-4">
  <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-5 py-3 flex items-center gap-6 flex-wrap">
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono mb-0.5">Capital This Week</span>
      <span className="font-mono text-2xl font-bold tabular text-emerald-400 amount-glow">
        {loading ? '—' : formatCapital(weekCapital)}
      </span>
    </div>
    <div className="w-px h-8 bg-zinc-800" />
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono mb-0.5">Deals</span>
      <span className="font-mono text-2xl font-bold tabular text-zinc-50">
        {loading ? '—' : weekDeals.length}
      </span>
    </div>
    <div className="w-px h-8 bg-zinc-800" />
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono mb-0.5">Top Sector</span>
      <span className="font-mono text-lg font-bold text-zinc-50 capitalize">
        {loading ? '—' : (topSector ?? '—')}
      </span>
    </div>
    {briefing?.top_company && briefing?.top_amount_usd && (
      <>
        <div className="w-px h-8 bg-zinc-800" />
        <div className="flex flex-col min-w-0">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono mb-0.5">🔥 Biggest</span>
          <span className="text-sm font-semibold text-zinc-100 truncate max-w-[180px]">
            {briefing.top_company}
            <span className="text-emerald-400 font-mono ml-2">{formatCapital(briefing.top_amount_usd)}</span>
          </span>
        </div>
      </>
    )}
    {briefing?.ai_summary && (
      <>
        <div className="w-px h-8 bg-zinc-800 hidden xl:block" />
        <div className="flex-1 min-w-0 hidden xl:block">
          <span className="text-[10px] uppercase tracking-wider text-zinc-600 font-mono block mb-0.5">AI Briefing</span>
          <p className="text-xs text-zinc-400 truncate">{briefing.ai_summary}</p>
        </div>
      </>
    )}
  </div>
</div>

{/* === HERO DEAL CARDS — top 3 today by amount === */}
{(() => {
  const topDeals = [...deals]
    .filter((d) => d.amount_usd && d.amount_usd > 0)
    .sort((a, b) => (b.amount_usd ?? 0) - (a.amount_usd ?? 0))
    .slice(0, 3)
  if (topDeals.length === 0) return null
  return (
    <div className="px-6 pb-4 grid grid-cols-3 gap-3">
      {topDeals.map((deal) => {
        const typeKey = deal.deal_type ?? 'unknown'
        const borderColor = DEAL_TYPE_COLORS[typeKey] ?? DEAL_TYPE_COLORS['unknown']
        return (
          <div
            key={deal.id}
            onClick={() => deal.company_id && navigate(`/company/${deal.company_id}`)}
            className={`border-l-4 ${borderColor} bg-zinc-900 border border-zinc-800 rounded-xl p-4 cursor-pointer hover:bg-zinc-800/70 transition-colors`}
          >
            <div className="text-xs font-mono uppercase tracking-wider text-zinc-500 mb-1">
              {deal.round_label || deal.deal_type || 'Deal'}
              {deal.geo && (
                <span className="ml-2">{GEO_FLAGS[deal.geo] ?? ''}</span>
              )}
            </div>
            <div className="text-base font-semibold text-zinc-100 truncate mb-1">
              {deal.company_name ?? '—'}
            </div>
            <div className="font-mono text-2xl font-bold text-emerald-400 amount-glow mb-2">
              {deal.amount_usd ? formatAmount(deal.amount_usd) : '—'}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {(deal.sector || []).slice(0, 2).map((s) => (
                <SectorPill key={s} sector={s} />
              ))}
            </div>
            {deal.lead_investor && (
              <div className="text-[11px] text-zinc-500 mt-2 truncate">
                {deal.lead_investor}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
})()}
```

**Step 3: Build check**

```bash
cd frontend && npm run build
```
Expected: `✓ built in`

**Step 4: Commit**

```bash
git add frontend/src/views/DealFeed.tsx
git commit -m "feat(phase8): deal feed hero strip + top-3 hero deal cards"
```

---

## Task 5: Deal table upgrades — borders, amount intensity, momentum, pills, geo flags

**Files:**
- Modify: `frontend/src/views/DealFeed.tsx` (the `<tbody>` section)

### Step 1: Add amount intensity helper

Add this function near the other helpers in DealFeed.tsx:

```tsx
function getAmountIntensityClass(amount: number | null, maxAmount: number): string {
  if (!amount || maxAmount === 0) return ''
  const ratio = amount / maxAmount
  if (ratio > 0.8) return 'bg-emerald-950/70'
  if (ratio > 0.5) return 'bg-emerald-950/50'
  if (ratio > 0.25) return 'bg-emerald-950/30'
  return ''
}
```

### Step 2: Compute maxAmount before the table render

Inside the component, just before the `return (`, add:

```tsx
const maxDealAmount = Math.max(...visibleDeals.map((d) => d.amount_usd ?? 0), 1)
```

### Step 3: Upgrade each table row

Find the `<tr key={deal.id} ...>` and update:

1. **Row `<tr>`** — add left-border color stripe via class. The current `border-l-2 border-l-blue-500` for new deals stays. For deal type, we use a data attribute approach: add `data-type={deal.deal_type}` and set the left border via the deal type colors map. Replace the `<tr>` opening tag:

```tsx
<tr
  key={deal.id}
  onClick={() => deal.company_id && navigate(`/company/${deal.company_id}`)}
  className={`border-b border-zinc-800/50 cursor-pointer transition-colors group border-l-4 ${
    DEAL_TYPE_COLORS[deal.deal_type ?? 'unknown']?.split(' ')[0] ?? 'border-zinc-800'
  } ${
    lastVisit && deal.created_at && new Date(deal.created_at) > lastVisit
      ? 'opacity-100'
      : ''
  } hover:bg-zinc-800/30`}
>
```

2. **Amount `<td>`** — add intensity background:

```tsx
<td className={`px-4 py-3 text-right tabular ${getAmountIntensityClass(deal.amount_usd, maxDealAmount)}`}>
  {deal.amount_usd ? (
    <span className="font-mono text-sm text-emerald-400 amount-glow">
      {formatAmount(deal.amount_usd)}
    </span>
  ) : (
    <span className="text-zinc-600 text-xs font-mono">—</span>
  )}
</td>
```

3. **Sector `<td>`** — replace plain text with colored pills:

```tsx
<td className="px-4 py-3">
  <div className="flex gap-1 flex-wrap">
    {(deal.sector || []).slice(0, 2).map((s) => (
      <SectorPill key={s} sector={s} />
    ))}
  </div>
</td>
```

4. **Geo `<td>`** — add flag emoji:

```tsx
<td className="px-4 py-3 text-xs text-zinc-400 uppercase font-mono">
  {deal.geo ? (
    <span>{GEO_FLAGS[deal.geo] ?? ''} {deal.geo}</span>
  ) : '—'}
</td>
```

5. **Add Momentum column** — add a new `<th>` header after Tech and before Geo:

```tsx
<th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-zinc-500 font-medium">
  Track
</th>
```

And the corresponding `<td>` in each row (after Tech td):

```tsx
<td className="px-4 py-3">
  <MomentumDots count={
    deals.filter((d) => d.company_id === deal.company_id).length
  } />
</td>
```

**Step 4: Build check**

```bash
cd frontend && npm run build
```
Expected: `✓ built in`

**Step 5: Commit**

```bash
git add frontend/src/views/DealFeed.tsx
git commit -m "feat(phase8): deal table upgrades — type borders, amount intensity, momentum dots, sector pills, geo flags"
```

---

## Task 6: FilterBar — pill toggles for deal type and sector

**Files:**
- Modify: `frontend/src/components/FilterBar.tsx`

### Step 1: Read and understand the current FilterBar

The current FilterBar has dropdowns (`<select>`) for deal_type and sector. We'll replace those two dropdowns with pill toggle buttons. Geo and amount_min stay as dropdowns.

### Step 2: Replace deal type and sector selects with pill toggles

Find the deal type `<select>` and replace with:

```tsx
{/* Deal type pills */}
<div className="flex items-center gap-1 flex-wrap">
  {['', 'vc', 'ma', 'crypto', 'ipo'].map((type) => {
    const label = type === '' ? 'All' : type.toUpperCase()
    const isActive = filters.dealType === type
    const activeColors: Record<string, string> = {
      vc:     'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      ma:     'bg-sky-500/20 text-sky-300 border-sky-500/40',
      crypto: 'bg-violet-500/20 text-violet-300 border-violet-500/40',
      ipo:    'bg-rose-500/20 text-rose-300 border-rose-500/40',
    }
    return (
      <button
        key={type}
        onClick={() => onFilterChange({ ...filters, dealType: type })}
        className={`text-xs px-3 py-1 rounded-full border font-mono transition-colors ${
          isActive
            ? (activeColors[type] ?? 'bg-amber-500/20 text-amber-300 border-amber-500/40')
            : 'text-zinc-500 border-zinc-700 hover:text-zinc-300 hover:border-zinc-600'
        }`}
      >
        {label}
      </button>
    )
  })}
</div>
```

Find the sector `<select>` and replace with:

```tsx
{/* Sector pills */}
<div className="flex items-center gap-1 flex-wrap">
  {(['', ...sectors]).map((s) => {
    const label = s === '' ? 'All sectors' : s
    const isActive = filters.sector === s
    return (
      <button
        key={s}
        onClick={() => onFilterChange({ ...filters, sector: s })}
        className={`text-xs px-3 py-1 rounded-full border font-mono transition-colors ${
          isActive
            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
            : 'text-zinc-500 border-zinc-700 hover:text-zinc-300 hover:border-zinc-600'
        }`}
      >
        {label}
      </button>
    )
  })}
</div>
```

**Step 3: Build check**

```bash
cd frontend && npm run build
```
Expected: `✓ built in`

**Step 4: Commit**

```bash
git add frontend/src/components/FilterBar.tsx
git commit -m "feat(phase8): filterbar — pill toggles for deal type and sector"
```

---

## Task 7: Trends — semantic chart colors + AI insight card

**Files:**
- Modify: `frontend/src/views/Trends.tsx`

### Step 1: Add semantic color map for Tremor

Tremor's `<LineChart>` and `<BarChart>` accept a `colors` prop as an array of Tailwind color names. Add this constant near the top of Trends.tsx:

```tsx
// Tremor uses Tailwind color names (not hex)
const DEAL_TYPE_TREMOR_COLORS: Record<string, string> = {
  VC:     'emerald',
  Crypto: 'violet',
  'M&A':  'sky',
  IPO:    'rose',
}

function getChartColors(categories: string[]): string[] {
  return categories.map((c) => DEAL_TYPE_TREMOR_COLORS[c] ?? 'amber')
}
```

### Step 2: Pass colors to LineChart and BarChart

In the Trends render, find `<LineChart` and add the `colors` prop:

```tsx
<LineChart
  data={lineData}
  index="week"
  categories={lineCategories}
  colors={getChartColors(lineCategories)}
  // ... existing props
/>
```

Find `<BarChart` and add:

```tsx
<BarChart
  data={barData}
  index="sector"
  categories={['Deals']}
  colors={['amber']}
  // ... existing props
/>
```

### Step 3: Add AI insight card above charts

After the page header and before the charts section, add:

```tsx
{data && briefingSummary && (
  <div className="mb-6 border-l-4 border-amber-400 bg-amber-400/5 rounded-r-lg px-4 py-3">
    <div className="text-[10px] uppercase tracking-wider text-amber-500 font-mono mb-1">
      AI Insight
    </div>
    <p className="text-sm text-zinc-300">{briefingSummary}</p>
  </div>
)}
```

Add state for the briefing summary:

```tsx
const [briefingSummary, setBriefingSummary] = useState<string | null>(null)

useEffect(() => {
  axios.get('/api/briefing/latest').then((r) => {
    setBriefingSummary(r.data?.ai_summary ?? null)
  }).catch(() => {})
}, [])
```

**Step 4: Build check**

```bash
cd frontend && npm run build
```
Expected: `✓ built in`

**Step 5: Commit**

```bash
git add frontend/src/views/Trends.tsx
git commit -m "feat(phase8): trends — semantic chart colors + AI insight card"
```

---

## Task 8: Heatmap — emerald color ramp

**Files:**
- Modify: `frontend/src/components/HeatmapGrid.tsx`

### Step 1: Replace `getColorClass` function

Find the existing `getColorClass` function and replace:

```tsx
function getColorClass(capital: number, max: number): string {
  if (max === 0 || capital === 0) return 'bg-zinc-900 border border-zinc-800'
  const ratio = capital / max
  if (ratio < 0.05) return 'bg-emerald-950/30 border border-emerald-900/20'
  if (ratio < 0.15) return 'bg-emerald-900/50 border border-emerald-800/30'
  if (ratio < 0.35) return 'bg-emerald-800/60 border border-emerald-700/40'
  if (ratio < 0.6)  return 'bg-emerald-700/70 border border-emerald-600/50'
  if (ratio < 0.85) return 'bg-emerald-600/80 border border-emerald-500/60'
  return 'bg-emerald-500/90 border border-emerald-400/70'
}
```

**Step 2: Build check**

```bash
cd frontend && npm run build
```
Expected: `✓ built in`

**Step 3: Commit**

```bash
git add frontend/src/components/HeatmapGrid.tsx
git commit -m "feat(phase8): heatmap — emerald saturation ramp replacing blue opacity"
```

---

## Task 9: Investor Leaderboard — rank treatment + capital bar

**Files:**
- Modify: `frontend/src/views/InvestorLeaderboard.tsx`

### Step 1: Add rank color helper

```tsx
function getRankColor(index: number): string {
  if (index === 0) return 'text-amber-400 font-bold'
  if (index === 1) return 'text-zinc-300 font-semibold'
  if (index === 2) return 'text-zinc-300 font-semibold'
  return 'text-zinc-600'
}
```

### Step 2: Compute maxCapital before render

```tsx
const maxCapital = Math.max(...(data?.investors ?? []).map((i) => i.total_capital_usd), 1)
```

### Step 3: Update each leaderboard row

In the row render, find where the rank/index is displayed and update the structure. The row should have:

```tsx
{data?.investors.map((investor, index) => (
  <tr key={investor.investor_name} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
    {/* Rank */}
    <td className={`px-4 py-3 font-mono text-sm tabular ${getRankColor(index)}`}>
      #{index + 1}
    </td>
    {/* Investor name */}
    <td className="px-4 py-3">
      <span className="text-sm font-medium text-zinc-100">{investor.investor_name}</span>
    </td>
    {/* Deal count */}
    <td className="px-4 py-3 text-center font-mono text-sm tabular text-zinc-300">
      {investor.deal_count}
    </td>
    {/* Capital with bar */}
    <td className="px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="flex-1 bg-zinc-800 rounded-full h-1.5 max-w-[120px]">
          <div
            className="h-1.5 rounded-full bg-emerald-500/70"
            style={{ width: `${Math.round((investor.total_capital_usd / maxCapital) * 100)}%` }}
          />
        </div>
        <span className="font-mono text-sm tabular text-emerald-400 w-16 text-right">
          {formatCapital(investor.total_capital_usd)}
        </span>
      </div>
    </td>
  </tr>
))}
```

**Step 4: Build check**

```bash
cd frontend && npm run build
```
Expected: `✓ built in`

**Step 5: Commit**

```bash
git add frontend/src/views/InvestorLeaderboard.tsx
git commit -m "feat(phase8): investor leaderboard — rank colors + inline capital bar"
```

---

## Task 10: Investor Network — node color by quartile + edge weight + focus mode

**Files:**
- Modify: `frontend/src/views/InvestorNetwork.tsx`

### Step 1: Update node color logic in the D3 useEffect

Find `.attr('fill', '#f59e0b')` and replace the node fill with a quartile-based scale:

```tsx
// Add before the simulation setup:
const sortedCounts = [...data.nodes].sort((a, b) => a.deal_count - b.deal_count)
const q1 = sortedCounts[Math.floor(sortedCounts.length * 0.25)]?.deal_count ?? 1
const q3 = sortedCounts[Math.floor(sortedCounts.length * 0.75)]?.deal_count ?? 1

function nodeColor(deal_count: number): string {
  if (deal_count >= q3) return '#34d399'  // emerald-400 — high
  if (deal_count >= q1) return '#f59e0b'  // amber-400 — mid
  return '#52525b'                         // zinc-600 — low
}
```

Replace `.attr('fill', '#f59e0b')` with `.attr('fill', (d) => nodeColor(d.deal_count))`

### Step 2: Update edge color by weight

Find `.attr('stroke', '#3f3f46')` and replace:

```tsx
.attr('stroke', (d) => d.weight >= 3 ? '#f59e0b' : '#3f3f46')
.attr('stroke-opacity', (d) => d.weight >= 3 ? 0.6 : 0.4)
```

### Step 3: Add focus mode on node hover

After the `node` selection is defined, add mouseover/mouseout events:

```tsx
node
  .on('mouseover', (_event, d) => {
    // Dim edges not connected to this node
    link.attr('stroke-opacity', (e: any) => {
      const src = typeof e.source === 'object' ? e.source.id : e.source
      const tgt = typeof e.target === 'object' ? e.target.id : e.target
      return (src === d.id || tgt === d.id) ? 0.8 : 0.05
    })
    // Dim unconnected nodes
    node.attr('fill-opacity', (n) => {
      if (n.id === d.id) return 1
      const connected = data.edges.some((e) => {
        const src = typeof e.source === 'object' ? (e.source as any).id : e.source
        const tgt = typeof e.target === 'object' ? (e.target as any).id : e.target
        return (src === d.id && tgt === n.id) || (tgt === d.id && src === n.id)
      })
      return connected ? 0.9 : 0.15
    })
  })
  .on('mouseout', () => {
    link.attr('stroke-opacity', (d: any) => d.weight >= 3 ? 0.6 : 0.4)
    node.attr('fill-opacity', 0.8)
  })
```

**Step 4: Build check**

```bash
cd frontend && npm run build
```
Expected: `✓ built in`

**Step 5: Commit**

```bash
git add frontend/src/views/InvestorNetwork.tsx
git commit -m "feat(phase8): investor network — quartile node colors, edge weight colors, focus mode"
```

---

## Task 11: Company Profile — header banner + funding timeline

**Files:**
- Modify: `frontend/src/views/CompanyProfile.tsx`

### Step 1: Replace the `<Card>` header section

Find the Tremor `<Card className="bg-zinc-900 border-zinc-800 relative">` section and replace with a custom header:

```tsx
{/* === HEADER BANNER === */}
<div className="relative bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden mb-6">
  {/* Background pattern */}
  <div className="absolute inset-0 opacity-5"
    style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, #f59e0b 0%, transparent 60%)' }}
  />
  <div className="relative flex items-start justify-between p-6">
    <div className="flex items-start gap-5">
      {/* Large initial */}
      <div className="w-16 h-16 rounded-xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center flex-shrink-0">
        <span className="text-2xl font-bold text-amber-400 font-mono">
          {company.name.charAt(0).toUpperCase()}
        </span>
      </div>
      <div>
        <h1 className="text-2xl font-bold text-zinc-50">{company.name}</h1>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {company.sector.map((s) => (
            <SectorPill key={s} sector={s} />
          ))}
          {company.geo && (
            <span className="text-xs font-mono text-zinc-500 uppercase">
              {GEO_FLAGS[company.geo] ?? ''} {company.geo}
            </span>
          )}
          {company.website && (
            <a
              href={company.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-amber-400/70 hover:text-amber-400 font-mono transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              ↗ {company.website.replace(/^https?:\/\//, '').split('/')[0]}
            </a>
          )}
        </div>
      </div>
    </div>
    <WatchlistToggle companyId={company.id} initialState={company.in_watchlist} />
  </div>
</div>
```

Add these helpers at the top of the file (after imports):

```tsx
const GEO_FLAGS: Record<string, string> = {
  latam: '🌎', spain: '🇪🇸', europe: '🇪🇺', us: '🇺🇸',
  asia: '🌏', africa: '🌍', mena: '🕌', global: '🌐',
}

const SECTOR_PILL_COLORS: Record<string, string> = {
  crypto:    'bg-violet-500/15 text-violet-300 border-violet-500/30',
  fintech:   'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  saas:      'bg-sky-500/15 text-sky-300 border-sky-500/30',
  healthtech:'bg-rose-500/15 text-rose-300 border-rose-500/30',
  edtech:    'bg-amber-500/15 text-amber-300 border-amber-500/30',
  proptech:  'bg-orange-500/15 text-orange-300 border-orange-500/30',
  other:     'bg-zinc-500/15 text-zinc-400 border-zinc-600/30',
}

function SectorPill({ sector }: { sector: string }) {
  const cls = SECTOR_PILL_COLORS[sector.toLowerCase()] ?? SECTOR_PILL_COLORS['other']
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-mono uppercase tracking-wide ${cls}`}>
      {sector}
    </span>
  )
}

function formatAmount(usd: number): string {
  const m = usd / 1_000_000
  if (m >= 1000) return `$${(m / 1000).toFixed(1)}B`
  return m >= 100 ? `$${Math.round(m)}M` : `$${m.toFixed(1)}M`
}
```

### Step 2: Replace the deal history table with a vertical timeline

Find the section that renders deals (likely a `<List>` or `<table>`) and replace with:

```tsx
{/* === FUNDING TIMELINE === */}
<div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
  <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-6">
    Funding History
  </h2>
  {company.deals.length === 0 ? (
    <p className="text-sm text-zinc-600">No deals recorded.</p>
  ) : (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-4 top-2 bottom-2 w-px bg-zinc-800" />
      <div className="space-y-6">
        {[...company.deals]
          .sort((a, b) =>
            (b.announced_date ?? '').localeCompare(a.announced_date ?? '')
          )
          .map((deal, i) => {
            const size = deal.amount_usd
              ? Math.min(Math.max(Math.log10(deal.amount_usd / 1_000_000 + 1) * 10, 8), 28)
              : 8
            return (
              <div key={deal.id} className="flex items-start gap-4 relative pl-10">
                {/* Circle node */}
                <div
                  className="absolute left-0 top-1 rounded-full bg-amber-400 border-2 border-zinc-950 flex-shrink-0"
                  style={{ width: size, height: size, marginLeft: `${4 - size / 2}px` }}
                />
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <span className="text-sm font-semibold text-zinc-100">
                      {deal.round_label || deal.deal_type?.toUpperCase() || 'Round'}
                    </span>
                    {deal.amount_usd && (
                      <span className="font-mono text-emerald-400 font-bold">
                        {formatAmount(deal.amount_usd)}
                      </span>
                    )}
                    <span className="text-xs text-zinc-500 font-mono">
                      {deal.announced_date
                        ? new Date(deal.announced_date).toLocaleDateString('en-US', {
                            month: 'short', day: 'numeric', year: 'numeric',
                          })
                        : '—'}
                    </span>
                  </div>
                  {deal.all_investors.length > 0 && (
                    <div className="flex gap-1.5 flex-wrap mt-1.5">
                      {deal.all_investors.slice(0, 5).map((inv) => (
                        <span
                          key={inv}
                          className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-400 font-mono"
                        >
                          {inv}
                        </span>
                      ))}
                      {deal.all_investors.length > 5 && (
                        <span className="text-[10px] text-zinc-600">
                          +{deal.all_investors.length - 5}
                        </span>
                      )}
                    </div>
                  )}
                  {deal.ai_summary && (
                    <p className="text-xs text-zinc-500 mt-1.5 line-clamp-2">{deal.ai_summary}</p>
                  )}
                </div>
              </div>
            )
          })}
      </div>
    </div>
  )}
</div>
```

Remove the `import { Card, Badge, List, ListItem } from '@tremor/react'` line and `import DealTypeBadge` if no longer used.

**Step 3: Build check**

```bash
cd frontend && npm run build
```
Expected: `✓ built in`

**Step 4: Commit**

```bash
git add frontend/src/views/CompanyProfile.tsx
git commit -m "feat(phase8): company profile — premium header banner + vertical funding timeline"
```

---

## Task 12: Watchlist — amber left border + last activity column

**Files:**
- Modify: `frontend/src/views/Watchlist.tsx`

### Step 1: Add "days since last deal" helper

```tsx
function daysSince(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return '1d ago'
  if (days < 30) return `${days}d ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}
```

### Step 2: Add amber left-border to each watchlist deal row

Find the `<tr>` inside the watchlist row render and add `border-l-4 border-amber-400/40` to its className.

### Step 3: Add Last Activity column

Add a `<th>` header for "Last Activity":
```tsx
<th className="text-right px-4 py-3 text-xs uppercase tracking-wider text-zinc-500 font-medium">
  Last Activity
</th>
```

Add corresponding `<td>` in each row:
```tsx
<td className="px-4 py-3 text-right font-mono text-xs text-zinc-500">
  {daysSince(deal.announced_date)}
</td>
```

**Step 4: Build check and final deploy**

```bash
cd frontend && npm run build
```
Expected: `✓ built in`

```bash
cd .. && railway service deal-radar-app && railway up
```

**Step 5: Commit**

```bash
git add frontend/src/views/Watchlist.tsx
git commit -m "feat(phase8): watchlist — amber left border + last activity column"
```

---

## Final verification checklist

After all 12 tasks and Railway deploy:

1. `GET /` → Hero strip shows capital + deals count + biggest deal. 3 hero cards visible.
2. Deal table rows have colored left borders by type (emerald=VC, violet=crypto, sky=M&A, rose=IPO)
3. Amount cells have intensity scaling — big numbers have a green tint background
4. Sector column shows colored pills, geo column shows flag emoji
5. Cmd+K opens command palette — type a company name, see results
6. Sidebar shows amber left-border on active item, Alerts/Watchlist count badges
7. `/trends` → charts use semantic colors (emerald for VC, not default blue)
8. `/heatmap` → high-capital cells are saturated emerald, zero cells are zinc-900
9. `/investors` → rank #1 is amber, capital bar shows as inline progress bar
10. `/network` → high-deal nodes are emerald, low-deal nodes are zinc-600; hover dims non-connected
11. `/company/:id` → header banner with large initial + sector pills; vertical timeline with sized circles
12. `/watchlist` → amber left borders on rows, "Last Activity" column visible
