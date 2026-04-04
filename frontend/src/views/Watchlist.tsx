import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import {
  Table,
  TableHead,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell,
} from "@tremor/react";
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
  id: string; // watchlist item UUID
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

  // Compute distinct sectors from loaded watchlist
  const watchlistSectors = [
    ...new Set(watchlist.flatMap((w) => w.company_sector)),
  ];

  // Client-side filtering
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

  const handleRemoveConfirmed = async (watchlistItemId: string, companyName: string) => {
    try {
      await axios.delete(`/api/watchlist/${watchlistItemId}`);
      setWatchlist((prev) => prev.filter((w) => w.id !== watchlistItemId));
      setConfirmRemove(null);
    } catch {
      console.error(`Failed to remove ${companyName} from watchlist`);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-100 mb-2">Watchlist</h1>
      <p className="text-sm text-gray-400 mb-6">
        Deals from your pinned companies
      </p>

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
          <p className="text-xl font-bold text-gray-300">
            Your watchlist is empty
          </p>
          <p className="text-sm text-gray-400 mt-2">
            Visit a company profile and click &apos;Add to Watchlist&apos; to
            track their deals here.
          </p>
        </div>
      )}

      {!loading && !error && watchlist.length > 0 && (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell className="text-xs text-gray-400 uppercase tracking-wide">
                Date
              </TableHeaderCell>
              <TableHeaderCell className="text-xs text-gray-400 uppercase tracking-wide">
                Company
              </TableHeaderCell>
              <TableHeaderCell className="text-xs text-gray-400 uppercase tracking-wide">
                Round
              </TableHeaderCell>
              <TableHeaderCell className="text-xs text-gray-400 uppercase tracking-wide">
                Amount
              </TableHeaderCell>
              <TableHeaderCell className="text-xs text-gray-400 uppercase tracking-wide">
                Sector
              </TableHeaderCell>
              <TableHeaderCell className="text-xs text-gray-400 uppercase tracking-wide">
                Geo
              </TableHeaderCell>
              <TableHeaderCell className="text-xs text-gray-400 uppercase tracking-wide">
                Investors
              </TableHeaderCell>
              <TableHeaderCell className="text-xs text-gray-400 uppercase tracking-wide">
                Notes
              </TableHeaderCell>
              <TableHeaderCell className="text-xs text-gray-400 uppercase tracking-wide w-8">
                {/* Remove */}
              </TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredDeals.map((item) => {
              // Inline confirmation row
              if (confirmRemove === item._watchlistItemId) {
                return (
                  <TableRow key={`${item.id}-confirm`}>
                    <TableCell colSpan={9}>
                      <div className="flex items-center gap-3 text-sm">
                        <span className="text-gray-300">
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
                          className="text-red-400 hover:underline font-medium"
                        >
                          Yes, remove
                        </button>
                        <button
                          onClick={() => setConfirmRemove(null)}
                          className="text-gray-400 hover:text-gray-100"
                        >
                          Cancel
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              }

              const amt = item.amount_usd
                ? `$${(item.amount_usd / 1_000_000).toFixed(1)}M`
                : "Undisclosed";
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
                    : `${item.all_investors[0]} +${item.all_investors.length - 1} more`
                  : "\u2014";

              return (
                <TableRow
                  key={item.id}
                  className="cursor-pointer hover:bg-gray-800"
                  onClick={() => navigate(`/company/${item._companyId}`)}
                >
                  <TableCell className="text-sm text-gray-400">
                    {dateStr}
                  </TableCell>
                  <TableCell className="text-sm font-medium text-gray-100">
                    {item._companyName}
                  </TableCell>
                  <TableCell>
                    <DealTypeBadge
                      dealType={item.deal_type}
                      label={item.round_label ?? undefined}
                    />
                  </TableCell>
                  <TableCell
                    className={`text-sm tabular-nums ${
                      item.amount_usd
                        ? "text-gray-100"
                        : "text-gray-400 italic"
                    }`}
                  >
                    {amt}
                  </TableCell>
                  <TableCell className="text-sm text-gray-400">
                    {item.sector.join(", ") || "\u2014"}
                  </TableCell>
                  <TableCell className="text-sm text-gray-400">
                    {item.geo ?? "\u2014"}
                  </TableCell>
                  <TableCell className="text-sm text-gray-400">
                    {investorDisplay}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <InlineNoteEditor
                      watchlistItemId={item._watchlistItemId}
                      initialNote={item._notes}
                    />
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() =>
                        setConfirmRemove(item._watchlistItemId)
                      }
                      className="text-gray-400 hover:text-red-400 p-1 transition-colors"
                      aria-label="Remove from watchlist"
                      title="Remove from watchlist"
                    >
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
