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

// Inline spinner — LoadingSpinner component may not exist yet (plans run in parallel)
function Spinner() {
  return (
    <div className="flex justify-center items-center py-16">
      <svg
        className="animate-spin h-8 w-8 text-amber-400"
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
      .then(r => setData(r.data))
      .catch(() =>
        setError('Could not load data. Check your connection or try refreshing the page.')
      )
      .finally(() => setLoading(false));
  }, [period]);

  return (
    <div>
      {/* Page header */}
      <h1 className="text-2xl font-bold text-gray-100 mb-2">Sector Heatmap</h1>
      <p className="text-sm text-gray-400 mb-6">Capital raised by sector and geography</p>

      {/* Period toggle — right aligned */}
      <div className="flex justify-end mb-4">
        <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1">
          {(['weekly', 'monthly', 'quarterly'] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-1.5 text-sm rounded-md font-medium capitalize transition-colors ${
                period === p
                  ? 'bg-gray-800 text-gray-100 border border-gray-700'
                  : 'text-gray-400 hover:text-gray-100'
              }`}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Content area */}
      {loading && <Spinner />}

      {!loading && error && (
        <div className="bg-red-900/20 border border-red-800 rounded-md px-4 py-3">
          <span className="text-sm text-red-400">{error}</span>
        </div>
      )}

      {!loading && !error && data && (
        <>
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 overflow-x-auto">
            <HeatmapGrid
              cells={data.cells}
              sectors={data.sectors}
              geos={data.geos}
            />
          </div>

          {/* Date range subtitle */}
          <p className="text-xs text-gray-500 mt-3">
            Showing {data.period} data: {data.date_from} &rarr; {data.date_to}
          </p>
        </>
      )}
    </div>
  );
}
