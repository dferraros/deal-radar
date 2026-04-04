import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import FilterBar, { defaultFilters, FilterState } from "../components/FilterBar";
import DealTypeBadge from "../components/DealTypeBadge";
import InlineNoteEditor from "../components/InlineNoteEditor";
import LoadingSpinner from "../components/LoadingSpinner";
import ErrorBanner from "../components/ErrorBanner";

interface DealResponse {
  id: string;
  company_id: string | null;
  company_name: string | null;
  deal_type: string | null;
  amount_usd: number | null;
  round_label: string | null;
  announced_date: string | null;
  lead_investor: string | null;
  all_investors: string[];
  source_url: string | null;
  source_name: string | null;
  ai_summary: string | null;
  sector: string[];
  geo: string | null;
}

interface WatchlistItem {
  id: string;
  company_id: string;
  company_name: string;
  company_sector: string[];
  company_geo: string | null;
  notes: string | null;
  added_at: string;
  recent_deals: DealResponse[];
}

interface FlatDeal extends DealResponse {
  _watchlistItemId: string;
  _companyName: string;
  _companyId: string;
  _notes: string | null;
}

export default function Watchlist() {
  const navigate = useNavigate();
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    ...defaultFilters,
    dateFrom: null,
    dateTo: null,
  });
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    axios
      .get("/api/watchlist")
      .then((r) => setWatchlist(r.data))
      .catch(() =>
        setError(
          "Could not load data. Check your connection or try refreshing the page."
        )
      )
      .finally(() => setLoading(false));
  }, []);

  const watchlistSectors = [
    ...new Set(watchlist.flatMap((w) => w.company_sector)),
  ];

  const filteredDeals: FlatDeal[] = watchlist.flatMap((item) =>
    item.recent_deals
      .filter((d) => {
        if (filters.dealType && d.deal_type !== filters.dealType) return false;
        if (filters.sector && !d.sector.includes(filters.sector)) return false;
        if (filters.geo && d.geo !== filters.geo) return false;
        if (
          filters.amountMin &&
          d.amount_usd !== null &&
          d.amount_usd < Number(filters.amountMin) * 1_000_000
        )
          return false;
        return true;
      })
      .map((d) => ({
        ...d,
        _watchlistItemId: item.id,
        _companyName: item.company_name,
        _companyId: item.company_id,
        _notes: item.notes,
      }))
  );

  const handleRemoveConfirmed = async (
    watchlistItemId: string,
    companyName: string
  ) => {
    try {
      await axios.delete(`/api/watchlist/${watchlistItemId}`);
      setWatchlist((prev) => prev.filter((w) => w.id !== watchlistItemId));
      setConfirmRemove(null);
    } catch {
      console.error(`Failed to remove ${companyName} from watchlist`);
    }
  };

  return (
    <div className="px-6 py-4">
      {/* Page title */}
      <div className="mb-4">
        <p className="text-xs uppercase tracking-widest text-slate-500">
          Monitoring
        </p>
        <h1 className="text-lg font-semibold text-slate-200">Watchlist</h1>
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
          <p className="text-base font-semibold text-slate-300">
            Your watchlist is empty
          </p>
          <p className="text-sm text-slate-500 mt-2">
            Visit a company profile and click &apos;Add to Watchlist&apos; to
            track their deals here.
          </p>
        </div>
      )}

      {!loading && !error && watchlist.length > 0 && (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              {[
                "Date",
                "Company",
                "Round",
                "Amount",
                "Sector",
                "Geo",
                "Investors",
                "Notes",
                "",
              ].map((h, i) => (
                <th
                  key={i}
                  className="text-left text-xs uppercase tracking-widest text-slate-500 pb-2 border-b border-[#1e2d4a] font-normal px-2"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredDeals.map((item) => {
              // Inline confirmation row
              if (confirmRemove === item._watchlistItemId) {
                return (
                  <tr key={`${item.id}-confirm`}>
                    <td colSpan={9} className="py-2 px-2">
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-slate-300">
                          Remove {item._companyName}? This will delete your
                          notes for this company.
                        </span>
                        <button
                          onClick={() =>
                            handleRemoveConfirmed(
                              item._watchlistItemId,
                              item._companyName
                            )
                          }
                          className="text-red-400 hover:text-red-300 font-semibold"
                        >
                          Yes, remove
                        </button>
                        <button
                          onClick={() => setConfirmRemove(null)}
                          className="text-slate-400 hover:text-slate-200"
                        >
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              }

              const amt =
                item.amount_usd != null && !isNaN(item.amount_usd)
                  ? `$${(item.amount_usd / 1_000_000).toFixed(1)}M`
                  : "Undisclosed";
              const hasAmount = item.amount_usd != null && !isNaN(item.amount_usd);

              const dateStr = item.announced_date
                ? new Date(
                    item.announced_date + "T00:00:00"
                  ).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })
                : "\u2014";

              const investorDisplay =
                item.all_investors.length > 0
                  ? item.all_investors.length === 1
                    ? item.all_investors[0]
                    : `${item.all_investors[0]} +${item.all_investors.length - 1}`
                  : "\u2014";

              return (
                <tr
                  key={item.id}
                  className="border-b border-[#1e2d4a]/50 hover:bg-[#0f1629] cursor-pointer transition-colors"
                  onClick={() => navigate(`/company/${item._companyId}`)}
                >
                  <td className="py-2 px-2 font-mono text-slate-400 text-xs whitespace-nowrap">
                    {dateStr}
                  </td>
                  <td className="py-2 px-2 font-semibold text-white">
                    {item._companyName}
                  </td>
                  <td className="py-2 px-2">
                    <DealTypeBadge
                      dealType={item.deal_type}
                      label={item.round_label ?? undefined}
                    />
                  </td>
                  <td className="py-2 px-2">
                    {hasAmount ? (
                      <span className="font-mono text-green-400 font-semibold">
                        {amt}
                      </span>
                    ) : (
                      <span className="text-slate-500 italic text-xs">
                        Undisclosed
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-2 text-slate-400 text-xs">
                    {item.sector.join(", ") || "\u2014"}
                  </td>
                  <td className="py-2 px-2 text-slate-400 text-xs uppercase">
                    {item.geo ?? "\u2014"}
                  </td>
                  <td className="py-2 px-2 text-slate-400 text-xs">
                    {investorDisplay}
                  </td>
                  <td className="py-2 px-2" onClick={(e) => e.stopPropagation()}>
                    <InlineNoteEditor
                      watchlistItemId={item._watchlistItemId}
                      initialNote={item._notes}
                    />
                  </td>
                  <td className="py-2 px-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => setConfirmRemove(item._watchlistItemId)}
                      className="text-slate-500 hover:text-red-400 transition-colors text-base leading-none"
                      aria-label="Remove from watchlist"
                      title="Remove from watchlist"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
