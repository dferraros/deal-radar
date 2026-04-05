import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { Search, LayoutDashboard, TrendingUp, Grid3X3, Users, Network, Bell, Star } from 'lucide-react'
import { OPEN_COMMAND_PALETTE_EVENT } from '../lib/events'

interface DealResult {
  id: string
  company_id: string | null
  company_name: string | null
  deal_type: string | null
  amount_usd: number | null
  round_label: string | null
}

const VIEWS = [
  { label: 'Deal Feed', path: '/', icon: LayoutDashboard },
  { label: 'Trends', path: '/trends', icon: TrendingUp },
  { label: 'Heatmap', path: '/heatmap', icon: Grid3X3 },
  { label: 'Investors', path: '/investors', icon: Users },
  { label: 'Network', path: '/network', icon: Network },
  { label: 'Alerts', path: '/alerts', icon: Bell },
  { label: 'Watchlist', path: '/watchlist', icon: Star },
]

function formatAmount(usd: number | null): string {
  if (!usd) return ''
  const m = usd / 1_000_000
  return m >= 1000 ? `$${(m / 1000).toFixed(1)}B` : `$${m.toFixed(1)}M`
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [deals, setDeals] = useState<DealResult[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  // Open on Cmd+K / Ctrl+K and on custom event from sidebar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    const onCustom = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, onCustom)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, onCustom)
    }
  }, [])

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
      setQuery('')
      setDeals([])
    }
  }, [open])

  // Search deals debounced 250ms
  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      setDeals([])
      return
    }
    setLoading(true)
    const timer = setTimeout(() => {
      axios
        .get('/api/deals', { params: { q: query, limit: 6 } })
        .then((r) => setDeals(r.data?.deals || []))
        .catch(() => setDeals([]))
        .finally(() => setLoading(false))
    }, 250)
    return () => clearTimeout(timer)
  }, [query])

  const filteredViews = query.trim()
    ? VIEWS.filter((v) => v.label.toLowerCase().includes(query.toLowerCase()))
    : VIEWS

  function go(path: string) {
    navigate(path)
    setOpen(false)
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/60 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800">
          <Search size={16} className="text-zinc-500 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search companies or navigate..."
            className="flex-1 bg-transparent text-zinc-100 placeholder-zinc-600 text-sm outline-none"
          />
          <span className="text-[10px] font-mono text-zinc-600 bg-zinc-800 px-1.5 py-0.5 rounded">ESC</span>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto">
          {/* Company matches */}
          {deals.length > 0 && (
            <div>
              <div className="px-4 py-1.5 text-[10px] uppercase tracking-widest text-zinc-600 font-mono">
                Companies
              </div>
              {deals.map((d) => (
                <button
                  key={d.id}
                  onClick={() => d.company_id && go(`/company/${d.company_id}`)}
                  className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-zinc-800 text-left transition-colors"
                >
                  <span className="text-sm text-zinc-200">{d.company_name}</span>
                  <div className="flex items-center gap-2">
                    {d.amount_usd && (
                      <span className="text-xs font-mono text-emerald-400">
                        {formatAmount(d.amount_usd)}
                      </span>
                    )}
                    {d.round_label && (
                      <span className="text-[10px] font-mono text-zinc-500 uppercase">
                        {d.round_label}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* View shortcuts */}
          {filteredViews.length > 0 && (
            <div>
              <div className="px-4 py-1.5 text-[10px] uppercase tracking-widest text-zinc-600 font-mono">
                Navigate
              </div>
              {filteredViews.map((v) => (
                <button
                  key={v.path}
                  onClick={() => go(v.path)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-800 text-left transition-colors"
                >
                  <v.icon size={14} className="text-zinc-500" strokeWidth={1.5} />
                  <span className="text-sm text-zinc-300">{v.label}</span>
                </button>
              ))}
            </div>
          )}

          {loading && (
            <div className="px-4 py-4 text-xs text-zinc-600 text-center">Searching...</div>
          )}

          {!loading && query.length >= 2 && deals.length === 0 && filteredViews.length === 0 && (
            <div className="px-4 py-4 text-xs text-zinc-600 text-center">No results for "{query}"</div>
          )}
        </div>
      </div>
    </div>
  )
}
