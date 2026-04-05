import { useState, useEffect, useMemo } from 'react'
import axios from 'axios'
import { LineChart, BarChart } from '@tremor/react'
import LoadingSpinner from '../components/LoadingSpinner'
import ErrorBanner from '../components/ErrorBanner'

// --- Interfaces ---

interface WeekPoint {
  week_start: string
  deal_type: string
  deal_count: number
  total_capital_usd: number
}

interface SectorBar {
  sector: string
  deal_count: number
  total_capital_usd: number
}

interface TrendsResponse {
  weeks: number
  date_from: string
  weekly_by_type: WeekPoint[]
  top_sectors: SectorBar[]
}

// --- Semantic chart colors ---

const DEAL_TYPE_TREMOR_COLORS: Record<string, string> = {
  VC:     'emerald',
  Crypto: 'violet',
  'M&A':  'sky',
  IPO:    'rose',
}

function getChartColors(categories: string[]): string[] {
  return categories.map((c) => DEAL_TYPE_TREMOR_COLORS[c] ?? 'amber')
}

// --- Helpers ---

const DEAL_TYPE_LABELS: Record<string, string> = {
  vc: 'VC',
  ma: 'M&A',
  crypto: 'Crypto',
  ipo: 'IPO',
}

function formatWeekLabel(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00')
  const month = d.toLocaleDateString('en-US', { month: 'short' })
  const weekNum = Math.ceil(d.getDate() / 7)
  return `${month} W${weekNum}`
}

function buildLineData(points: WeekPoint[]): Record<string, string | number>[] {
  const byWeek = new Map<string, Record<string, number>>()
  for (const p of points) {
    if (!byWeek.has(p.week_start)) byWeek.set(p.week_start, {})
    const entry = byWeek.get(p.week_start)!
    const label = DEAL_TYPE_LABELS[p.deal_type] ?? p.deal_type.toUpperCase()
    entry[label] = (entry[label] ?? 0) + p.total_capital_usd
  }
  return Array.from(byWeek.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, values]) => ({
      week: formatWeekLabel(weekStart),
      ...values,
    }))
}

function buildBarData(sectors: SectorBar[]): { sector: string; Deals: number }[] {
  return sectors.map((s) => ({ sector: s.sector, Deals: s.deal_count }))
}

function fmtCapital(v: number): string {
  const m = v / 1_000_000
  return m >= 1000 ? `$${(m / 1000).toFixed(1)}B` : `$${m.toFixed(1)}M`
}

function totalCapital(points: WeekPoint[]): number {
  return points.reduce((sum, p) => sum + p.total_capital_usd, 0)
}

// --- Component ---

export default function Trends() {
  const [data, setData] = useState<TrendsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [briefingSummary, setBriefingSummary] = useState<string | null>(null)

  const [period] = useState('monthly')

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    axios
      .get('/api/trends', { params: { period }, signal: controller.signal })
      .then((r) => setData(r.data))
      .catch((err) => { if (!axios.isCancel(err)) setError('Could not load trend data.') })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [period])

  useEffect(() => {
    const controller = new AbortController()
    axios.get('/api/briefing/latest', { signal: controller.signal })
      .then((r) => setBriefingSummary(r.data?.ai_summary ?? null))
      .catch(() => {})
    return () => controller.abort()
  }, [])

  const lineData = data ? buildLineData(data.weekly_by_type) : []
  const barData = data ? buildBarData(data.top_sectors) : []
  const grandTotal = data ? totalCapital(data.weekly_by_type) : 0

  const lineCategories = ['VC', 'M&A', 'Crypto', 'IPO']

  const topSector = data?.top_sectors[0]
  const topDealType = useMemo(() => {
    if (!data) return null
    const totals: Record<string, number> = {}
    for (const p of data.weekly_by_type) {
      const label = DEAL_TYPE_LABELS[p.deal_type] ?? p.deal_type
      totals[label] = (totals[label] ?? 0) + p.total_capital_usd
    }
    const sorted = Object.entries(totals).sort(([,a],[,b]) => b - a)
    return sorted[0] ?? null
  }, [data])

  return (
    <div className="pb-6">
      {/* ── Hero band ──────────────────────────────────────────── */}
      <div className="terminal-bg border-b border-zinc-800/60 px-6 py-6">
        <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-mono mb-3">
          Market Intelligence · Capital Trends
        </div>
        <div className="flex items-end gap-8 flex-wrap">
          <div>
            <div className="text-[9px] uppercase tracking-widest text-zinc-600 font-mono mb-1">{data?.weeks ?? '—'}-Week Total</div>
            <div className="stat-number text-4xl font-black text-emerald-400 amount-glow">
              {loading ? '—' : fmtCapital(grandTotal)}
            </div>
          </div>
          {topDealType && (
            <div className="border-l border-zinc-800 pl-8">
              <div className="text-[9px] uppercase tracking-widest text-zinc-600 font-mono mb-1">Leading Type</div>
              <div className="stat-number text-2xl font-bold text-zinc-100">{topDealType[0]}</div>
              <div className="text-xs text-zinc-500 font-mono">{fmtCapital(topDealType[1])}</div>
            </div>
          )}
          {topSector && (
            <div className="border-l border-zinc-800 pl-8">
              <div className="text-[9px] uppercase tracking-widest text-zinc-600 font-mono mb-1">Top Sector</div>
              <div className="stat-number text-2xl font-bold text-zinc-100 capitalize">{topSector.sector}</div>
              <div className="text-xs text-zinc-500 font-mono">{topSector.deal_count} deals</div>
            </div>
          )}
        </div>

        {briefingSummary && (
          <div className="mt-4 flex items-start gap-2 border border-amber-500/20 bg-amber-500/5 rounded-lg px-4 py-2.5 max-w-3xl">
            <span className="text-[9px] uppercase tracking-widest text-amber-500 font-mono mt-0.5 shrink-0">AI</span>
            <p className="text-xs text-zinc-400 leading-relaxed">{briefingSummary}</p>
          </div>
        )}
      </div>

      <div className="px-6 pt-5">
        {loading && <LoadingSpinner />}
        {!loading && error && <ErrorBanner message={error} />}

        {!loading && !error && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Left: LineChart */}
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="text-[9px] uppercase tracking-widest text-zinc-600 font-mono mb-1">Capital Flow</div>
                  <h2 className="text-sm font-semibold text-zinc-100">Weekly Capital Raised</h2>
                  <p className="text-[10px] text-zinc-600 mt-0.5 font-mono">USD by deal type</p>
                </div>
                <div className="flex gap-2">
                  {['VC','Crypto','M&A','IPO'].map(type => (
                    <span key={type} className="text-[9px] font-mono text-zinc-600">
                      <span className={`inline-block w-2 h-0.5 mr-1 rounded ${
                        type === 'VC' ? 'bg-emerald-500' :
                        type === 'Crypto' ? 'bg-violet-500' :
                        type === 'M&A' ? 'bg-sky-500' : 'bg-rose-500'
                      }`} />
                      {type}
                    </span>
                  ))}
                </div>
              </div>
              {lineData.length === 0 ? (
                <div className="h-64 flex items-center justify-center border border-dashed border-zinc-800 rounded-lg">
                  <p className="text-sm text-zinc-600">No trend data yet</p>
                </div>
              ) : (
                <LineChart
                  data={lineData}
                  index="week"
                  categories={lineCategories}
                  colors={getChartColors(lineCategories)}
                  valueFormatter={fmtCapital}
                  yAxisWidth={64}
                  className="h-64"
                  showLegend={false}
                />
              )}
            </div>

            {/* Right: BarChart */}
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-5">
              <div className="mb-4">
                <div className="text-[9px] uppercase tracking-widest text-zinc-600 font-mono mb-1">Sector Distribution</div>
                <h2 className="text-sm font-semibold text-zinc-100">Deal Count by Sector</h2>
                <p className="text-[10px] text-zinc-600 mt-0.5 font-mono">All periods</p>
              </div>
              {barData.length === 0 ? (
                <div className="h-64 flex items-center justify-center border border-dashed border-zinc-800 rounded-lg">
                  <p className="text-sm text-zinc-600">No sector data yet</p>
                </div>
              ) : (
                <BarChart
                  data={barData}
                  index="sector"
                  categories={['Deals']}
                  colors={['amber']}
                  valueFormatter={(v: number) => `${v}`}
                  yAxisWidth={48}
                  className="h-64"
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
