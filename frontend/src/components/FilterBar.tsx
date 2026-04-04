export interface FilterState {
  dealType: string;
  sector: string;
  geo: string;
  amountMin: string;
  dateFrom: Date | null;
  dateTo: Date | null;
}

interface FilterBarProps {
  filters: FilterState;
  sectors: string[];
  onFilterChange: (filters: FilterState) => void;
  showDateRange?: boolean;
}

function getDefaultFilters(): FilterState {
  const today = new Date();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(today.getDate() - 7);
  return {
    dealType: "",
    sector: "",
    geo: "",
    amountMin: "",
    dateFrom: sevenDaysAgo,
    dateTo: today,
  };
}

export const defaultFilters: FilterState = getDefaultFilters();

function hasActiveFilters(filters: FilterState): boolean {
  const defaults = defaultFilters;
  if (filters.dealType !== "") return true;
  if (filters.sector !== "") return true;
  if (filters.geo !== "") return true;
  if (filters.amountMin !== "") return true;
  const fromChanged =
    filters.dateFrom?.toISOString().slice(0, 10) !==
    defaults.dateFrom?.toISOString().slice(0, 10);
  const toChanged =
    filters.dateTo?.toISOString().slice(0, 10) !==
    defaults.dateTo?.toISOString().slice(0, 10);
  if (fromChanged || toChanged) return true;
  return false;
}

const selectClass =
  "bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs px-2 py-1.5 rounded focus:outline-none focus:border-blue-500";

export default function FilterBar({
  filters,
  sectors,
  onFilterChange,
  showDateRange = true,
}: FilterBarProps) {
  const update = (partial: Partial<FilterState>) =>
    onFilterChange({ ...filters, ...partial });

  return (
    <div className="flex flex-wrap gap-2 items-center py-3">
      {/* Deal Type */}
      <select
        value={filters.dealType}
        onChange={(e) => update({ dealType: e.target.value })}
        className={selectClass}
      >
        <option value="">All Types</option>
        <option value="vc">VC</option>
        <option value="ma">M&A</option>
        <option value="crypto">Crypto</option>
        <option value="ipo">IPO</option>
      </select>

      {/* Sector */}
      <select
        value={filters.sector}
        onChange={(e) => update({ sector: e.target.value })}
        className={selectClass}
      >
        <option value="">All Sectors</option>
        {sectors.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      {/* Geo */}
      <select
        value={filters.geo}
        onChange={(e) => update({ geo: e.target.value })}
        className={selectClass}
      >
        <option value="">All Geos</option>
        <option value="latam">LatAm</option>
        <option value="spain">Spain</option>
        <option value="europe">Europe</option>
        <option value="global">Global</option>
      </select>

      {/* Min Amount */}
      <input
        type="number"
        placeholder="Min $USD"
        value={filters.amountMin}
        onChange={(e) => update({ amountMin: e.target.value })}
        className={`${selectClass} w-28`}
      />

      {/* Date Range */}
      {showDateRange !== false && (
        <>
          <input
            type="date"
            value={filters.dateFrom?.toISOString().slice(0, 10) ?? ""}
            onChange={(e) =>
              update({ dateFrom: e.target.value ? new Date(e.target.value) : null })
            }
            className={selectClass}
          />
          <span className="text-slate-500 text-xs">to</span>
          <input
            type="date"
            value={filters.dateTo?.toISOString().slice(0, 10) ?? ""}
            onChange={(e) =>
              update({ dateTo: e.target.value ? new Date(e.target.value) : null })
            }
            className={selectClass}
          />
        </>
      )}

      {/* Clear filters */}
      {hasActiveFilters(filters) && (
        <button
          onClick={() => onFilterChange(defaultFilters)}
          className="text-xs text-blue-400 hover:text-blue-300 hover:underline ml-1"
        >
          Clear
        </button>
      )}
    </div>
  );
}
