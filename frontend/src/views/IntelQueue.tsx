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
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  queued:      { label: 'Queued',      color: 'text-zinc-400 bg-zinc-800',           icon: Clock },
  crawling:    { label: 'Crawling',    color: 'text-sky-400 bg-sky-950/50',           icon: Loader2 },
  extracting:  { label: 'Extracting', color: 'text-amber-400 bg-amber-950/50',       icon: Loader2 },
  normalizing: { label: 'Normalizing',color: 'text-violet-400 bg-violet-950/50',     icon: Loader2 },
  done:        { label: 'Done',        color: 'text-emerald-400 bg-emerald-950/50',  icon: CheckCircle },
  failed:      { label: 'Failed',      color: 'text-rose-400 bg-rose-950/50',        icon: AlertTriangle },
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

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-6 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-zinc-50 flex items-center gap-2">
            <Brain size={18} className="text-amber-400" strokeWidth={1.5} />
            Tech Intel
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Capital-weighted technology bet inference — add companies to analyze
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate('/intel/graph')}
            className="text-xs px-3 py-1.5 rounded border border-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors font-mono"
          >
            Graph
          </button>
          <button
            onClick={() => navigate('/intel/heatmap')}
            className="text-xs px-3 py-1.5 rounded border border-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors font-mono"
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

      {showAdd && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-full max-w-md">
            <h2 className="text-sm font-semibold text-zinc-100 mb-4">Add Company to Intel Queue</h2>
            <div className="space-y-3">
              <input
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500/50"
                placeholder="Company name"
                value={addForm.company_name}
                onChange={(e) => setAddForm((f) => ({ ...f, company_name: e.target.value }))}
              />
              <input
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500/50"
                placeholder="https://company.com"
                value={addForm.website}
                onChange={(e) => setAddForm((f) => ({ ...f, website: e.target.value }))}
              />
            </div>
            <div className="flex gap-2 mt-4 justify-end">
              <button onClick={() => setShowAdd(false)} className="text-xs px-3 py-1.5 text-zinc-400 hover:text-zinc-200">Cancel</button>
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
          {!loading && queue.length === 0 && (
            <div className="mt-8 flex flex-col items-center text-center max-w-lg mx-auto">
              <div className="w-12 h-12 rounded-full bg-amber-400/10 flex items-center justify-center mb-4">
                <Brain size={24} className="text-amber-400" />
              </div>
              <h3 className="text-zinc-100 font-semibold mb-2">No companies analyzed yet</h3>
              <p className="text-zinc-500 text-sm mb-6 leading-relaxed">
                Add a funded company to infer which technical primitives they actually build on —
                from their product pages, docs, blog, and careers listings.
                Capital-weighted across the portfolio.
              </p>
              <div className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3 font-mono">Try these examples</p>
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
                      className="flex items-center justify-between px-3 py-2 rounded bg-zinc-800 hover:bg-zinc-700 transition-colors text-left"
                    >
                      <span className="text-sm text-zinc-200">{name}</span>
                      <span className="text-xs text-zinc-500 font-mono">{website}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          {queue.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="px-4 py-3 text-left text-xs font-mono text-zinc-500 uppercase tracking-wider">Company</th>
                  <th className="px-4 py-3 text-left text-xs font-mono text-zinc-500 uppercase tracking-wider">Website</th>
                  <th className="px-4 py-3 text-left text-xs font-mono text-zinc-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-mono text-zinc-500 uppercase tracking-wider">Queued</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {queue.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-12 text-center text-zinc-600 text-sm">No companies analyzed yet. Add one above.</td></tr>
                )}
                {queue.map((item) => {
                  const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.queued
                  const Icon = cfg.icon
                  const isActive = ['crawling','extracting','normalizing'].includes(item.status)
                  return (
                    <tr key={item.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <button
                          onClick={() => item.status === 'done' && navigate(`/intel/dossier/${item.id}`)}
                          className={`font-medium ${item.status === 'done' ? 'text-zinc-100 hover:text-amber-400 cursor-pointer' : 'text-zinc-400 cursor-default'}`}
                        >
                          {item.company_name}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-zinc-500 font-mono text-xs">{item.website}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded font-mono ${cfg.color}`}>
                          <Icon size={10} className={isActive ? 'animate-spin' : ''} />
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-600 text-xs font-mono">
                        {new Date(item.queued_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center gap-2 justify-end">
                          {item.status === 'failed' && (
                            <button onClick={() => handleRetry(item.id)} className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1">
                              <RefreshCw size={10} /> Retry
                            </button>
                          )}
                          <button onClick={() => handleDelete(item.id)} className="text-xs text-zinc-600 hover:text-rose-400 transition-colors">✕</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          )}
          </>
        )}
      </div>
    </div>
  )
}
