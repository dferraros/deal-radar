import { useState, useEffect } from 'react';
import axios from 'axios';
import HeatmapGrid from '../components/HeatmapGrid';

interface HeatmapCell {
  sector: string;
  geo: string;
  deal_count: number;
  total_capital_usd: number;
}

interface HeatmapResponse {
  period: string;
  date_from: string;
  date_to: string;
  cells: HeatmapCell[];
  sectors: string[];
  geos: string[];
}

type Period = 'weekly' | 'monthly' | 'quarterly';

function Spinner() {
  return (
    <div className="flex justify-center items-center py-16">
      <svg
        className="animate-spin h-6 w-6 text-blue-400"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
    </div>
  );
}

function totalCapital(cells: HeatmapCell[]): number {
  return cells.reduce((sum, c) => sum + c.total_capital_usd, 0);
}

function fmtCapital(usd: number): string {
  const m = usd / 1_000_000;
  return m >= 1000 ? `$${(m / 1000).toFixed(1)}B` : `$${m.toFixed(0)}M`;
}

export default function Heatmap() {
  const [period, setPeriod] = useState<Period>('weekly');
  const [data, setData] = useState<HeatmapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    axios
      .get(`/api/heatmap?period=${period}`)
      .then((r) => setData(r.data))
      .catch(() =>
        setError('Could not load data. Check your connection or try refreshing the page.')
      )
      .finally(() => setLoading(false));
  }, [period]);

  const grandTotal = data ? totalCapital(data.cells) : 0;

  return (
    <div className="px-6 py-4">
      {/* Page title */}
      <div className="mb-4 flex items-end justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-500">Analytics</p>
          <h1 className="text-lg font-semibold text-slate-200">Sector Heatmap</h1>
        </div>

        {/* Period toggle — Bloomberg tabs */}
        <div className="flex border border-[#1e2d4a] rounded overflow-hidden">
          {(['weekly', 'monthly', 'quarterly'] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors ${
                period === p
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white bg-transparent'
              }`}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Total capital tracked stat */}
      {data && grandTotal > 0 && (
        <div className="mb-4 flex items-center gap-2">
          <span className="text-xs uppercase tracking-widest text-slate-500">
            Total Capital Tracked:
          </span>
          <span className="font-mono text-sm font-semibold text-white">
            {fmtCapital(grandTotal)}
          </span>
          <span className="text-xs text-slate-500">
            across {data.cells.reduce((s, c) => s + c.deal_count, 0)} deals
          </span>
        </div>
      )}

      {/* Content area */}
      {loading && <Spinner />}

      {!loading && error && (
        <div className="bg-red-900/20 border border-red-800/50 rounded px-4 py-3">
          <span className="text-sm text-red-400">{error}</span>
        </div>
      )}

      {!loading && !error && data && (
        <>
          <div className="bg-[#0f1629] border border-[#1e2d4a] rounded-lg p-6 overflow-x-auto">
            <HeatmapGrid
              cells={data.cells}
              sectors={data.sectors}
              geos={data.geos}
            />
          </div>

          <p className="text-xs text-slate-600 mt-3 font-mono">
            {data.period} · {data.date_from} &rarr; {data.date_to}
          </p>
        </>
      )}
    </div>
  );
}
