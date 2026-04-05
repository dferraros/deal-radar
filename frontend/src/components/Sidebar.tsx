import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Grid3X3,
  TrendingUp,
  Users,
  Network,
  Star,
  Bell,
  Settings,
  Radio,
} from 'lucide-react'
import axios from 'axios'

const navItems = [
  { to: '/', label: 'Deal Feed', icon: LayoutDashboard, end: true },
  { to: '/heatmap', label: 'Heatmap', icon: Grid3X3 },
  { to: '/trends', label: 'Trends', icon: TrendingUp },
  { to: '/investors', label: 'Investors', icon: Users },
  { to: '/network', label: 'Network', icon: Network },
  { to: '/alerts', label: 'Alerts', icon: Bell },
  { to: '/watchlist', label: 'Watchlist', icon: Star },
]

interface SidebarCounts {
  alerts: number
  watchlist: number
}

export default function Sidebar() {
  const [lastSync, setLastSync] = useState<string>('')
  const [ingesting, setIngesting] = useState(false)
  const [counts, setCounts] = useState<SidebarCounts>({ alerts: 0, watchlist: 0 })

  useEffect(() => {
    // Last sync time
    axios.get('/api/admin/runs').then((r) => {
      const latest = r.data?.[0]
      if (latest?.run_at) {
        const d = new Date(latest.run_at)
        setLastSync(
          d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
        )
      }
    }).catch(() => {})

    // Badge counts
    axios.get('/api/alerts').then((r) => {
      setCounts((c) => ({ ...c, alerts: (r.data || []).filter((a: any) => a.is_active).length }))
    }).catch(() => {})
    axios.get('/api/watchlist').then((r) => {
      setCounts((c) => ({ ...c, watchlist: (r.data || []).length }))
    }).catch(() => {})
  }, [])

  // Poll for active ingestion run every 10s
  useEffect(() => {
    const check = () => {
      axios.get('/api/admin/runs?limit=1').then((r) => {
        const run = r.data?.[0]
        setIngesting(run?.status === 'running')
      }).catch(() => {})
    }
    check()
    const id = setInterval(check, 10_000)
    return () => clearInterval(id)
  }, [])

  return (
    <aside className="fixed top-0 left-0 h-screen w-[220px] bg-zinc-900 border-r border-zinc-800 flex flex-col z-10">
      {/* Global pulse bar — top 2px */}
      <div
        className={`absolute top-0 left-0 right-0 h-[2px] ${
          ingesting
            ? 'bg-amber-400 animate-pulse'
            : 'bg-amber-400/40'
        }`}
      />

      {/* Brand */}
      <div className="px-5 pt-6 pb-5 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Radio size={14} className="text-amber-400" strokeWidth={1.5} />
          <div className="text-amber-400 font-mono font-bold tracking-widest text-sm">
            DEAL RADAR
          </div>
        </div>
        <div className="text-zinc-600 text-xs mt-0.5 pl-[22px]">Intelligence Platform</div>
      </div>

      {/* Cmd+K hint */}
      <div className="px-5 pt-3 pb-1">
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('open-command-palette'))}
          className="w-full flex items-center justify-between bg-zinc-800/60 border border-zinc-700/60 rounded-md px-3 py-1.5 text-xs text-zinc-500 hover:border-zinc-600 hover:text-zinc-400 transition-colors"
        >
          <span>Search...</span>
          <span className="font-mono text-[10px] bg-zinc-700/60 px-1.5 py-0.5 rounded">⌘K</span>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 space-y-0.5">
        {navItems.map(({ to, label, icon: Icon, end }) => {
          const badge =
            label === 'Alerts' ? counts.alerts :
            label === 'Watchlist' ? counts.watchlist : 0

          return (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors group ${
                  isActive
                    ? 'border-l-2 border-amber-400 bg-amber-400/5 text-zinc-50 pl-[10px]'
                    : 'text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800/50 border-l-2 border-transparent'
                }`
              }
            >
              <div className="flex items-center gap-3">
                <Icon size={16} strokeWidth={1.5} />
                {label}
              </div>
              {badge > 0 && (
                <span className="text-[10px] font-mono bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded-full border border-amber-500/30">
                  {badge}
                </span>
              )}
            </NavLink>
          )
        })}
      </nav>

      {/* Admin link */}
      <div className="px-3 pb-2">
        <NavLink
          to="/admin"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2 rounded-md text-xs transition-colors border-l-2 ${
              isActive
                ? 'border-amber-400 bg-amber-400/5 text-zinc-50 pl-[10px]'
                : 'border-transparent text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800/50'
            }`
          }
        >
          <Settings size={14} strokeWidth={1.5} />
          Admin
        </NavLink>
      </div>

      {/* Status */}
      <div className="px-5 py-4 border-t border-zinc-800">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full ${
              ingesting ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'
            }`}
          />
          <span className="text-xs font-mono text-zinc-500">
            {ingesting ? 'SYNCING' : `LIVE${lastSync ? ` · ${lastSync}` : ''}`}
          </span>
        </div>
      </div>
    </aside>
  )
}
