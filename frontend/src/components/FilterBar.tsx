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
  vc:     'bg-emerald-50 text-emerald-700 border-emerald-300',
  ma:     'bg-sky-50 text-sky-700 border-sky-300',
  crypto: 'bg-violet-50 text-violet-700 border-violet-300',
  ipo:    'bg-rose-50 text-rose-700 border-rose-300',
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
const pillInactive = 'text-slate-500 border-slate-200 hover:text-slate-700 hover:border-slate-300 bg-white'
const pillActive = 'bg-amber-50 text-amber-700 border-amber-300'

const dateInputClass =
  'bg-white border border-slate-200 text-slate-600 text-[10px] font-mono px-2 py-1 rounded focus:outline-none focus:border-amber-400 transition-colors'

const SectionLabel = ({ label }: { label: string }) => (
  <span className="text-[9px] tracking-[0.35em] text-slate-400 font-mono uppercase">{label}</span>
)

const Pipe = () => (
  <span className="w-px h-4 bg-slate-200 self-center" />
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
          <span className="text-[9px] font-mono text-amber-600 tracking-wider">
            [{activeCount} active]
          </span>
        )}
        {hasActiveFilters(filters) && (
          <button
            onClick={() => onFilterChange(defaultFilters)}
            className="text-[9px] font-mono tracking-[0.2em] uppercase text-slate-500 hover:text-slate-700 border border-slate-200 hover:border-slate-300 px-2 py-0.5 rounded transition-colors bg-white"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
