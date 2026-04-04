import { useEffect, useState, useCallback } from 'react'
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
  return m >= 100 ? `$${Math.round(m)}M` : `$${m.toFixed(1)}M`
}

function formatCapital(usd: number | null | undefined): string {
  if (usd === null || usd === undefined || isNaN(usd)) return '--'
  const m = usd / 1_000_000
  return m >= 1000 ? `$${(m / 1000).toFixed(1)}B` : `$${Math.round(m)}M`
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
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [briefing, setBriefing] = useState<BriefingResponse | null>(null)
  const [lastVisit, setLastVisit] = useState<Date | null>(null)
  const [newCount, setNewCount] = useState(0)

  const fetchDeals = useCallback(async (f: FilterState) => {
    setLoading(true)
    setError(null)
    setPage(1)
    try {
      const params = { ...buildParams(f), page: '1', limit: '25' }
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
        params: { ...buildParams(filters), page: String(nextPage), limit: '25' },
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
    fetchDeals(filters)
  }, [fetchDeals]) // eslint-disable-line react-hooks/exhaustive-deps

  // Client-side search filter
  const visibleDeals = deals.filter(
    (d) =>
      !search ||
      d.company_name?.toLowerCase().includes(search.toLowerCase()) ||
      d.lead_investor?.toLowerCase().includes(search.toLowerCase())
  )

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

      {/* Weekly briefing banner */}
      {briefing?.ai_summary && (
        <div className="mx-6 mb-4 bg-zinc-900 border border-blue-500/30 rounded-lg px-4 py-3 text-sm">
          <span className="text-xs uppercase tracking-widest text-blue-400 font-mono mr-2">
            WEEKLY BRIEFING
          </span>
          <span className="text-zinc-300">{briefing.ai_summary}</span>
          <span className="text-xs text-zinc-500 ml-2 font-mono">
            {briefing.deal_count} deals · {formatCapital(briefing.total_capital_usd)}
          </span>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-4 px-6 pb-4">
        {[
          { label: 'Deals This Week', value: loading ? '...' : weekDeals.length.toString() },
          { label: 'Capital Raised', value: loading ? '...' : formatCapital(weekCapital) },
          { label: 'Top Sector', value: loading ? '...' : topSector ?? '—' },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3">
            <div className="text-xs uppercase tracking-wider text-zinc-500 mb-1">{kpi.label}</div>
            <div className="font-mono text-xl font-semibold text-zinc-50">{kpi.value}</div>
          </div>
        ))}
      </div>

      <div className="px-6 pb-6">
        {/* Search */}
        <input
          placeholder="Search companies, investors..."
          className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-blue-500 rounded-lg px-4 py-2 text-sm mb-2"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {/* Filter bar */}
        <FilterBar
          filters={filters}
          sectors={sectors}
          onFilterChange={(f) => {
            setFilters(f)
            fetchDeals(f)
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
                        onClick={() =>
                          deal.company_id && navigate(`/company/${deal.company_id}`)
                        }
                        className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 cursor-pointer transition-colors group ${
                          lastVisit && deal.created_at && new Date(deal.created_at) > lastVisit
                            ? 'border-l-2 border-l-blue-500'
                            : ''
                        }`}
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
                        <td className="px-4 py-3 text-right">
                          {deal.amount_usd ? (
                            <span className="font-mono text-sm tabular-nums text-emerald-400">
                              {formatAmount(deal.amount_usd)}
                            </span>
                          ) : (
                            <span className="text-zinc-600 text-xs font-mono">—</span>
                          )}
                        </td>
                        {/* Sector */}
                        <td className="px-4 py-3 text-xs text-zinc-400">
                          {(deal.sector || []).join(', ') || '—'}
                        </td>
                        {/* Geo */}
                        <td className="px-4 py-3 text-xs text-zinc-400 uppercase">
                          {deal.geo ?? '—'}
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
