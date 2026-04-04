import { Select, SelectItem, NumberInput, DateRangePicker } from "@tremor/react";

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
  // Check date range — compare date strings to avoid reference equality issues
  const fromChanged =
    filters.dateFrom?.toISOString().slice(0, 10) !==
    defaults.dateFrom?.toISOString().slice(0, 10);
  const toChanged =
    filters.dateTo?.toISOString().slice(0, 10) !==
    defaults.dateTo?.toISOString().slice(0, 10);
  if (fromChanged || toChanged) return true;
  return false;
}

export default function FilterBar({
  filters,
  sectors,
  onFilterChange,
  showDateRange = true,
}: FilterBarProps) {
  const update = (partial: Partial<FilterState>) =>
    onFilterChange({ ...filters, ...partial });

  return (
    <div className="flex flex-wrap gap-3 items-end py-4">
      {/* Deal Type */}
      <div className="w-36">
        <label className="block text-xs text-gray-400 mb-1">Deal Type</label>
        <Select
          value={filters.dealType}
          onValueChange={(v) => update({ dealType: v })}
        >
          <SelectItem value="">All</SelectItem>
          <SelectItem value="vc">VC</SelectItem>
          <SelectItem value="ma">M&amp;A</SelectItem>
          <SelectItem value="crypto">Crypto</SelectItem>
          <SelectItem value="ipo">IPO</SelectItem>
        </Select>
      </div>

      {/* Sector */}
      <div className="w-36">
        <label className="block text-xs text-gray-400 mb-1">Sector</label>
        <Select
          value={filters.sector}
          onValueChange={(v) => update({ sector: v })}
        >
          <SelectItem value="">All</SelectItem>
          {sectors.map((s) => (
            <SelectItem key={s} value={s}>
              {s}
            </SelectItem>
          ))}
        </Select>
      </div>

      {/* Geo */}
      <div className="w-36">
        <label className="block text-xs text-gray-400 mb-1">Geo</label>
        <Select
          value={filters.geo}
          onValueChange={(v) => update({ geo: v })}
        >
          <SelectItem value="">All</SelectItem>
          <SelectItem value="latam">LatAm</SelectItem>
          <SelectItem value="spain">Spain</SelectItem>
          <SelectItem value="europe">Europe</SelectItem>
          <SelectItem value="global">Global</SelectItem>
        </Select>
      </div>

      {/* Min Amount */}
      <div>
        <label className="block text-xs text-gray-400 mb-1">Min Amount</label>
        <NumberInput
          className="w-32"
          placeholder="Min $USD"
          value={filters.amountMin !== "" ? Number(filters.amountMin) : undefined}
          onValueChange={(v) =>
            update({ amountMin: v !== undefined ? String(v) : "" })
          }
        />
      </div>

      {/* Date Range */}
      {showDateRange !== false && (
        <div>
          <label className="block text-xs text-gray-400 mb-1">Date Range</label>
          <DateRangePicker
            enableSelect={false}
            value={{
              from: filters.dateFrom ?? undefined,
              to: filters.dateTo ?? undefined,
            }}
            onValueChange={(range) =>
              update({
                dateFrom: range.from ?? null,
                dateTo: range.to ?? null,
              })
            }
          />
        </div>
      )}

      {/* Clear filters */}
      {hasActiveFilters(filters) && (
        <button
          onClick={() => onFilterChange(defaultFilters)}
          className="text-sm text-amber-400 hover:underline self-end pb-1"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
