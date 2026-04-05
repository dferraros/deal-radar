import React, { useState } from 'react';
import axios from 'axios';

interface HeatmapCell {
  sector: string;
  geo: string;
  deal_count: number;
  total_capital_usd: number;
}

interface HeatmapGridProps {
  cells: HeatmapCell[];
  sectors: string[];
  geos: string[];
}

function getColorClass(capital: number, max: number): string {
  if (max === 0 || capital === 0) return 'bg-zinc-900 border border-zinc-800'
  const ratio = capital / max
  if (ratio < 0.05) return 'bg-emerald-950 border border-emerald-900/40'
  if (ratio < 0.15) return 'bg-emerald-900 border border-emerald-800/50'
  if (ratio < 0.30) return 'bg-emerald-800 border border-emerald-700/60'
  if (ratio < 0.50) return 'bg-emerald-700 border border-emerald-600/70'
  if (ratio < 0.75) return 'bg-emerald-600 border border-emerald-500/80'
  return 'bg-emerald-500 border border-emerald-400/80'
}

function fmtM(usd: number): string {
  if (usd === 0) return '$0';
  const m = usd / 1_000_000;
  return m >= 1000 ? `$${(m / 1000).toFixed(1)}B` : `$${m.toFixed(0)}M`;
}

function fmtExact(usd: number): string {
  return '$' + usd.toLocaleString('en-US');
}

// Column totals
function colTotal(cells: HeatmapCell[], geo: string): number {
  return cells
    .filter((c) => c.geo === geo)
    .reduce((sum, c) => sum + c.total_capital_usd, 0);
}

interface DrillDeal {
  id: string
  company_name: string | null
  amount_usd: number | null
  round_label: string | null
  deal_type: string | null
  announced_date: string | null
}

export default function HeatmapGrid({ cells, sectors, geos }: HeatmapGridProps) {
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const [drilldown, setDrilldown] = useState<{ sector: string; geo: string } | null>(null)
  const [drillDeals, setDrillDeals] = useState<DrillDeal[]>([])
  const [drillLoading, setDrillLoading] = useState(false)

  function handleCellClick(sector: string, geo: string) {
    setDrilldown({ sector, geo })
    setDrillLoading(true)
    axios.get('/api/deals', { params: { sector, geo, limit: 50 } })
      .then((r) => setDrillDeals(r.data.deals ?? []))
      .catch(() => setDrillDeals([]))
      .finally(() => setDrillLoading(false))
  }

  if (sectors.length === 0) {
    return (
      <p className="text-sm text-slate-400 py-8 text-center">No heatmap data available.</p>
    );
  }

  const maxCapital = Math.max(...cells.map((c) => c.total_capital_usd), 1);

  return (
    <div className="relative">
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `8rem repeat(${geos.length}, minmax(5rem, 1fr))` }}
      >
        {/* Header row */}
        <div />
        {geos.map((geo) => (
          <div
            key={geo}
            className="text-xs text-slate-500 uppercase tracking-widest text-center pb-2 font-normal"
          >
            {geo}
          </div>
        ))}

        {/* Data rows */}
        {sectors.map((sector) => (
          <React.Fragment key={sector}>
            {/* Row label */}
            <div
              className="text-xs text-slate-400 text-right pr-3 self-center truncate"
            >
              {sector}
            </div>

            {/* Cells for each geo */}
            {geos.map((geo) => {
              const cell = cells.find((c) => c.sector === sector && c.geo === geo);
              const capital = cell?.total_capital_usd ?? 0;
              const dealCount = cell?.deal_count ?? 0;
              const colorClass = getColorClass(capital, maxCapital);

              return (
                <div
                  key={`${sector}-${geo}`}
                  className={`${colorClass} rounded border border-zinc-800 min-h-[70px] flex flex-col items-center justify-center relative group transition-opacity hover:opacity-90 ${dealCount > 0 ? 'cursor-pointer hover:ring-2 hover:ring-emerald-400' : 'cursor-default'}`}
                  onClick={() => { if (dealCount > 0) handleCellClick(sector, geo) }}
                  onMouseEnter={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const text =
                      dealCount > 0
                        ? `${sector} / ${geo}\n${fmtExact(capital)} · ${dealCount} deal${dealCount === 1 ? '' : 's'}`
                        : `${sector} / ${geo}\nNo deals this period`;
                    setTooltip({ text, x: rect.left + rect.width / 2, y: rect.top - 8 });
                  }}
                  onMouseLeave={() => setTooltip(null)}
                >
                  {dealCount > 0 ? (
                    <>
                      <span className="text-xs font-mono font-semibold text-white">
                        {fmtM(capital)}
                      </span>
                      <span className="text-[10px] text-slate-400 mt-0.5">
                        {dealCount} deal{dealCount === 1 ? '' : 's'}
                      </span>
                    </>
                  ) : (
                    <span className="text-[10px] text-slate-600">—</span>
                  )}
                </div>
              );
            })}
          </React.Fragment>
        ))}

        {/* TOTAL row */}
        <div className="text-xs text-slate-500 uppercase tracking-widest text-right pr-3 pt-2 border-t border-zinc-800 mt-1">
          Total
        </div>
        {geos.map((geo) => {
          const total = colTotal(cells, geo);
          return (
            <div
              key={`total-${geo}`}
              className="text-xs font-mono text-slate-300 text-center pt-2 border-t border-zinc-800 mt-1"
            >
              {total > 0 ? fmtM(total) : '—'}
            </div>
          );
        })}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-xs font-mono text-zinc-200 pointer-events-none whitespace-pre shadow-lg"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translate(-50%, -100%)',
          }}
        >
          {tooltip.text}
        </div>
      )}

      {/* Drilldown modal */}
      {drilldown && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setDrilldown(null)}
        >
          <div
            className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-2xl max-h-[80vh] overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <h3 className="font-semibold text-zinc-100 font-mono text-sm uppercase tracking-wide">
                {drilldown.sector} · {drilldown.geo}
              </h3>
              <button
                onClick={() => setDrilldown(null)}
                className="text-zinc-500 hover:text-zinc-200 text-lg leading-none"
              >
                ✕
              </button>
            </div>
            <div className="overflow-y-auto max-h-[60vh] divide-y divide-zinc-800">
              {drillLoading ? (
                <div className="p-8 text-center text-zinc-500 text-sm">Loading...</div>
              ) : drillDeals.length === 0 ? (
                <div className="p-8 text-center text-zinc-500 text-sm">No deals found</div>
              ) : drillDeals.map((d) => (
                <div key={d.id} className="px-5 py-3 hover:bg-zinc-800/40 transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-zinc-100">{d.company_name ?? '—'}</span>
                    <span className="text-sm font-mono text-amber-400">
                      {d.amount_usd ? fmtM(d.amount_usd) : '—'}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-500 mt-0.5 font-mono">
                    {d.round_label || d.deal_type || '—'} · {d.announced_date ?? '—'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
