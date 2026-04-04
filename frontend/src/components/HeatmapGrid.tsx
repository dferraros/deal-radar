import { useState } from 'react';

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
  if (max === 0 || capital === 0) return 'bg-[#0f1629]';
  const ratio = capital / max;
  if (ratio < 0.1) return 'bg-blue-900/30';
  if (ratio < 0.3) return 'bg-blue-800/50';
  if (ratio < 0.5) return 'bg-blue-700/60';
  if (ratio < 0.75) return 'bg-blue-600/75';
  return 'bg-blue-500/80';
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

export default function HeatmapGrid({ cells, sectors, geos }: HeatmapGridProps) {
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);

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
          <>
            {/* Row label */}
            <div
              key={`label-${sector}`}
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
                  className={`${colorClass} rounded border border-[#1e2d4a]/40 min-h-[70px] flex flex-col items-center justify-center cursor-default relative group transition-opacity hover:opacity-90`}
                  onMouseEnter={(e) => {
                    const rect = (e.target as HTMLElement)
                      .closest('[class*="rounded"]')!
                      .getBoundingClientRect();
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
          </>
        ))}

        {/* TOTAL row */}
        <div className="text-xs text-slate-500 uppercase tracking-widest text-right pr-3 pt-2 border-t border-[#1e2d4a] mt-1">
          Total
        </div>
        {geos.map((geo) => {
          const total = colTotal(cells, geo);
          return (
            <div
              key={`total-${geo}`}
              className="text-xs font-mono text-slate-300 text-center pt-2 border-t border-[#1e2d4a] mt-1"
            >
              {total > 0 ? fmtM(total) : '—'}
            </div>
          );
        })}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 bg-[#0a0e1a] border border-[#1e2d4a] rounded px-3 py-2 text-xs font-mono text-slate-200 pointer-events-none whitespace-pre shadow-lg"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translate(-50%, -100%)',
          }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}
