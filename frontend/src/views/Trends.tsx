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
  return sectors.map((s) => ({ sector: s.sector, Deals: s.deal_count }));
}

function fmtCapital(v: number): string {
  const m = v / 1_000_000;
  return m >= 1000 ? `$${(m / 1000).toFixed(1)}B` : `$${m.toFixed(1)}M`;
}

function totalCapital(points: WeekPoint[]): number {
  return points.reduce((sum, p) => sum + p.total_capital_usd, 0);
}

// --- Component ---

export default function Trends() {
  const [data, setData] = useState<TrendsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    axios
      .get('/api/trends')
      .then((r) => setData(r.data))
      .catch(() =>
        setError('Could not load data. Check your connection or try refreshing the page.')
      )
      .finally(() => setLoading(false));
  }, []);

  const lineData = data ? buildLineData(data.weekly_by_type) : [];
  const barData = data ? buildBarData(data.top_sectors) : [];
  const grandTotal = data ? totalCapital(data.weekly_by_type) : 0;

  return (
    <div className="px-6 py-4">
      {/* Page title */}
      <div className="mb-4">
        <p className="text-xs uppercase tracking-widest text-slate-500">Analytics</p>
        <h1 className="text-lg font-semibold text-slate-200">Trends</h1>
      </div>

      {/* Total capital stat */}
      {data && grandTotal > 0 && (
        <div className="mb-4 flex items-center gap-2">
          <span className="text-xs uppercase tracking-widest text-slate-500">
            Total Capital Tracked:
          </span>
          <span className="font-mono text-sm font-semibold text-white">
            {fmtCapital(grandTotal)}
          </span>
          <span className="text-xs text-slate-500">
            over {data.weeks} weeks
          </span>
        </div>
      )}

      {loading && <LoadingSpinner />}
      {!loading && error && <ErrorBanner message={error} />}

      {!loading && !error && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Left: LineChart — Capital by deal type per week */}
          <div className="bg-[#0f1629] border border-[#1e2d4a] rounded-lg p-4">
            <p className="text-xs uppercase tracking-widest text-slate-500 mb-1">
              Capital by Deal Type
            </p>
            <h2 className="text-sm font-semibold text-white mb-0.5">
              Weekly Capital Raised
            </h2>
            <p className="text-xs text-slate-500 mb-2">USD · click legend to filter</p>
            {lineData.length === 0 ? (
              <div className="h-72 flex items-center justify-center">
                <p className="text-sm text-slate-400">No trend data available yet.</p>
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
          <div className="bg-[#0f1629] border border-[#1e2d4a] rounded-lg p-4">
            <p className="text-xs uppercase tracking-widest text-slate-500 mb-1">
              Sector Distribution
            </p>
            <h2 className="text-sm font-semibold text-white mb-0.5">
              Top Sectors by Deal Count
            </h2>
            <p className="text-xs text-slate-500 mb-2">This month</p>
            {barData.length === 0 ? (
              <div className="h-72 flex items-center justify-center">
                <p className="text-sm text-slate-400">No sector data available yet.</p>
              </div>
            ) : (
              <BarChart
                data={barData}
                index="sector"
                categories={['Deals']}
                colors={['blue']}
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
