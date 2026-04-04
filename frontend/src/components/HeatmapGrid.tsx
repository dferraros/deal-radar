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

function getColorClass(value: number, max: number): string {
  if (max === 0 || value === 0) return 'bg-gray-800';
  const ratio = value / max;
  if (ratio < 0.1) return 'bg-amber-100/20';
  if (ratio < 0.3) return 'bg-amber-200/40';
  if (ratio < 0.5) return 'bg-amber-300/60';
  if (ratio < 0.75) return 'bg-amber-500/80';
  return 'bg-amber-600';
}

function fmtM(usd: number): string {
  if (usd === 0) return '$0';
  const m = usd / 1_000_000;
  return m >= 1000 ? `$${(m / 1000).toFixed(1)}B` : `$${m.toFixed(0)}M`;
}

export default function HeatmapGrid({ cells, sectors, geos }: HeatmapGridProps) {
  if (sectors.length === 0) {
    return (
      <p className="text-sm text-gray-400 py-8 text-center">No heatmap data available.</p>
    );
  }

  const maxCapital = Math.max(...cells.map(c => c.total_capital_usd), 1);

  return (
    <div
      className="grid gap-1"
      style={{ gridTemplateColumns: `7rem repeat(${geos.length}, minmax(4rem, 1fr))` }}
    >
      {/* Header row */}
      <div />
      {geos.map(geo => (
        <div key={geo} className="text-xs text-gray-400 uppercase text-center pb-1 font-medium">
          {geo}
        </div>
      ))}

      {/* Data rows */}
      {sectors.map(sector => (
        <>
          {/* Row label */}
          <div key={`label-${sector}`} className="text-xs text-gray-400 text-right pr-3 self-center">
            {sector}
          </div>

          {/* Cells for each geo */}
          {geos.map(geo => {
            const cell = cells.find(c => c.sector === sector && c.geo === geo);
            const capital = cell?.total_capital_usd ?? 0;
            const dealCount = cell?.deal_count ?? 0;
            const colorClass = getColorClass(capital, maxCapital);

            const tooltipText =
              cell && dealCount > 0
                ? `${sector} / ${geo}: ${fmtM(capital)} · ${dealCount} deal${dealCount === 1 ? '' : 's'}`
                : 'No deals in this period';

            return (
              <div
                key={`${sector}-${geo}`}
                className={`${colorClass} h-12 rounded-sm relative group cursor-default`}
                title={tooltipText}
              >
                {cell && dealCount > 0 && (
                  <span className="absolute inset-0 flex items-center justify-center text-xs text-white/70 font-medium">
                    {dealCount}
                  </span>
                )}
              </div>
            );
          })}
        </>
      ))}
    </div>
  );
}
