import { useEffect, useState } from 'react'
import axios from 'axios'

interface InvestorEntry {
  investor_name: string
  deal_count: number
  total_capital_usd: number
}

interface LeaderboardResponse {
  period: string
  date_from: string
  date_to: string
  investors: InvestorEntry[]
}

type Period = 'weekly' | 'monthly' | 'quarterly'

function formatCapital(usd: number): string {
  const m = usd / 1_000_000
  if (m === 0) return '--'
  return m >= 1000 ? `$${(m / 1000).toFixed(1)}B` : `$${Math.round(m)}M`
}

function getRankColor(index: number): string {
  if (index === 0) return 'text-amber-400 font-bold'
  if (index <= 2) return 'text-zinc-300 font-semibold'
  return 'text-zinc-500'
}

export default function InvestorLeaderboard() {
  const [period, setPeriod] = useState<Period>('monthly')
  const [data, setData] = useState<LeaderboardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    axios
      .get('/api/investors/leaderboard', { params: { period, limit: 20 } })
      .then((r) => {
        setData(r.data)
      })
      .catch(() => {
        setError('Could not load investor data.')
      })
      .finally(() => setLoading(false))
  }, [period])

  const periods: { key: Period; label: string }[] = [
    { key: 'weekly', label: 'Weekly' },
    { key: 'monthly', label: 'Monthly' },
    { key: 'quarterly', label: 'Quarterly' },
  ]

  const maxCapital = data?.investors.reduce((m, i) => Math.max(m, i.total_capital_usd), 1) ?? 1

  return (
    <div className="px-6 pt-6 pb-6">
      {/* Page header */}
      <div className="flex items-end justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold text-zinc-50">Investor Leaderboard</h1>
          {data && (
            <p className="text-xs text-zinc-500 mt-0.5 font-mono">
              {data.date_from} — {data.date_to}
            </p>
          )}
        </div>

        {/* Period toggle */}
        <div className="flex items-center border border-zinc-700 rounded-md overflow-hidden">
          {periods.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setPeriod(key)}
              className={`px-3 py-1.5 text-xs font-mono font-semibold uppercase tracking-wide transition-colors ${
                period === key
                  ? 'bg-zinc-800 text-zinc-50'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-zinc-400 font-mono text-sm py-10 text-center">Loading...</div>
      ) : error ? (
        <div className="text-red-400 text-sm py-10 text-center">{error}</div>
      ) : !data || data.investors.length === 0 ? (
        <div className="text-zinc-400 font-mono text-sm py-10 text-center">
          No investor data for this period
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-zinc-800">
                {['Rank', 'Investor', 'Deals', 'Total Capital'].map((h) => (
                  <th
                    key={h}
                    className="text-left text-xs uppercase tracking-wider text-zinc-500 px-4 py-3 font-medium"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.investors.map((entry, idx) => (
                <tr
                  key={entry.investor_name}
                  className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors"
                >
                  <td className={`px-4 py-3 font-mono text-sm tabular ${getRankColor(idx)}`}>
                    #{idx + 1}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-zinc-100">
                    {entry.investor_name}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-zinc-300 text-sm tabular">
                    {entry.deal_count}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="relative inline-flex items-center justify-end w-full">
                      <div
                        className="absolute left-0 top-0 bottom-0 bg-emerald-500/20 rounded"
                        style={{ width: `${Math.round((entry.total_capital_usd / maxCapital) * 100)}%` }}
                      />
                      <span className="relative text-emerald-400 tabular text-sm font-mono">
                        {formatCapital(entry.total_capital_usd)}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
