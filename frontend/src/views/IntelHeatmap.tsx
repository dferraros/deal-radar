import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { BarChart2, ArrowLeft } from 'lucide-react'
import LoadingSpinner from '../components/LoadingSpinner'
import ErrorBanner from '../components/ErrorBanner'

interface ScoreItem {
  node_id: string
  period_start: string
  period_end: string
  company_count: number
  capital_weighted_score: number
  growth_rate: number
}

interface TrendsResponse { items: ScoreItem[] }

export default function IntelHeatmap() {
  const navigate = useNavigate()
  const [data, setData] = useState<ScoreItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ontology, setOntology] = useState<Record<string, string>>({})

  useEffect(() => {
    Promise.all([
      axios.get<TrendsResponse>('/api/intel/technologies/trends'),
      axios.get<Array<{ id: string; canonical_name: string }>>('/api/intel/ontology/nodes'),
    ])
      .then(([trendsRes, ontRes]) => {
        setData(trendsRes.data.items)
        const map: Record<string, string> = {}
        ontRes.data.forEach((n) => { map[n.id] = n.canonical_name })
        setOntology(map)
      })
      .catch(() => setError('Could not load trend data.'))
      .finally(() => setLoading(false))
  }, [])

  const periods = [...new Set(data.map((d) => d.period_start))].sort()
  const nodeIds = [...new Set(data.map((d) => d.node_id))]

  const pivot: Record<string, Record<string, ScoreItem>> = {}
  data.forEach((d) => {
    if (!pivot[d.node_id]) pivot[d.node_id] = {}
    pivot[d.node_id][d.period_start] = d
  })

  const sortedNodes = nodeIds.sort((a, b) => {
    const sumA = Object.values(pivot[a] || {}).reduce((s, x) => s + x.capital_weighted_score, 0)
    const sumB = Object.values(pivot[b] || {}).reduce((s, x) => s + x.capital_weighted_score, 0)
    return sumB - sumA
  })

  const maxScore = data.reduce((m, d) => Math.max(m, d.capital_weighted_score), 1)

  function getCellClass(score: number): string {
    if (score === 0 || !score) return 'bg-zinc-900 border-zinc-800'
    const r = score / maxScore
    if (r < 0.05) return 'bg-emerald-950 border-emerald-900/40'
    if (r < 0.15) return 'bg-emerald-900 border-emerald-800/50'
    if (r < 0.30) return 'bg-emerald-800 border-emerald-700/60'
    if (r < 0.50) return 'bg-emerald-700 border-emerald-600/70'
    if (r < 0.75) return 'bg-emerald-600 border-emerald-500/80'
    return 'bg-emerald-500 border-emerald-400/80'
  }

  function formatPeriod(p: string): string {
    const d = new Date(p)
    return `Q${Math.ceil((d.getMonth() + 1) / 3)} ${d.getFullYear()}`
  }

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="px-6 pt-6 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-zinc-50 flex items-center gap-2">
            <BarChart2 size={18} className="text-amber-400" strokeWidth={1.5} />
            Technology Trend Heatmap
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Capital-weighted primitive adoption over time
          </p>
        </div>
        <button onClick={() => navigate('/intel')} className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1">
          <ArrowLeft size={12} /> Queue
        </button>
      </div>

      <div className="flex-1 px-6 pb-6">
        {loading ? <LoadingSpinner /> : error ? <ErrorBanner message={error} /> :
          sortedNodes.length === 0 ? (
            <div className="flex items-center justify-center h-64 bg-zinc-900 border border-zinc-800 rounded-lg">
              <p className="text-zinc-500 text-sm">No trend data yet — analyze some companies first.</p>
            </div>
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-auto">
              <table className="text-xs w-full">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="px-4 py-3 text-left font-mono text-zinc-500 sticky left-0 bg-zinc-900 min-w-[220px]">Primitive</th>
                    {periods.map((p) => (
                      <th key={p} className="px-3 py-3 text-center font-mono text-zinc-500 min-w-[80px]">{formatPeriod(p)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedNodes.slice(0, 30).map((nodeId) => (
                    <tr key={nodeId} className="border-b border-zinc-800/40">
                      <td className="px-4 py-2 text-zinc-300 sticky left-0 bg-zinc-900 font-medium truncate max-w-[220px]">
                        {ontology[nodeId] || nodeId}
                      </td>
                      {periods.map((period) => {
                        const cell = pivot[nodeId]?.[period]
                        const score = cell?.capital_weighted_score || 0
                        const companies = cell?.company_count || 0
                        return (
                          <td key={period} className="px-1 py-1">
                            <div
                              title={`${score.toFixed(1)}M capital · ${companies} companies`}
                              className={`h-8 rounded border text-center flex items-center justify-center cursor-default transition-all hover:ring-1 hover:ring-emerald-400 ${getCellClass(score)}`}
                            >
                              {companies > 0 && <span className="text-zinc-100/70 font-mono">{companies}</span>}
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </div>
    </div>
  )
}
