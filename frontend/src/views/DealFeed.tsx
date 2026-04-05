import { useEffect, useState, useCallback, useRef } from 'react'
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
  tech_stack?: string[]
  confidence?: number
  created_at?: string | null
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

function formatAmount(usd: number): string {
  const m = usd / 1_000_000
  if (m >= 1000) return `$${(m / 1000).toFixed(1)}B`
  return m >= 100 ? `$${Math.round(m)}M` : `$${m.toFixed(1)}M`
}

function formatCapital(usd: number | null | undefined): string {
  if (usd === null || usd === undefined || isNaN(usd)) return '--'
  const m = usd / 1_000_000
  return m >= 1000 ? `$${(m / 1000).toFixed(1)}B` : `$${Math.round(m)}M`
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

// Used in Task 5 for company momentum visualization
export function MomentumDots({ count }: { count: number }) {
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

function getAmountIntensityClass(amount: number | null, maxAmount: number): string {
  if (!amount || maxAmount === 0) return ''
  const ratio = amount / maxAmount
  if (ratio > 0.8) return 'bg-emerald-950/70'
  if (ratio > 0.5) return 'bg-emerald-950/50'
  if (ratio > 0.25) return 'bg-emerald-950/30'
  return ''
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

  const sectorCounts: Record<string, number> = {}
  for (const d of deals) {
    for (const s of d.sector || []) {
      sectorCounts[s] = (sectorCounts[s] ?? 0) + 1
    }
  }
  const topSector = Object.entries(sectorCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  const maxDealAmount = Math.max(...visibleDeals.map((d) => d.amount_usd ?? 0), 1)

  return (
    <div>
      {/* Ticker / status bar */}
      <div className="bg-zinc-900 border-b border-zinc-800 px-6 py-1.5 flex items-center gap-6 text-xs font-mono text-zinc-400">
        <span>
          DEALS TODAY: <span className="text-zinc-100">{loading ? '...' : todayDeals.length}</span>
        </span>
        <span>
          CAPITAL TODAY:{' '}
          <span className="text-emerald-400">
            {loading ? '...' : todayCapital > 0 ? formatCapital(todayCapital) : '--'}
          </span>
        </span>
        {lastSync && (
          <span>
            LAST UPDATED: <span className="text-zinc-100">{lastSync}</span>
          </span>
        )}
      </div>

      {/* Page header */}
      <div className="px-6 pt-6 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-zinc-50">Deal Feed</h1>
          {!loading && (
            <p className="text-xs text-zinc-500 mt-0.5 flex items-center gap-2">
              {deals.length} deals loaded
              {newCount > 0 && (
                <span className="text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-full px-2 py-0.5 font-mono">
                  {newCount} new
                </span>
              )}
            </p>
          )}
        </div>
        <button
          onClick={() => exportCSV(visibleDeals)}
          className="text-xs px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-zinc-50 border border-zinc-700 rounded-md transition-colors font-mono"
        >
          Export CSV
        </button>
      </div>

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

      {/* === HERO DEAL CARDS — top 3 by amount === */}
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
              const leftBorder = DEAL_TYPE_LEFT_BORDER[typeKey] ?? DEAL_TYPE_LEFT_BORDER['unknown']
              const bgCls = DEAL_TYPE_BG[typeKey] ?? ''
              return (
                <div
                  key={deal.id}
                  onClick={() => deal.company_id && navigate(`/company/${deal.company_id}`)}
                  className={`border-l-4 ${leftBorder} ${bgCls} border border-zinc-800 rounded-xl p-4 cursor-pointer hover:bg-zinc-800/70 transition-colors`}
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

      <div className="px-6 pb-6">
        {/* Search */}
        <div className="px-0 pt-0 pb-2">
          <input
            type="text"
            placeholder="Search company name..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full max-w-sm bg-zinc-900 border border-zinc-700 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-amber-500 rounded-md px-3 py-1.5 text-sm"
          />
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
                      <th className="text-right px-4 py-3 text-xs uppercase tracking-wider text-zinc-500 font-medium">
                        Amount
                      </th>
                      <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-zinc-500 font-medium">
                        Sector
                      </th>
                      <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-zinc-500 font-medium">
                        Tech
                      </th>
                      <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-zinc-500 font-medium">
                        Track
                      </th>
                      <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-zinc-500 font-medium">
                        Geo
                      </th>
                      <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-zinc-500 font-medium">
                        Investors
                      </th>
                      <th className="text-right px-4 py-3 text-xs uppercase tracking-wider text-zinc-500 font-medium">
                        Date
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleDeals.map((deal) => (
                      <tr
                        key={deal.id}
                        onClick={() => deal.company_id && navigate(`/company/${deal.company_id}`)}
                        className={`border-b border-zinc-800/50 cursor-pointer transition-colors group border-l-4 ${
                          DEAL_TYPE_LEFT_BORDER[deal.deal_type ?? 'unknown'] ?? DEAL_TYPE_LEFT_BORDER['unknown']
                        } ${
                          lastVisit && deal.created_at && new Date(deal.created_at) > lastVisit
                            ? 'border-r-2 border-r-blue-500/70'
                            : ''
                        } hover:bg-zinc-800/30`}
                      >
                        {/* Company */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <CompanyAvatar name={deal.company_name ?? '?'} size={28} />
                            <div className="flex items-center gap-1 min-w-0">
                              <span className="text-sm font-medium text-zinc-100 group-hover:text-white truncate max-w-[130px]">
                                {deal.company_name ?? '—'}
                              </span>
                              {deal.source_name && (
                                <span className="text-[10px] text-zinc-600 font-mono ml-1 shrink-0">
                                  {deal.source_name}
                                </span>
                              )}
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
                            {deal.round_label || deal.deal_type?.toUpperCase() || '—'}
                          </span>
                        </td>
                        {/* Amount */}
                        <td className={`px-4 py-3 text-right tabular ${getAmountIntensityClass(deal.amount_usd, maxDealAmount)}`}>
                          {deal.amount_usd ? (
                            <span className="font-mono text-sm text-emerald-400 amount-glow">
                              {formatAmount(deal.amount_usd)}
                            </span>
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
                        {/* Momentum */}
                        <td className="px-4 py-3">
                          <MomentumDots count={
                            deals.filter((d) => d.company_id != null && d.company_id === deal.company_id).length
                          } />
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
                      </tr>
                    ))}
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
