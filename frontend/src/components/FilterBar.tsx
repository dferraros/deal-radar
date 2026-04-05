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

function countActiveFilters(filters: FilterState): number {
  const defaults = defaultFilters;
  let count = 0;
  if (filters.dealType !== "") count++;
  if (filters.sector !== "") count++;
  if (filters.geo !== "") count++;
  if (filters.amountMin !== "") count++;
  const fromChanged =
    filters.dateFrom?.toISOString().slice(0, 10) !==
    defaults.dateFrom?.toISOString().slice(0, 10);
  const toChanged =
    filters.dateTo?.toISOString().slice(0, 10) !==
    defaults.dateTo?.toISOString().slice(0, 10);
  if (fromChanged || toChanged) count++;
  return count;
}

function hasActiveFilters(filters: FilterState): boolean {
  return countActiveFilters(filters) > 0;
}

const DEAL_TYPE_ACTIVE: Record<string, string> = {
  vc:     'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  ma:     'bg-sky-500/20 text-sky-300 border-sky-500/40',
  crypto: 'bg-violet-500/20 text-violet-300 border-violet-500/40',
  ipo:    'bg-rose-500/20 text-rose-300 border-rose-500/40',
}

const GEO_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'latam',  label: '🌎 LatAm' },
  { value: 'spain',  label: '🇪🇸 Spain' },
  { value: 'europe', label: '🇪🇺 Europe' },
  { value: 'us',     label: '🇺🇸 US' },
  { value: 'asia',   label: '🌏 Asia' },
  { value: 'global', label: '🌐 Global' },
]

const AMOUNT_OPTIONS = [
  { value: '',           label: 'All' },
  { value: '10000000',   label: '$10M+' },
  { value: '50000000',   label: '$50M+' },
  { value: '100000000',  label: '$100M+' },
  { value: '500000000',  label: '$500M+' },
]

const pillBase = 'text-[10px] px-2.5 py-1 rounded-full border font-mono transition-colors cursor-pointer'
const pillInactive = 'text-zinc-600 border-zinc-800 hover:text-zinc-400 hover:border-zinc-700'
const pillActive = 'bg-amber-500/20 text-amber-300 border-amber-500/40'

const dateInputClass =
  'bg-zinc-900/80 border border-zinc-800 text-zinc-400 text-[10px] font-mono px-2 py-1 rounded focus:outline-none focus:border-amber-500/50 transition-colors'

const SectionLabel = ({ label }: { label: string }) => (
  <span className="text-[9px] tracking-[0.35em] text-zinc-700 font-mono uppercase">{label}</span>
)

const Pipe = () => (
  <span className="w-px h-4 bg-zinc-800/80 self-center" />
)

export default function FilterBar({
  filters,
  sectors,
  onFilterChange,
  showDateRange = true,
}: FilterBarProps) {
  const update = (partial: Partial<FilterState>) =>
    onFilterChange({ ...filters, ...partial });

  const activeCount = countActiveFilters(filters);

  return (
    <div className="filter-strip px-6 py-2.5 flex flex-wrap items-center gap-x-5 gap-y-2">
      {/* Terminal label */}
      <SectionLabel label="Screen" />
      <Pipe />

      {/* Deal Type */}
      <div className="flex items-center gap-1.5">
        {(['', 'vc', 'ma', 'crypto', 'ipo'] as const).map((type) => {
          const isActive = filters.dealType === type
          return (
            <button
              key={type}
              onClick={() => update({ dealType: type })}
              className={`${pillBase} ${
                isActive
                  ? (type === '' ? pillActive : (DEAL_TYPE_ACTIVE[type] ?? pillActive))
                  : pillInactive
              }`}
            >
              {type === '' ? 'All' : type.toUpperCase()}
            </button>
          )
        })}
      </div>

      <Pipe />

      {/* Sector */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {(['', ...sectors] as string[]).map((s) => {
          const isActive = filters.sector === s
          return (
            <button
              key={s}
              onClick={() => update({ sector: s })}
              className={`${pillBase} ${isActive ? pillActive : pillInactive} capitalize`}
            >
              {s === '' ? 'All sectors' : s}
            </button>
          )
        })}
      </div>

      <Pipe />

      {/* Geo */}
      <div className="flex items-center gap-1.5">
        {GEO_OPTIONS.map(({ value, label }) => {
          const isActive = filters.geo === value
          return (
            <button
              key={value}
              onClick={() => update({ geo: value })}
              className={`${pillBase} ${isActive ? pillActive : pillInactive}`}
            >
              {label}
            </button>
          )
        })}
      </div>

      <Pipe />

      {/* Size */}
      <div className="flex items-center gap-1.5">
        {AMOUNT_OPTIONS.map(({ value, label }) => {
          const isActive = filters.amountMin === value
          return (
            <button
              key={value}
              onClick={() => update({ amountMin: value })}
              className={`${pillBase} ${isActive ? pillActive : pillInactive}`}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* Date Window */}
      {showDateRange && (
        <>
          <Pipe />
          <div className="flex items-center gap-2">
            <SectionLabel label="Window" />
            <input
              type="date"
              value={filters.dateFrom?.toISOString().slice(0, 10) ?? ""}
              onChange={(e) =>
                update({ dateFrom: e.target.value ? new Date(e.target.value) : null })
              }
              className={dateInputClass}
            />
            <span className="text-zinc-700 text-[9px] font-mono">→</span>
            <input
              type="date"
              value={filters.dateTo?.toISOString().slice(0, 10) ?? ""}
              onChange={(e) =>
                update({ dateTo: e.target.value ? new Date(e.target.value) : null })
              }
              className={dateInputClass}
            />
          </div>
        </>
      )}

      {/* Active count + reset */}
      <div className="flex items-center gap-2 ml-auto">
        {activeCount > 0 && (
          <span className="text-[9px] font-mono text-amber-400/80 tracking-wider">
            [{activeCount} active]
          </span>
        )}
        {hasActiveFilters(filters) && (
          <button
            onClick={() => onFilterChange(defaultFilters)}
            className="text-[9px] font-mono tracking-[0.2em] uppercase text-zinc-600 hover:text-zinc-300 border border-zinc-800 hover:border-zinc-600 px-2 py-0.5 rounded transition-colors"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
