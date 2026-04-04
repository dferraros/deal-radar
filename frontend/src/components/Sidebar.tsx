import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Grid3X3,
  TrendingUp,
  Users,
  Star,
  Bell,
  Settings,
  Activity,
} from 'lucide-react'
import axios from 'axios'

const navItems = [
  { to: '/', label: 'Deal Feed', icon: LayoutDashboard, end: true },
  { to: '/heatmap', label: 'Heatmap', icon: Grid3X3 },
  { to: '/trends', label: 'Trends', icon: TrendingUp },
  { to: '/investors', label: 'Investors', icon: Users },
  { to: '/alerts', label: 'Alerts', icon: Bell },
  { to: '/watchlist', label: 'Watchlist', icon: Star },
]

export default function Sidebar() {
  const [lastSync, setLastSync] = useState<string>('')

  useEffect(() => {
    axios
      .get('/api/admin/runs')
      .then((r) => {
        const latest = r.data?.[0]
        if (latest?.run_at) {
          const d = new Date(latest.run_at)
          setLastSync(
            d.toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            })
          )
        }
      })
      .catch(() => {})
  }, [])

  return (
    <aside className="fixed top-0 left-0 h-screen w-[220px] bg-zinc-900 border-r border-zinc-800 flex flex-col z-10">
      {/* Brand */}
      <div className="px-5 py-5 border-b border-zinc-800">
        <div className="text-amber-400 font-mono font-bold tracking-widest text-sm">
          DEAL RADAR
        </div>
        <div className="text-zinc-600 text-xs mt-0.5">Intelligence Platform</div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                isActive
                  ? 'bg-zinc-800 text-zinc-50'
                  : 'text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800/50'
              }`
            }
          >
            <Icon size={16} strokeWidth={1.5} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Admin link */}
      <div className="px-3 pb-2">
        <NavLink
          to="/admin"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2 rounded-md text-xs transition-colors ${
              isActive
                ? 'bg-zinc-800 text-zinc-50'
                : 'text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800/50'
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
          <Activity size={12} className="text-emerald-400" />
          <span className="text-xs font-mono text-zinc-500">
            LIVE{lastSync ? ` · ${lastSync}` : ''}
          </span>
        </div>
      </div>
    </aside>
  )
}
