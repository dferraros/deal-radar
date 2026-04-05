import { useState, useEffect } from 'react'
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

  useEffect(() => {
    axios
      .get('/api/trends')
      .then((r) => setData(r.data))
      .catch(() =>
        setError('Could not load data. Check your connection or try refreshing the page.')
      )
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    axios.get('/api/briefing/latest').then((r) => {
      setBriefingSummary(r.data?.ai_summary ?? null)
    }).catch(() => {})
  }, [])

  const lineData = data ? buildLineData(data.weekly_by_type) : []
  const barData = data ? buildBarData(data.top_sectors) : []
  const grandTotal = data ? totalCapital(data.weekly_by_type) : 0

  const lineCategories = ['VC', 'M&A', 'Crypto', 'IPO']

  return (
    <div className="px-6 pt-6 pb-6">
      {/* Page header */}
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-zinc-50">Trends</h1>
        {data && grandTotal > 0 && (
          <p className="text-xs text-zinc-500 mt-0.5 font-mono">
            {fmtCapital(grandTotal)} tracked over {data.weeks} weeks
          </p>
        )}
      </div>

      {loading && <LoadingSpinner />}
      {!loading && error && <ErrorBanner message={error} />}

      {!loading && !error && (
        <>
          {briefingSummary && (
            <div className="mb-6 border-l-4 border-amber-400 bg-amber-400/5 rounded-r-lg px-4 py-3">
              <div className="text-[10px] uppercase tracking-wider text-amber-500 font-mono mb-1">
                AI Insight
              </div>
              <p className="text-sm text-zinc-300">{briefingSummary}</p>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Left: LineChart — Capital by deal type per week */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
              <p className="text-xs uppercase tracking-wider text-zinc-500 mb-1">
                Capital by Deal Type
              </p>
              <h2 className="text-sm font-semibold text-zinc-100 mb-0.5">
                Weekly Capital Raised
              </h2>
              <p className="text-xs text-zinc-500 mb-2">USD · click legend to filter</p>
              {lineData.length === 0 ? (
                <div className="h-64 flex items-center justify-center">
                  <p className="text-sm text-zinc-400">No trend data available yet.</p>
                </div>
              ) : (
                <LineChart
                  data={lineData}
                  index="week"
                  categories={lineCategories}
                  colors={getChartColors(lineCategories)}
                  valueFormatter={fmtCapital}
                  yAxisWidth={64}
                  className="h-64 mt-4"
                  showLegend={true}
                />
              )}
            </div>

            {/* Right: BarChart — Top sectors by deal count */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
              <p className="text-xs uppercase tracking-wider text-zinc-500 mb-1">
                Sector Distribution
              </p>
              <h2 className="text-sm font-semibold text-zinc-100 mb-0.5">
                Top Sectors by Deal Count
              </h2>
              <p className="text-xs text-zinc-500 mb-2">This month</p>
              {barData.length === 0 ? (
                <div className="h-64 flex items-center justify-center">
                  <p className="text-sm text-zinc-400">No sector data available yet.</p>
                </div>
              ) : (
                <BarChart
                  data={barData}
                  index="sector"
                  categories={['Deals']}
                  colors={['amber']}
                  valueFormatter={(v: number) => `${v}`}
                  yAxisWidth={48}
                  className="h-64 mt-4"
                />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
