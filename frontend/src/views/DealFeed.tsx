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
  vc:      '',
  crypto:  '',
  ma:      '',
  ipo:     '',
  unknown: '',
}

const DEAL_TYPE_DOT: Record<string, string> = {
  vc:      'bg-emerald-400',
  crypto:  'bg-violet-400',
  ma:      'bg-sky-400',
  ipo:     'bg-rose-400',
  unknown: 'bg-zinc-600',
}

const DEAL_TYPE_TEXT: Record<string, string> = {
  vc:      'text-emerald-400',
  crypto:  'text-violet-400',
  ma:      'text-sky-400',
  ipo:     'text-rose-400',
  unknown: 'text-zinc-500',
}

const AMOUNT_BAR_COLOR: Record<string, string> = {
  mega:   'bg-gradient-to-r from-amber-400 to-orange-400',
  large:  'bg-gradient-to-r from-emerald-500 to-emerald-400',
  normal: 'bg-gradient-to-r from-zinc-500 to-zinc-400',
}

const SECTOR_PILL_COLORS: Record<string, string> = {
  crypto:    'bg-violet-100 text-violet-700 border-violet-200',
  fintech:   'bg-emerald-100 text-emerald-700 border-emerald-200',
  saas:      'bg-sky-100 text-sky-700 border-sky-200',
  healthtech:'bg-rose-100 text-rose-700 border-rose-200',
  edtech:    'bg-amber-100 text-amber-700 border-amber-200',
  proptech:  'bg-orange-100 text-orange-700 border-orange-200',
  other:     'bg-slate-100 text-slate-500 border-slate-200',
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
  crunchbase: 'bg-blue-100 text-blue-600 border-blue-200',
  tavily:     'bg-violet-100 text-violet-600 border-violet-200',
  rss:        'bg-slate-100 text-slate-500 border-slate-200',
  firecrawl:  'bg-orange-100 text-orange-600 border-orange-200',
  manual:     'bg-emerald-100 text-emerald-600 border-emerald-200',
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

  const maxAmount = useMemo(() => {
    return deals.reduce((max, d) => ((d.amount_usd ?? 0) > max ? d.amount_usd! : max), 1)
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
      <div className="bg-white border-b border-slate-200 px-6 py-1.5 flex items-center gap-5 text-xs font-mono text-slate-400">
        {/* Product label */}
        <span className="font-mono text-[10px] font-bold tracking-[0.15em] text-amber-600">DEAL·RADAR</span>
        <span className="w-px h-3 bg-slate-200" />
        {/* LIVE badge */}
        <span className="flex items-center gap-1.5 text-emerald-500 font-semibold">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-60"></span>
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
          </span>
          LIVE
        </span>
        <span className="w-px h-3 bg-slate-200" />
        <span>
          TODAY: <span className="text-slate-700">{loading ? '…' : todayDeals.length} deals</span>
        </span>
        <span>
          <span className="text-emerald-600 font-semibold">
            {loading ? '…' : fmtAmount(todayCapital)}
          </span>
        </span>
        {lastSync && (
          <>
            <span className="w-px h-3 bg-slate-200" />
            <span>
              SYNCED: <span className="text-slate-500">{lastSync}</span>
            </span>
          </>
        )}
        <div className="flex-1" />
        <button
          onClick={() => exportCSV(visibleDeals)}
          className="text-[10px] px-2.5 py-1 bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-700 border border-slate-200 rounded transition-colors"
        >
          Export CSV
        </button>
      </div>

      {/* ── Hero stats band ──────────────────────────────────────── */}
      <div className="terminal-bg border-b border-slate-200 px-6 py-5">
        <div className="flex items-center gap-8 flex-wrap">
          {/* Primary: 7D Capital */}
          <div>
            <div className="text-[9px] uppercase tracking-[0.25em] text-slate-500 font-mono mb-1">Capital · 7D</div>
            <div className="flex items-baseline gap-1.5">
              <span className="stat-number text-[2.6rem] font-black text-emerald-500 leading-none">
                {loading ? '—' : (weekCapital > 0 ? fmtAmount(weekCapital) : '$0')}
              </span>
              <span className="text-slate-400 font-mono text-xs">USD</span>
            </div>
            <div className="text-[10px] text-slate-500 font-mono mt-1 flex items-center gap-2">
              <span>{loading ? '…' : `${weekDeals.length} deals`}</span>
              {kpis?.topSector && kpis.topSector !== '—' && (
                <span className="text-slate-400">· <span className="text-slate-500 capitalize">{kpis.topSector}</span></span>
              )}
              {newCount > 0 && (
                <span className="text-blue-500">· {newCount} new</span>
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="h-10 w-px bg-slate-200 self-center" />

          {/* Secondary stats — compact horizontal strip */}
          <div className="flex items-center gap-6">
            {[
              { label: 'Deals', value: loading ? '—' : String(kpis?.count ?? 0), color: 'text-slate-800' },
              { label: 'All-Time', value: loading ? '—' : fmtAmount(kpis?.totalCapital), color: 'text-slate-800' },
              { label: 'Biggest', value: loading ? '—' : (kpis?.biggest ? fmtAmount(kpis.biggest.amount_usd) : '—'), color: 'text-amber-600', sub: kpis?.biggest?.company_name },
            ].map(({ label, value, color, sub }) => (
              <div key={label}>
                <div className="text-[9px] uppercase tracking-widest text-slate-400 font-mono mb-0.5">{label}</div>
                <div className={`stat-number text-lg font-bold ${color} tabular-nums leading-tight`}>{value}</div>
                {sub && <div className="text-[9px] text-slate-400 font-mono truncate max-w-[90px]">{sub}</div>}
              </div>
            ))}
          </div>
        </div>

        {/* AI Briefing strip */}
        {briefing?.ai_summary && (
          <div className="mt-4 flex items-start gap-2.5 border border-amber-200 bg-amber-50 rounded-lg px-4 py-2.5">
            <span className="text-[9px] uppercase tracking-widest text-amber-600 font-mono mt-0.5 shrink-0">AI</span>
            <p className="text-[11px] text-slate-600 leading-relaxed">{briefing.ai_summary}</p>
          </div>
        )}
      </div>

      {/* ── Top deals — asymmetric position cards ───────────────── */}
      {(() => {
        const topDeals = [...deals]
          .filter((d) => d.amount_usd && d.amount_usd > 0)
          .sort((a, b) => (b.amount_usd ?? 0) - (a.amount_usd ?? 0))
          .slice(0, 3)
        if (topDeals.length === 0) return null
        const totalCapital = deals.reduce((s, d) => s + (d.amount_usd ?? 0), 0)

        const RANK_LABELS = ['01', '02', '03']
        const TYPE_TOP_ACCENT: Record<string, string> = {
          vc:      'from-emerald-500/60 to-transparent',
          crypto:  'from-violet-500/60 to-transparent',
          ma:      'from-sky-500/60 to-transparent',
          ipo:     'from-rose-500/60 to-transparent',
          unknown: 'from-zinc-700/60 to-transparent',
        }

        const renderCard = (deal: typeof topDeals[0], i: number) => {
          const typeKey = deal.deal_type ?? 'unknown'
          const leftBorder = DEAL_TYPE_LEFT_BORDER[typeKey] ?? DEAL_TYPE_LEFT_BORDER['unknown']
          const bgCls = DEAL_TYPE_BG[typeKey] ?? ''
          const roundDisplay = fmtRound(deal.round_label)
          const isTop = i === 0
          const pct = totalCapital > 0 && deal.amount_usd
            ? ((deal.amount_usd / totalCapital) * 100).toFixed(1)
            : null

          return (
            <div
              key={deal.id}
              onClick={() => deal.company_id && navigate(`/company/${deal.company_id}`)}
              className={`
                relative overflow-hidden border-l-[3px] ${leftBorder} ${bgCls}
                border border-slate-200 rounded-xl cursor-pointer
                hover:border-slate-300 hover:shadow-sm transition-all duration-150
                ${isTop ? 'position-card-top ring-1 ring-amber-400/20 p-5' : 'p-4'}
              `}
            >
              {/* Top accent line for secondary cards */}
              {!isTop && (
                <div className={`absolute top-0 left-0 right-0 h-px bg-gradient-to-r ${TYPE_TOP_ACCENT[typeKey] ?? TYPE_TOP_ACCENT['unknown']}`} />
              )}

              {/* Watermark rank number */}
              <div className={`absolute bottom-1 right-3 font-black select-none pointer-events-none tabular-nums leading-none text-slate-900 opacity-[0.05] ${isTop ? 'text-[96px]' : 'text-[72px]'}`}>
                {RANK_LABELS[i]}
              </div>

              {/* Header row */}
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-[9px] font-mono uppercase tracking-[0.3em] text-slate-400">
                  Deal · #{RANK_LABELS[i]}
                </span>
                <span className="text-[9px] font-mono text-slate-400">
                  {roundDisplay !== '—' ? roundDisplay : (deal.deal_type?.toUpperCase() || 'DEAL')}
                  {deal.geo && <span className="ml-1">{GEO_FLAGS[deal.geo] ?? ''}</span>}
                </span>
              </div>

              {/* Company name */}
              <div className={`font-semibold truncate mb-1 ${isTop ? 'text-xl text-slate-900' : 'text-base text-slate-800'}`}>
                {deal.company_name ?? '—'}
              </div>

              {/* Amount */}
              <div className={`font-mono font-black tabular stat-number ${isTop ? 'text-[2rem] text-amber-600 mb-1' : 'text-2xl text-emerald-600 mb-1'}`}>
                {fmtAmount(deal.amount_usd)}
              </div>

              {/* % of total */}
              {pct && (
                <div className="text-[9px] font-mono text-slate-400 mb-2.5">
                  {pct}% of period capital
                </div>
              )}

              {/* Sector pills */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {(deal.sector || []).slice(0, 2).map((s) => (
                  <SectorPill key={s} sector={s} />
                ))}
              </div>

              {/* Lead investor */}
              {deal.lead_investor && (
                <div className="text-[10px] text-slate-500 mt-2 truncate font-mono">
                  {deal.lead_investor}
                </div>
              )}
            </div>
          )
        }

        return (
          <div className="px-6 pt-4 pb-2 grid grid-cols-5 gap-3">
            {/* #1 — dominant card */}
            <div className="col-span-3">
              {renderCard(topDeals[0], 0)}
            </div>
            {/* #2 + #3 — stacked column */}
            <div className="col-span-2 grid grid-rows-2 gap-3">
              {topDeals.slice(1).map((deal, i) => renderCard(deal, i + 1))}
            </div>
          </div>
        )
      })()}

      <div className="px-6 pb-6">
        {/* Search + controls row */}
        <div className="pt-4 pb-2 flex items-center gap-3">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search company…"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-56 bg-white border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-amber-400 rounded-lg pl-8 pr-3 py-1.5 text-sm transition-colors shadow-sm"
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
              <p className="text-base font-semibold text-slate-700">No deals found</p>
              <p className="text-sm text-slate-400 mt-2">
                Try adjusting your filters, or check back after the next ingestion at 7am UTC.
              </p>
            </div>
          ) : (
            <>
              <div className="border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                {/* Amber gradient accent line above header */}
                <div className="table-header-accent h-px w-full" />
                <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left px-4 py-2 text-[10px] uppercase tracking-widest text-slate-500 font-medium w-[200px]">Company</th>
                      <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest text-slate-500 font-medium w-[100px]">Type</th>
                      <th onClick={() => toggleSort('amount_usd')} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && toggleSort('amount_usd')} className="text-right px-4 py-2 text-[10px] uppercase tracking-widest text-slate-500 font-medium cursor-pointer hover:text-amber-600 select-none w-[200px] focus:outline-none focus:bg-amber-50">
                        Amount · USD {sortKey === 'amount_usd'
                          ? <span className="text-amber-600 ml-0.5">{sortDir === 'desc' ? '▼' : '▲'}</span>
                          : <span className="text-slate-300 ml-0.5 text-[8px]">⊞</span>}
                      </th>
                      <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest text-slate-500 font-medium">Sector</th>
                      <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest text-slate-500 font-medium">Tech</th>
                      <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest text-slate-500 font-medium">Geo</th>
                      <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest text-slate-500 font-medium">Lead Inv.</th>
                      <th onClick={() => toggleSort('announced_date')} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && toggleSort('announced_date')} className="text-right px-4 py-2 text-[10px] uppercase tracking-widest text-slate-500 font-medium cursor-pointer hover:text-amber-600 select-none focus:outline-none focus:bg-amber-50">
                        Date {sortKey === 'announced_date'
                          ? <span className="text-amber-600 ml-0.5">{sortDir === 'desc' ? '▼' : '▲'}</span>
                          : <span className="text-slate-300 ml-0.5 text-[8px]">⊞</span>}
                      </th>
                      <th className="px-2 py-2 w-[60px]" />
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-100">
                    {sortedDeals.map((deal, idx) => {
                      const tier = dealTier(deal.amount_usd)
                      const favicon = getFaviconUrl(deal.company_website, deal.source_url)
                      const typeKey = deal.deal_type ?? 'unknown'
                      const barPct = deal.amount_usd ? Math.min(100, (deal.amount_usd / maxAmount) * 100) : 0
                      const isNew = lastVisit && deal.created_at && new Date(deal.created_at) > lastVisit
                      return (
                        <tr
                          key={deal.id}
                          onClick={() => deal.company_id && navigate(`/company/${deal.company_id}`)}
                          className={`
                            deal-row cursor-pointer group
                            ${idx % 2 === 1 ? 'bg-slate-50/60' : 'bg-white'}
                            ${tier === 'mega' ? 'mega-deal-row border-l-2 border-l-amber-400' : `border-l-2 ${DEAL_TYPE_LEFT_BORDER[typeKey]}`}
                            ${isNew ? 'border-r-2 border-r-blue-400' : ''}
                          `}
                        >
                          {/* Company */}
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-2 min-w-0">
                              {favicon ? (
                                <img src={favicon} alt="" className="w-3.5 h-3.5 rounded-sm opacity-70 flex-shrink-0"
                                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                              ) : (
                                <CompanyAvatar name={deal.company_name ?? '?'} size={14} />
                              )}
                              <span className="text-[13px] font-medium text-slate-800 group-hover:text-slate-900 truncate max-w-[140px]">
                                {deal.company_name ?? '—'}
                              </span>
                              {deal.source_name && (
                                <SourceBadge source={deal.source_name} />
                              )}
                              {deal.confidence !== undefined && deal.confidence < 0.5 && (
                                <span title={`AI confidence: ${(deal.confidence * 100).toFixed(0)}%`}
                                  className="w-1.5 h-1.5 rounded-full bg-amber-500/60 shrink-0" />
                              )}
                            </div>
                          </td>

                          {/* Type + Round */}
                          <td className="px-3 py-2">
                            <span className={`flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider font-semibold ${DEAL_TYPE_TEXT[typeKey] ?? DEAL_TYPE_TEXT['unknown']}`}>
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${DEAL_TYPE_DOT[typeKey] ?? DEAL_TYPE_DOT['unknown']}`} />
                              {fmtRound(deal.round_label) !== '—'
                                ? fmtRound(deal.round_label)
                                : (deal.deal_type?.toUpperCase() || '—')}
                            </span>
                          </td>

                          {/* Amount + heat bar */}
                          <td className="px-4 py-2 w-[200px]">
                            <div className="flex items-center gap-2">
                              {/* heat bar track */}
                              <div className="flex-1 h-[3px] bg-slate-200 rounded-full overflow-hidden">
                                {barPct > 0 && (
                                  <div
                                    className={`h-full rounded-full ${AMOUNT_BAR_COLOR[tier]}`}
                                    style={{ width: `${barPct}%` }}
                                  />
                                )}
                              </div>
                              <span className={`font-mono text-xs tabular-nums font-semibold w-[56px] text-right ${
                                tier === 'mega' ? 'text-amber-600' :
                                tier === 'large' ? 'text-emerald-600' : 'text-slate-600'
                              }`}>
                                {deal.amount_usd ? fmtAmount(deal.amount_usd) : <span className="text-slate-300">—</span>}
                              </span>
                            </div>
                          </td>

                          {/* Sector */}
                          <td className="px-3 py-2">
                            <div className="flex gap-1">
                              {(deal.sector || []).slice(0, 2).map((s) => (
                                <SectorPill key={s} sector={s} />
                              ))}
                              {(deal.sector || []).length === 0 && <span className="text-slate-300 text-xs">—</span>}
                            </div>
                          </td>

                          {/* Tech Stack */}
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-1">
                              {(deal.tech_stack || []).slice(0, 2).map(tech => (
                                <span key={tech} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200 font-mono">
                                  {tech}
                                </span>
                              ))}
                              {(deal.tech_stack || []).length > 2 && (
                                <span className="text-[10px] text-slate-400 font-mono">+{deal.tech_stack!.length - 2}</span>
                              )}
                            </div>
                          </td>

                          {/* Geo */}
                          <td className="px-3 py-2">
                            {deal.geo
                              ? <span className="text-[11px] text-slate-600 uppercase font-mono">{GEO_FLAGS[deal.geo] ?? ''} {deal.geo}</span>
                              : <span className="text-slate-300 text-xs">—</span>}
                          </td>

                          {/* Lead Investor */}
                          <td className="px-3 py-2 text-[11px] text-slate-500 font-mono truncate max-w-[150px]">
                            {deal.lead_investor ?? <span className="text-slate-300">—</span>}
                          </td>

                          {/* Date */}
                          <td className="px-4 py-2 text-right font-mono text-[11px] text-slate-500 tabular-nums">
                            {deal.announced_date
                              ? new Date(deal.announced_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                              : '—'}
                          </td>

                          {/* Intel quick-add */}
                          <td className="px-2 py-2">
                            {deal.company_website && (
                              <button
                                onClick={(e) => { e.stopPropagation(); addToIntel(deal.company_name ?? '', deal.company_website!) }}
                                title="Analyze with Tech Intel"
                                className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-mono px-2 py-0.5 rounded border border-slate-200 text-slate-500 hover:text-amber-600 hover:border-amber-400 bg-white"
                              >
                                + Intel
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                </div>
              </div>

              {/* Load more */}
              {hasMore && (
                <div className="mt-4 flex justify-center">
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="text-xs font-mono px-4 py-1.5 rounded border border-slate-200 text-slate-500 hover:text-slate-700 hover:border-slate-300 bg-white disabled:opacity-40 transition-colors shadow-sm"
                  >
                    {loadingMore ? 'Loading…' : `Load more deals ↓`}
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
