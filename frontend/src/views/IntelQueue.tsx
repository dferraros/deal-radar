import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { Brain, Plus, RefreshCw, AlertTriangle, CheckCircle, Loader2, Clock } from 'lucide-react'
import LoadingSpinner from '../components/LoadingSpinner'
import ErrorBanner from '../components/ErrorBanner'

interface QueueItem {
  id: string
  company_name: string
  website: string
  status: string
  queued_at: string
  completed_at: string | null
  error_log: string | null
  tech_preview: string[]
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  queued:      { label: 'Queued',      color: 'text-slate-500 bg-slate-100',         icon: Clock },
  crawling:    { label: 'Crawling',    color: 'text-sky-400 bg-sky-950/50',           icon: Loader2 },
  extracting:  { label: 'Extracting', color: 'text-amber-400 bg-amber-950/50',       icon: Loader2 },
  normalizing: { label: 'Normalizing',color: 'text-violet-400 bg-violet-950/50',     icon: Loader2 },
  done:        { label: 'Done',        color: 'text-emerald-400 bg-emerald-950/50',  icon: CheckCircle },
  failed:      { label: 'Failed',      color: 'text-rose-400 bg-rose-950/50',        icon: AlertTriangle },
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function IntelQueue() {
  const navigate = useNavigate()
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ company_name: '', website: '' })
  const [adding, setAdding] = useState(false)

  const fetchQueue = () => {
    axios.get('/api/intel/queue')
      .then((r) => setQueue(r.data))
      .catch(() => setError('Could not load intel queue.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchQueue()
    const interval = setInterval(() => {
      const hasActive = queue.some((q) => ['queued','crawling','extracting','normalizing'].includes(q.status))
      if (hasActive) fetchQueue()
    }, 8000)
    return () => clearInterval(interval)
  }, [queue.length])

  const handleAdd = async () => {
    if (!addForm.company_name || !addForm.website) return
    setAdding(true)
    const website = addForm.website.startsWith('http') ? addForm.website : `https://${addForm.website}`
    try {
      await axios.post('/api/intel/queue', { ...addForm, website })
      setAddForm({ company_name: '', website: '' })
      setShowAdd(false)
      fetchQueue()
    } catch {
      setError('Failed to add company.')
    } finally {
      setAdding(false)
    }
  }

  const handleRetry = async (id: string) => {
    await axios.post(`/api/intel/queue/${id}/retry`)
    fetchQueue()
  }

  const handleDelete = async (id: string) => {
    await axios.delete(`/api/intel/queue/${id}`)
    fetchQueue()
  }

  const statCards = [
    {
      label: 'Analyzed',
      value: queue.filter((q) => q.status === 'done').length,
      color: 'text-emerald-400',
    },
    {
      label: 'Processing',
      value: queue.filter((q) => ['crawling', 'extracting', 'normalizing'].includes(q.status)).length,
      color: 'text-amber-400',
    },
    {
      label: 'Queued',
      value: queue.filter((q) => q.status === 'queued').length,
      color: 'text-slate-500',
    },
    {
      label: 'Failed',
      value: queue.filter((q) => q.status === 'failed').length,
      color: 'text-rose-400',
    },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Brain size={18} className="text-amber-400" strokeWidth={1.5} />
            Tech Intel
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Capital-weighted technology bet inference — add companies to analyze
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate('/intel/graph')}
            className="text-xs px-3 py-1.5 rounded border border-slate-200 text-slate-500 hover:text-slate-700 transition-colors font-mono"
          >
            Graph
          </button>
          <button
            onClick={() => navigate('/intel/heatmap')}
            className="text-xs px-3 py-1.5 rounded border border-slate-200 text-slate-500 hover:text-slate-700 transition-colors font-mono"
          >
            Heatmap
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="text-xs px-3 py-1.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 transition-colors flex items-center gap-1"
          >
            <Plus size={12} /> Add Company
          </button>
        </div>
      </div>

      {/* Add modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
          <div className="bg-white border border-slate-200 rounded-xl p-6 w-full max-w-md shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900 mb-4">Add Company to Intel Queue</h2>
            <div className="space-y-3">
              <input
                className="w-full bg-white border border-slate-200 rounded px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-amber-400"
                placeholder="Company name"
                value={addForm.company_name}
                onChange={(e) => setAddForm((f) => ({ ...f, company_name: e.target.value }))}
              />
              <input
                className="w-full bg-white border border-slate-200 rounded px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-amber-400"
                placeholder="https://company.com"
                value={addForm.website}
                onChange={(e) => setAddForm((f) => ({ ...f, website: e.target.value }))}
              />
            </div>
            <div className="flex gap-2 mt-4 justify-end">
              <button onClick={() => setShowAdd(false)} className="text-xs px-3 py-1.5 text-slate-500 hover:text-slate-700">Cancel</button>
              <button
                onClick={handleAdd}
                disabled={adding}
                className="text-xs px-4 py-1.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 disabled:opacity-50"
              >
                {adding ? 'Adding...' : 'Add & Analyze'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 px-6 pb-6 overflow-auto">
        {loading ? <LoadingSpinner /> : error ? <ErrorBanner message={error} /> : (
          <>
            {/* Stats strip */}
            {queue.length > 0 && (
              <div className="grid grid-cols-4 gap-3 mb-5">
                {statCards.map((card) => (
                  <div
                    key={card.label}
                    className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 shadow-sm"
                  >
                    <div className={`text-xl font-bold ${card.color}`}>{card.value}</div>
                    <div className="text-xs text-slate-500 font-mono uppercase tracking-wider mt-0.5">{card.label}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Empty state */}
            {queue.length === 0 && (
              <div className="mt-8 flex flex-col items-center text-center max-w-lg mx-auto">
                <div className="w-12 h-12 rounded-full bg-amber-400/10 flex items-center justify-center mb-4">
                  <Brain size={24} className="text-amber-400" />
                </div>
                <h3 className="text-slate-900 font-semibold mb-2">No companies analyzed yet</h3>
                <p className="text-slate-500 text-sm mb-6 leading-relaxed">
                  Add a funded company to infer which technical primitives they actually build on —
                  from their product pages, docs, blog, and careers listings.
                  Capital-weighted across the portfolio.
                </p>
                <div className="w-full bg-slate-50 border border-slate-200 rounded-lg p-4 shadow-sm">
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-3 font-mono">Try these examples</p>
                  <div className="grid grid-cols-1 gap-2">
                    {[
                      { name: 'Mistral AI', website: 'https://mistral.ai' },
                      { name: 'Cohere', website: 'https://cohere.com' },
                      { name: 'Scale AI', website: 'https://scale.com' },
                    ].map(({ name, website }) => (
                      <button
                        key={name}
                        onClick={() => {
                          setAddForm({ company_name: name, website })
                          setShowAdd(true)
                        }}
                        className="flex items-center justify-between px-3 py-2 rounded bg-white hover:bg-slate-50 transition-colors text-left border border-slate-200"
                      >
                        <span className="text-sm text-slate-800">{name}</span>
                        <span className="text-xs text-slate-500 font-mono">{website}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Card list */}
            {queue.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                {queue.map((item, idx) => {
                  const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.queued
                  const Icon = cfg.icon
                  const isActive = ['crawling', 'extracting', 'normalizing'].includes(item.status)
                  const isDone = item.status === 'done'

                  return (
                    <div
                      key={item.id}
                      className={[
                        'flex items-center gap-4 px-4 py-3 transition-colors hover:bg-slate-50',
                        idx < queue.length - 1 ? 'border-b border-slate-200' : '',
                        isActive ? 'ring-1 ring-inset ring-amber-500/20 border-l-2 border-amber-500/60' : '',
                      ].join(' ')}
                    >
                      {/* Left: 50% — name + website + tech chips */}
                      <div className="flex-[5] min-w-0">
                        <button
                          onClick={() => isDone && navigate(`/intel/dossier/${item.id}`)}
                          className={[
                            'font-semibold text-sm truncate block',
                            isDone ? 'text-slate-900 hover:text-amber-400 cursor-pointer' : 'text-slate-400 cursor-default',
                          ].join(' ')}
                        >
                          {item.company_name}
                        </button>
                        <div className="text-xs text-slate-500 font-mono truncate mt-0.5">{item.website}</div>
                        {isDone && item.tech_preview.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {item.tech_preview.map((tech) => (
                              <span
                                key={tech}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-amber-950/40 text-amber-400 border border-amber-800/30 font-mono"
                              >
                                {tech}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Center: 30% — status badge + relative time */}
                      <div className="flex-[3] flex flex-col items-start gap-1">
                        <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded font-mono ${cfg.color}`}>
                          <Icon size={10} className={isActive ? 'animate-spin' : ''} />
                          {cfg.label}
                        </span>
                        <span className="text-[11px] text-slate-400 font-mono">
                          {relativeTime(item.queued_at)}
                        </span>
                      </div>

                      {/* Right: 20% — actions */}
                      <div className="flex-[2] flex items-center gap-2 justify-end">
                        {item.status === 'failed' && (
                          <button
                            onClick={() => handleRetry(item.id)}
                            className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1"
                          >
                            <RefreshCw size={10} /> Retry
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="text-xs text-slate-400 hover:text-rose-400 transition-colors"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
