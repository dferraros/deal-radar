import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";

const mainLinks = [
  { to: "/", label: "Deal Feed" },
  { to: "/heatmap", label: "Heatmap" },
  { to: "/trends", label: "Trends" },
  { to: "/investors", label: "Investors" },
  { to: "/watchlist", label: "Watchlist" },
];

function formatSyncTime(isoStr: string): string {
  const d = new Date(isoStr);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default function Navbar() {
  const [lastSync, setLastSync] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/runs?limit=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (Array.isArray(data) && data.length > 0 && data[0].run_at) {
          setLastSync(formatSyncTime(data[0].run_at));
        }
      })
      .catch(() => {});
  }, []);

  return (
    <nav className="bg-[#0a0e1a] border-b border-[#1e2d4a]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Top row: brand + status strip */}
        <div className="flex items-center justify-between h-10 border-b border-[#1e2d4a]/50">
          <span className="text-amber-400 font-mono font-bold tracking-widest text-sm uppercase">
            Deal Radar
          </span>
          <div className="flex items-center gap-4 text-xs font-mono text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-emerald-400 font-semibold">LIVE</span>
            </span>
            {lastSync && (
              <span className="text-slate-500">
                Last sync: <span className="text-slate-400">{lastSync}</span>
              </span>
            )}
          </div>
        </div>

        {/* Bottom row: nav links */}
        <div className="flex items-center gap-1 h-10">
          {mainLinks.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `px-3 py-2 text-xs font-semibold uppercase tracking-wide transition-colors border-b-2 -mb-px ${
                  isActive
                    ? "border-blue-500 text-white"
                    : "border-transparent text-slate-400 hover:text-white"
                }`
              }
            >
              {label}
            </NavLink>
          ))}
          <span className="w-px h-4 bg-[#1e2d4a] mx-2" aria-hidden="true" />
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              `px-3 py-2 text-xs font-semibold uppercase tracking-wide transition-colors border-b-2 -mb-px ${
                isActive
                  ? "border-blue-500 text-white"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`
            }
          >
            Admin
          </NavLink>
        </div>
      </div>
    </nav>
  );
}
