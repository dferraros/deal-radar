import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import FilterBar, { defaultFilters, FilterState } from '../components/FilterBar'
import DealTypeBadge from '../components/DealTypeBadge'
import InlineNoteEditor from '../components/InlineNoteEditor'
import LoadingSpinner from '../components/LoadingSpinner'
import ErrorBanner from '../components/ErrorBanner'
import CompanyAvatar from '../components/CompanyAvatar'

interface DealResponse {
  id: string
  company_id: string | null
  company_name: string | null
  deal_type: string | null
  amount_usd: number | null
  round_label: string | null
  announced_date: string | null
  lead_investor: string | null
  all_investors: string[]
  source_url: string | null
  source_name: string | null
  ai_summary: string | null
  sector: string[]
  geo: string | null
}

interface WatchlistItem {
  id: string
  company_id: string
  company_name: string
  company_sector: string[]
  company_geo: string | null
  notes: string | null
  added_at: string
  recent_deals: DealResponse[]
}

interface FlatDeal extends DealResponse {
  _watchlistItemId: string
  _companyName: string
  _companyId: string
  _notes: string | null
}

function daysSince(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return '1d ago'
  if (days < 30) return `${days}d ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

export default function Watchlist() {
  const navigate = useNavigate()
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<FilterState>({
    ...defaultFilters,
    dateFrom: null,
    dateTo: null,
  })
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    axios
      .get('/api/watchlist')
      .then((r) => setWatchlist(r.data))
      .catch(() =>
        setError('Could not load data. Check your connection or try refreshing the page.')
      )
      .finally(() => setLoading(false))
  }, [])

  const watchlistSectors = [...new Set(watchlist.flatMap((w) => w.company_sector))]

  const filteredDeals: FlatDeal[] = watchlist.flatMap((item) =>
    item.recent_deals
      .filter((d) => {
        if (filters.dealType && d.deal_type !== filters.dealType) return false
        if (filters.sector && !d.sector.includes(filters.sector)) return false
        if (filters.geo && d.geo !== filters.geo) return false
        if (
          filters.amountMin &&
          d.amount_usd !== null &&
          d.amount_usd < Number(filters.amountMin) * 1_000_000
        )
          return false
        return true
      })
      .map((d) => ({
        ...d,
        _watchlistItemId: item.id,
        _companyName: item.company_name,
        _companyId: item.company_id,
        _notes: item.notes,
      }))
  )

  const handleRemoveConfirmed = async (watchlistItemId: string, companyName: string) => {
    try {
      await axios.delete(`/api/watchlist/${watchlistItemId}`)
      setWatchlist((prev) => prev.filter((w) => w.id !== watchlistItemId))
      setConfirmRemove(null)
    } catch {
      console.error(`Failed to remove ${companyName} from watchlist`)
    }
  }

  return (
    <div className="px-6 pt-6 pb-6">
      {/* Page header */}
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-zinc-50">Watchlist</h1>
        {!loading && (
          <p className="text-xs text-zinc-500 mt-0.5">{watchlist.length} companies tracked</p>
        )}
      </div>

      <FilterBar
        filters={filters}
        sectors={watchlistSectors}
        onFilterChange={setFilters}
        showDateRange={false}
      />

      {loading && <LoadingSpinner />}
      {!loading && error && <ErrorBanner message={error} />}
      {!loading && !error && watchlist.length === 0 && (
        <div className="text-center py-16">
          <p className="text-base font-semibold text-zinc-300">Your watchlist is empty</p>
          <p className="text-sm text-zinc-500 mt-2">
            Visit a company profile and click &apos;Add to Watchlist&apos; to track their deals
            here.
          </p>
        </div>
      )}

      {!loading && !error && watchlist.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden mt-2">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-zinc-800">
                {['Date', 'Company', 'Round', 'Amount', 'Sector', 'Geo', 'Investors', 'Notes', 'Last Activity', ''].map(
                  (h, i) => (
                    <th
                      key={i}
                      className={`text-xs uppercase tracking-wider text-zinc-500 py-3 px-4 font-medium ${h === 'Last Activity' ? 'text-right' : 'text-left'}`}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {filteredDeals.map((item) => {
                // Inline confirmation row
                if (confirmRemove === item._watchlistItemId) {
                  return (
                    <tr key={`${item.id}-confirm`}>
                      <td colSpan={10} className="py-2 px-4">
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-zinc-300">
                            Remove {item._companyName}? This will delete your notes for this
                            company.
                          </span>
                          <button
                            onClick={() =>
                              handleRemoveConfirmed(item._watchlistItemId, item._companyName)
                            }
                            className="text-red-400 hover:text-red-300 font-semibold"
                          >
                            Yes, remove
                          </button>
                          <button
                            onClick={() => setConfirmRemove(null)}
                            className="text-zinc-400 hover:text-zinc-200"
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                }

                const amt =
                  item.amount_usd != null && !isNaN(item.amount_usd)
                    ? `$${(item.amount_usd / 1_000_000).toFixed(1)}M`
                    : 'Undisclosed'
                const hasAmount = item.amount_usd != null && !isNaN(item.amount_usd)

                const dateStr = item.announced_date
                  ? new Date(item.announced_date + 'T00:00:00').toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })
                  : '\u2014'

                const investorDisplay =
                  item.all_investors.length > 0
                    ? item.all_investors.length === 1
                      ? item.all_investors[0]
                      : `${item.all_investors[0]} +${item.all_investors.length - 1}`
                    : '\u2014'

                return (
                  <tr
                    key={item.id}
                    className="border-b border-zinc-800/50 border-l-4 border-l-amber-400/40 hover:bg-zinc-800/30 cursor-pointer transition-colors group"
                    onClick={() => navigate(`/company/${item._companyId}`)}
                  >
                    <td className="py-3 px-4 font-mono text-zinc-500 text-xs whitespace-nowrap">
                      {dateStr}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <CompanyAvatar name={item._companyName} size={24} />
                        <span className="text-sm font-medium text-zinc-100 group-hover:text-white">
                          {item._companyName}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <DealTypeBadge
                        dealType={item.deal_type}
                        label={item.round_label ?? undefined}
                      />
                    </td>
                    <td className="py-3 px-4">
                      {hasAmount ? (
                        <span className="font-mono text-sm tabular-nums text-emerald-400">
                          {amt}
                        </span>
                      ) : (
                        <span className="text-zinc-600 italic text-xs">Undisclosed</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-zinc-400 text-xs">
                      {item.sector.join(', ') || '\u2014'}
                    </td>
                    <td className="py-3 px-4 text-zinc-400 text-xs uppercase">
                      {item.geo ?? '\u2014'}
                    </td>
                    <td className="py-3 px-4 text-zinc-400 text-xs">{investorDisplay}</td>
                    <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                      <InlineNoteEditor
                        watchlistItemId={item._watchlistItemId}
                        initialNote={item._notes}
                      />
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-zinc-500">
                      {daysSince(item.announced_date)}
                    </td>
                    <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setConfirmRemove(item._watchlistItemId)}
                        className="text-zinc-600 hover:text-red-400 transition-colors text-base leading-none"
                        aria-label="Remove from watchlist"
                        title="Remove from watchlist"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
