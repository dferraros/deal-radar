import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import axios from 'axios'
import FilterBar, { defaultFilters } from '../components/FilterBar'
import type { FilterState } from '../components/FilterBar'
import LoadingSpinner from '../components/LoadingSpinner'
import ErrorBanner from '../components/ErrorBanner'
import CompanyAvatar from '../components/CompanyAvatar'

interface DealResponse {
  id: string
  company_id: string | null
  company_name: string | null
  deal_type: string | null
  amount_usd: number | null
  round_label: string | null
  announced_date: string | null
  lead_investor: string | null
  all_investors: string[]
  source_name: string | null
  sector: string[]
  geo: string | null
  source_url?: string | null
  tech_stack?: string[]
  confidence?: number
  created_at?: string | null
  company_website?: string | null
}

interface BriefingResponse {
  week_start: string
  week_end: string
  deal_count: number
  total_capital_usd: number
  top_company: string | null
  top_amount_usd: number | null
  top_sector: string | null
  ai_summary: string | null
  generated_at: string | null
}

// ---- Format helpers ----

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


const GEO_FLAGS: Record<string, string> = {
  latam: '🌎', spain: '🇪🇸', europe: '🇪🇺', us: '🇺🇸',
  asia: '🌏', africa: '🌍', mena: '🕌', global: '🌐',
}

const DEAL_TYPE_LEFT_BORDER: Record<string, string> = {
  vc:      'border-l-emerald-500',
  crypto:  'border-l-violet-500',
  ma:      'border-l-sky-500',
  ipo:     'border-l-rose-500',
  unknown: 'border-l-zinc-700',
}

const DEAL_TYPE_BG: Record<string, string> = {
  vc:      'bg-emerald-500/5',
  crypto:  'bg-violet-500/5',
  ma:      'bg-sky-500/5',
  ipo:     'bg-rose-500/5',
  unknown: 'bg-zinc-900',
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

// ---- Task 3: Amount-based row tier ----

function dealTier(usd: number | null | undefined): 'mega' | 'large' | 'normal' {
  if (!usd) return 'normal'
  if (usd >= 1_000_000_000) return 'mega'
  if (usd >= 100_000_000) return 'large'
  return 'normal'
}

// ---- Task 5: Company favicons ----

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

// ---- Task 6: Source badge pills ----

const SOURCE_COLORS: Record<string, string> = {
  crunchbase: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  tavily:     'bg-violet-500/15 text-violet-400 border-violet-500/30',
  rss:        'bg-zinc-700/50 text-zinc-400 border-zinc-600',
  firecrawl:  'bg-orange-500/15 text-orange-400 border-orange-500/30',
  manual:     'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
}

function SourceBadge({ source }: { source: string | null | undefined }) {
  if (!source) return null
  const cls = SOURCE_COLORS[source.toLowerCase()] ?? SOURCE_COLORS.rss
  return (
    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${cls}`}>
      {source.toLowerCase()}
    </span>
  )
}


function buildParams(f: FilterState): Record<string, string> {
  const params: Record<string, string> = {}
  if (f.dealType) params.deal_type = f.dealType
  if (f.sector) params.sector = f.sector
  if (f.geo) params.geo = f.geo
  if (f.amountMin) params.amount_min = f.amountMin
  if (f.dateFrom) params.date_from = f.dateFrom.toISOString().slice(0, 10)
  if (f.dateTo) params.date_to = f.dateTo.toISOString().slice(0, 10)
  return params
}

function getTodayDeals(deals: DealResponse[]): DealResponse[] {
  const today = new Date().toISOString().slice(0, 10)
  return deals.filter((d) => d.announced_date?.slice(0, 10) === today)
}

function exportCSV(deals: DealResponse[]) {
  const headers = ['Company', 'Round', 'Amount USD', 'Sector', 'Geo', 'Lead Investor', 'Date']
  const rows = deals.map((d) => [
    d.company_name ?? '',
    d.round_label ?? d.deal_type ?? '',
    d.amount_usd ?? '',
    (d.sector || []).join('; '),
    d.geo ?? '',
    d.lead_investor ?? '',
    d.announced_date ?? '',
  ])
  const csv = [headers, ...rows].map((r) => r.map(String).map((v) => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `deal-radar-export-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ---- Component ----

async function addToIntel(companyName: string, website: string) {
  try {
    await axios.post('/api/intel/queue', { company_name: companyName, website })
    window.location.href = '/intel'
  } catch {
    // silently fail — user will see the queue
  }
}

export default function DealFeed() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [filters, setFilters] = useState<FilterState>(() => {
    // Pre-populate filters from URL params (e.g. heatmap drill-down)
    const urlSector = searchParams.get('sector')
    const urlGeo = searchParams.get('geo')
    if (urlSector || urlGeo) {
      return {
        ...defaultFilters,
        ...(urlSector ? { sector: urlSector } : {}),
        ...(urlGeo ? { geo: urlGeo } : {}),
      }
    }
    return defaultFilters
  })
  const [deals, setDeals] = useState<DealResponse[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sectors, setSectors] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [briefing, setBriefing] = useState<BriefingResponse | null>(null)
  const [lastVisit, setLastVisit] = useState<Date | null>(null)
  const [newCount, setNewCount] = useState(0)

  // Task 4: Sort state
  type SortKey = 'amount_usd' | 'announced_date' | null
  type SortDir = 'asc' | 'desc'
  const [sortKey, setSortKey] = useState<SortKey>(null)
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const handleSearchChange = (val: string) => {
    setSearch(val)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      fetchDeals(filters, val)
      setPage(1)
    }, 300)
  }

  const fetchDeals = useCallback(async (f: FilterState, searchQuery = '') => {
    setLoading(true)
    setError(null)
    setPage(1)
    try {
      const params = { ...buildParams(f), page: '1', limit: '50', ...(searchQuery ? { q: searchQuery } : {}) }
      const res = await axios.get('/api/deals', { params })
      setDeals(res.data.deals)
      setHasMore(res.data.page < res.data.pages)
    } catch {
      setError('Could not load data. Check your connection or try refreshing the page.')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadMore = async () => {
    setLoadingMore(true)
    try {
      const nextPage = page + 1
      const res = await axios.get('/api/deals', {
        params: { ...buildParams(filters), page: String(nextPage), limit: '50' },
      })
      setDeals((prev) => [...prev, ...res.data.deals])
      setPage(nextPage)
      setHasMore(nextPage < res.data.pages)
    } catch {
      // silently fail on load-more
    } finally {
      setLoadingMore(false)
    }
  }

  // Feature: last-visit tracking
  useEffect(() => {
    const stored = localStorage.getItem('dealRadarLastVisit')
    if (stored) setLastVisit(new Date(stored))
    localStorage.setItem('dealRadarLastVisit', new Date().toISOString())
  }, [])

  // Feature: compute new-since-last-visit count when deals load
  useEffect(() => {
    if (lastVisit && deals.length > 0) {
      const count = deals.filter(d =>
        d.created_at && new Date(d.created_at) > lastVisit
      ).length
      setNewCount(count)
    }
  }, [deals, lastVisit])

  useEffect(() => {
    axios
      .get('/api/deals/sectors')
      .then((r) => setSectors(r.data.sectors ?? []))
      .catch(() => {})
    fetch('/api/admin/runs?limit=1')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (Array.isArray(data) && data.length > 0 && data[0].run_at) {
          const d = new Date(data[0].run_at)
          setLastSync(
            d.toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            })
          )
        }
      })
      .catch(() => {})
    axios
      .get('/api/briefing/latest')
      .then((r) => setBriefing(r.data))
      .catch(() => {})
    fetchDeals(filters, search)
  }, [fetchDeals]) // eslint-disable-line react-hooks/exhaustive-deps

  // Search is handled server-side via the q param
  const visibleDeals = deals

  const todayDeals = getTodayDeals(deals)
  const todayCapital = todayDeals.reduce((sum, d) => sum + (d.amount_usd ?? 0), 0)

  // KPI values computed from all loaded deals (not just filtered)
  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)
  const weekDeals = deals.filter((d) => {
    if (!d.announced_date) return false
    const dt = new Date(d.announced_date)
    return dt >= weekAgo
  })
  const weekCapital = weekDeals.reduce((s, d) => s + (d.amount_usd ?? 0), 0)

  const kpis = useMemo(() => {
    if (!deals.length) return null
    const totalCapital = deals.reduce((s, d) => s + (d.amount_usd ?? 0), 0)
    const dealsWithAmount = deals.filter(d => (d.amount_usd ?? 0) > 0)
    const biggest = dealsWithAmount.length > 0
      ? dealsWithAmount.reduce((max, d) => (d.amount_usd ?? 0) > (max.amount_usd ?? 0) ? d : max)
      : null
    const sectorCounts: Record<string, number> = {}
    deals.forEach(d => (d.sector ?? []).forEach(s => {
      sectorCounts[s] = (sectorCounts[s] ?? 0) + 1
    }))
    const topSector = Object.entries(sectorCounts).sort(([,a],[,b]) => b-a)[0]?.[0] ?? '—'
    return { totalCapital, biggest, topSector, count: deals.length }
  }, [deals])

  // Task 4: Sorted deals
  const sortedDeals = useMemo(() => {
    if (!sortKey) return deals
    return [...deals].sort((a, b) => {
      const av = sortKey === 'amount_usd' ? (a[sortKey] ?? -1) : (a[sortKey] ?? '')
      const bv = sortKey === 'amount_usd' ? (b[sortKey] ?? -1) : (b[sortKey] ?? '')
      const cmp = av < bv ? -1 : av > bv ? 1 : 0
      return sortDir === 'desc' ? -cmp : cmp
    })
  }, [deals, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  return (
    <div>
      {/* ── Status bar ──────────────────────────────────────────── */}
      <div className="bg-black border-b border-zinc-800/80 px-6 py-1.5 flex items-center gap-5 text-xs font-mono text-zinc-500">
        {/* LIVE badge */}
        <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60"></span>
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400"></span>
          </span>
          LIVE
        </span>
        <span className="w-px h-3 bg-zinc-800" />
        <span>
          TODAY: <span className="text-zinc-300">{loading ? '…' : todayDeals.length} deals</span>
        </span>
        <span>
          <span className="text-emerald-400">
            {loading ? '…' : fmtAmount(todayCapital)}
          </span>
        </span>
        {lastSync && (
          <>
            <span className="w-px h-3 bg-zinc-800" />
            <span>
              SYNCED: <span className="text-zinc-400">{lastSync}</span>
            </span>
          </>
        )}
        <div className="flex-1" />
        <button
          onClick={() => exportCSV(visibleDeals)}
          className="text-[10px] px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800 rounded transition-colors"
        >
          Export CSV
        </button>
      </div>

      {/* ── Hero stats band ──────────────────────────────────────── */}
      <div className="terminal-bg border-b border-zinc-800/60 px-6 py-6">
        <div className="flex items-end justify-between gap-6 flex-wrap">
          {/* Primary stat: capital */}
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-mono mb-2">
              Capital Raised · 7 Days
            </div>
            <div className="flex items-end gap-3">
              <span className="stat-number text-5xl font-black text-emerald-400 amount-glow">
                {loading ? '—' : weekCapital > 0 ? fmtAmount(weekCapital) : '$0'}
              </span>
              <span className="text-zinc-600 font-mono text-sm mb-1 pb-0.5">USD</span>
            </div>
            <div className="text-xs text-zinc-500 font-mono mt-1.5">
              {loading ? '…' : `${weekDeals.length} deals`}
              {kpis?.topSector && kpis.topSector !== '—' && (
                <span className="ml-2 text-zinc-600">· top sector: <span className="text-zinc-400 capitalize">{kpis.topSector}</span></span>
              )}
              {newCount > 0 && (
                <span className="ml-2 text-blue-400">· {newCount} new since last visit</span>
              )}
            </div>
          </div>

          {/* Secondary stats */}
          <div className="flex items-stretch gap-0 border border-zinc-800 rounded-lg overflow-hidden">
            {[
              {
                label: 'Total Loaded',
                value: loading ? '—' : String(kpis?.count ?? 0),
                sub: 'deals',
                color: 'text-zinc-100',
              },
              {
                label: 'All-Time Capital',
                value: loading ? '—' : fmtAmount(kpis?.totalCapital),
                sub: 'USD',
                color: 'text-zinc-100',
              },
              {
                label: 'Biggest',
                value: loading ? '—' : (kpis?.biggest ? fmtAmount(kpis.biggest.amount_usd) : '—'),
                sub: kpis?.biggest?.company_name ?? '',
                color: 'text-amber-400',
              },
            ].map(({ label, value, sub, color }) => (
              <div key={label} className="bg-zinc-950 px-5 py-3 border-r border-zinc-800 last:border-r-0 min-w-[110px]">
                <div className="text-[9px] uppercase tracking-widest text-zinc-600 font-mono mb-1.5">{label}</div>
                <div className={`stat-number text-xl font-bold ${color} tabular`}>{value}</div>
                {sub && <div className="text-[10px] text-zinc-600 font-mono mt-0.5 truncate max-w-[100px]">{sub}</div>}
              </div>
            ))}
          </div>
        </div>

        {/* AI Briefing strip */}
        {briefing?.ai_summary && (
          <div className="mt-4 flex items-start gap-2 border border-amber-500/20 bg-amber-500/5 rounded-lg px-4 py-2.5">
            <span className="text-[9px] uppercase tracking-widest text-amber-500 font-mono mt-0.5 shrink-0">AI</span>
            <p className="text-xs text-zinc-400 leading-relaxed">{briefing.ai_summary}</p>
          </div>
        )}
      </div>

      {/* ── Hero deal cards ──────────────────────────────────────── */}

      {/* ── Top deals ───────────────────────────────────────────── */}
      {(() => {
        const topDeals = [...deals]
          .filter((d) => d.amount_usd && d.amount_usd > 0)
          .sort((a, b) => (b.amount_usd ?? 0) - (a.amount_usd ?? 0))
          .slice(0, 3)
        if (topDeals.length === 0) return null
        return (
          <div className="px-6 pt-4 pb-2 grid grid-cols-3 gap-3">
            {topDeals.map((deal, i) => {
              const typeKey = deal.deal_type ?? 'unknown'
              const leftBorder = DEAL_TYPE_LEFT_BORDER[typeKey] ?? DEAL_TYPE_LEFT_BORDER['unknown']
              const bgCls = DEAL_TYPE_BG[typeKey] ?? ''
              const roundDisplay = fmtRound(deal.round_label)
              const isTop = i === 0
              return (
                <div
                  key={deal.id}
                  onClick={() => deal.company_id && navigate(`/company/${deal.company_id}`)}
                  className={`relative border-l-[3px] ${leftBorder} ${bgCls} border border-zinc-800 rounded-xl p-4 cursor-pointer hover:border-zinc-700 transition-all duration-150 ${isTop ? 'ring-1 ring-amber-500/20' : ''}`}
                >
                  {isTop && (
                    <div className="absolute top-2.5 right-2.5 text-[9px] font-mono text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">
                      #1
                    </div>
                  )}
                  <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-2 flex items-center gap-1.5">
                    {roundDisplay !== '—' ? roundDisplay : (deal.deal_type || 'Deal')}
                    {deal.geo && <span>{GEO_FLAGS[deal.geo] ?? ''}</span>}
                  </div>
                  <div className={`font-semibold truncate mb-1.5 ${isTop ? 'text-lg text-zinc-50' : 'text-base text-zinc-100'}`}>
                    {deal.company_name ?? '—'}
                  </div>
                  <div className={`font-mono font-black tabular stat-number mb-2.5 ${isTop ? 'text-3xl text-amber-400 mega-glow' : 'text-2xl text-emerald-400 amount-glow'}`}>
                    {deal.amount_usd ? fmtAmount(deal.amount_usd) : '—'}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {(deal.sector || []).slice(0, 2).map((s) => (
                      <SectorPill key={s} sector={s} />
                    ))}
                  </div>
                  {deal.lead_investor && (
                    <div className="text-[11px] text-zinc-500 mt-2 truncate font-mono">
                      {deal.lead_investor}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })()}

      <div className="px-6 pb-6">
        {/* Search + controls row */}
        <div className="pt-4 pb-2 flex items-center gap-3">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search company…"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-56 bg-zinc-900 border border-zinc-800 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-amber-500/60 rounded-lg pl-8 pr-3 py-1.5 text-sm transition-colors"
            />
          </div>
        </div>

        {/* Filter bar */}
        <FilterBar
          filters={filters}
          sectors={sectors}
          onFilterChange={(f) => {
            setFilters(f)
            fetchDeals(f, search)
          }}
        />

        {/* Table area */}
        <div className="mt-2">
          {loading ? (
            <LoadingSpinner />
          ) : error ? (
            <ErrorBanner message={error} />
          ) : visibleDeals.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-base font-semibold text-zinc-300">No deals found</p>
              <p className="text-sm text-zinc-500 mt-2">
                Try adjusting your filters, or check back after the next ingestion at 7am UTC.
              </p>
            </div>
          ) : (
            <>
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-zinc-500 font-medium w-[200px]">
                        Company
                      </th>
                      <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-zinc-500 font-medium">
                        Round
                      </th>
                      <th onClick={() => toggleSort('amount_usd')} className="text-right px-4 py-3 text-xs uppercase tracking-wider text-zinc-500 font-medium cursor-pointer hover:text-zinc-300 select-none">
                        Amount {sortKey === 'amount_usd' ? (sortDir === 'desc' ? '↓' : '↑') : <span className="text-zinc-700">↕</span>}
                      </th>
                      <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-zinc-500 font-medium">
                        Sector
                      </th>
                      <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-zinc-500 font-medium">
                        Tech
                      </th>
                      <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-zinc-500 font-medium">
                        Geo
                      </th>
                      <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-zinc-500 font-medium">
                        Investors
                      </th>
                      <th onClick={() => toggleSort('announced_date')} className="text-right px-4 py-3 text-xs uppercase tracking-wider text-zinc-500 font-medium cursor-pointer hover:text-zinc-300 select-none">
                        Date {sortKey === 'announced_date' ? (sortDir === 'desc' ? '↓' : '↑') : <span className="text-zinc-700">↕</span>}
                      </th>
                      <th className="px-2 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedDeals.map((deal) => {
                      const roundDisplay = fmtRound(deal.round_label)
                      const tier = dealTier(deal.amount_usd)
                      const favicon = getFaviconUrl(deal.company_website, deal.source_url)
                      return (
                      <tr
                        key={deal.id}
                        onClick={() => deal.company_id && navigate(`/company/${deal.company_id}`)}
                        className={`
                          deal-row border-b border-zinc-800/40 cursor-pointer group
                          ${tier === 'mega' ? 'mega-deal-row border-l-[3px] border-l-amber-400/80' : ''}
                          ${tier === 'large' ? 'hover:bg-zinc-800/25 border-l-[3px] border-l-zinc-600/80' : ''}
                          ${tier === 'normal' ? `hover:bg-zinc-800/25 border-l-[3px] ${DEAL_TYPE_LEFT_BORDER[deal.deal_type ?? 'unknown'] ?? DEAL_TYPE_LEFT_BORDER['unknown']}` : ''}
                          ${lastVisit && deal.created_at && new Date(deal.created_at) > lastVisit ? 'border-r-2 border-r-blue-500/60' : ''}
                        `}
                      >
                        {/* Company */}
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            {favicon ? (
                              <img
                                src={favicon}
                                alt=""
                                className="w-4 h-4 rounded-sm opacity-80 flex-shrink-0"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                              />
                            ) : (
                              <CompanyAvatar name={deal.company_name ?? '?'} size={16} />
                            )}
                            <div className="flex items-center gap-1 min-w-0">
                              <span className="text-sm font-medium text-zinc-100 group-hover:text-white truncate max-w-[130px]">
                                {deal.company_name ?? '—'}
                              </span>
                              <SourceBadge source={deal.source_name} />
                              {deal.confidence !== undefined && deal.confidence < 0.5 && (
                                <span
                                  title={`AI confidence: ${(deal.confidence * 100).toFixed(0)}%`}
                                  className="w-1.5 h-1.5 rounded-full bg-amber-500/60 inline-block ml-1 shrink-0"
                                />
                              )}
                            </div>
                          </div>
                        </td>
                        {/* Round */}
                        <td className="px-4 py-3">
                          <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono uppercase tracking-wide border border-zinc-700">
                            {roundDisplay !== '—' ? roundDisplay : (deal.deal_type?.toUpperCase() || '—')}
                          </span>
                        </td>
                        {/* Amount */}
                        <td className={`px-4 py-2.5 font-mono text-sm tabular-nums font-semibold text-right
                          ${tier === 'mega' ? 'text-amber-400' : 'text-zinc-200'}`}>
                          {deal.amount_usd ? (
                            fmtAmount(deal.amount_usd)
                          ) : (
                            <span className="text-zinc-600 text-xs font-mono">—</span>
                          )}
                        </td>
                        {/* Sector */}
                        <td className="px-4 py-3">
                          <div className="flex gap-1 flex-wrap">
                            {(deal.sector || []).slice(0, 2).map((s) => (
                              <SectorPill key={s} sector={s} />
                            ))}
                            {(deal.sector || []).length === 0 && <span className="text-zinc-600 text-xs">—</span>}
                          </div>
                        </td>
                        {/* Tech Stack */}
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {(deal.tech_stack || []).slice(0, 3).map(tech => (
                              <span key={tech} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700 font-mono">
                                {tech}
                              </span>
                            ))}
                            {(deal.tech_stack || []).length > 3 && (
                              <span className="text-[10px] text-zinc-600">+{deal.tech_stack!.length - 3}</span>
                            )}
                          </div>
                        </td>
                        {/* Geo */}
                        <td className="px-4 py-3 text-xs text-zinc-400 uppercase font-mono">
                          {deal.geo ? (
                            <span>{GEO_FLAGS[deal.geo] ?? ''} {deal.geo}</span>
                          ) : <span className="text-zinc-600">—</span>}
                        </td>
                        {/* Investors */}
                        <td className="px-4 py-3 text-xs text-zinc-400 truncate max-w-[160px]">
                          {deal.lead_investor ?? '—'}
                        </td>
                        {/* Date */}
                        <td className="px-4 py-3 text-right font-mono text-xs text-zinc-500">
                          {deal.announced_date
                            ? new Date(deal.announced_date).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                              })
                            : '—'}
                        </td>
                        {/* Intel quick-add */}
                        <td className="px-2 py-2">
                          {deal.company_website && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                addToIntel(deal.company_name ?? '', deal.company_website!)
                              }}
                              title="Analyze with Tech Intel"
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-mono px-2 py-1 rounded border border-zinc-700 text-zinc-500 hover:text-amber-400 hover:border-amber-500/50 whitespace-nowrap"
                            >
                              + Intel
                            </button>
                          )}
                        </td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>

              {/* Load more */}
              {hasMore && (
                <div className="mt-4 text-center">
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="text-xs text-blue-400 hover:text-blue-300 underline disabled:opacity-50 font-mono"
                  >
                    {loadingMore ? 'Loading...' : 'Load more deals'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
