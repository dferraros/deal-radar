import { useState, useEffect } from 'react';
import axios from 'axios';
import { LineChart, BarChart } from '@tremor/react';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorBanner from '../components/ErrorBanner';

// --- Interfaces ---

interface WeekPoint {
  week_start: string;
  deal_type: string;
  deal_count: number;
  total_capital_usd: number;
}

interface SectorBar {
  sector: string;
  deal_count: number;
  total_capital_usd: number;
}

interface TrendsResponse {
  weeks: number;
  date_from: string;
  weekly_by_type: WeekPoint[];
  top_sectors: SectorBar[];
}

// --- Helpers ---

const DEAL_TYPE_LABELS: Record<string, string> = {
  vc: 'VC',
  ma: 'M&A',
  crypto: 'Crypto',
  ipo: 'IPO',
};

function formatWeekLabel(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00');
  const month = d.toLocaleDateString('en-US', { month: 'short' });
  const weekNum = Math.ceil(d.getDate() / 7);
  return `${month} W${weekNum}`;
}

function buildLineData(points: WeekPoint[]): Record<string, string | number>[] {
  const byWeek = new Map<string, Record<string, number>>();
  for (const p of points) {
    if (!byWeek.has(p.week_start)) byWeek.set(p.week_start, {});
    const entry = byWeek.get(p.week_start)!;
    const label = DEAL_TYPE_LABELS[p.deal_type] ?? p.deal_type.toUpperCase();
    entry[label] = (entry[label] ?? 0) + p.total_capital_usd;
  }
  return Array.from(byWeek.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, values]) => ({
      week: formatWeekLabel(weekStart),
      ...values,
    }));
}

function buildBarData(sectors: SectorBar[]): { sector: string; Deals: number }[] {
  return sectors.map(s => ({ sector: s.sector, Deals: s.deal_count }));
}

function fmtCapital(v: number): string {
  const m = v / 1_000_000;
  return m >= 1000 ? `$${(m / 1000).toFixed(1)}B` : `$${m.toFixed(1)}M`;
}

// --- Component ---

export default function Trends() {
  const [data, setData] = useState<TrendsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    axios.get('/api/trends')
      .then(r => setData(r.data))
      .catch(() => setError('Could not load data. Check your connection or try refreshing the page.'))
      .finally(() => setLoading(false));
  }, []);

  const lineData = data ? buildLineData(data.weekly_by_type) : [];
  const barData = data ? buildBarData(data.top_sectors) : [];

  return (
    <div>
      {/* Page header */}
      <h1 className="text-2xl font-bold text-gray-100 mb-2">Trends</h1>
      <p className="text-sm text-gray-400 mb-8">Capital flow and deal volume over time</p>

      {loading && <LoadingSpinner />}
      {!loading && error && <ErrorBanner message={error} />}

      {!loading && !error && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Left: LineChart — Capital by deal type per week */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
            <h2 className="text-base font-semibold text-gray-100">
              Capital Raised per Week by Deal Type
            </h2>
            <p className="text-xs text-gray-400 mt-0.5 mb-2">USD millions</p>
            {lineData.length === 0 ? (
              <div className="h-72 flex items-center justify-center">
                <p className="text-sm text-gray-400">No trend data available yet.</p>
              </div>
            ) : (
              <LineChart
                data={lineData}
                index="week"
                categories={['VC', 'M&A', 'Crypto', 'IPO']}
                colors={['blue', 'violet', 'amber', 'emerald']}
                valueFormatter={fmtCapital}
                yAxisWidth={64}
                className="h-72 mt-4"
                showLegend={true}
              />
            )}
          </div>

          {/* Right: BarChart — Top sectors by deal count */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
            <h2 className="text-base font-semibold text-gray-100">
              Top Sectors by Deal Count (This Month)
            </h2>
            <p className="text-xs text-gray-400 mt-0.5 mb-2">Number of deals</p>
            {barData.length === 0 ? (
              <div className="h-72 flex items-center justify-center">
                <p className="text-sm text-gray-400">No sector data available yet.</p>
              </div>
            ) : (
              <BarChart
                data={barData}
                index="sector"
                categories={['Deals']}
                colors={['amber']}
                valueFormatter={(v: number) => `${v}`}
                yAxisWidth={48}
                className="h-72 mt-4"
              />
            )}
          </div>

        </div>
      )}
    </div>
  );
}
