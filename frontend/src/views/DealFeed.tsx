import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import {
  Card,
  Table,
  TableHead,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell,
  Metric,
  Text,
} from "@tremor/react";
import FilterBar, { defaultFilters } from "../components/FilterBar";
import type { FilterState } from "../components/FilterBar";
import DealTypeBadge from "../components/DealTypeBadge";
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
  source_name: string | null;
  sector: string[];
  geo: string | null;
}

interface KPIResponse {
  deals_this_week: number;
  capital_this_week_usd: number;
  top_sector_this_week: string;
}

// ---- Format helpers ----

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatAmount(usd: number | null): { text: string; muted: boolean } {
  if (usd === null) return { text: "Undisclosed", muted: true };
  const m = usd / 1_000_000;
  const formatted = m >= 100 ? `$${Math.round(m)}M` : `$${m.toFixed(1)}M`;
  return { text: formatted, muted: false };
}

function formatInvestors(all: string[]): string {
  if (all.length === 0) return "—";
  if (all.length === 1) return all[0];
  return `${all[0]} +${all.length - 1} more`;
}

function formatCapital(usd: number): string {
  const m = usd / 1_000_000;
  return m >= 1000 ? `$${(m / 1000).toFixed(1)}B` : `$${Math.round(m)}M`;
}

function buildParams(f: FilterState): Record<string, string> {
  const params: Record<string, string> = {};
  if (f.dealType) params.deal_type = f.dealType;
  if (f.sector) params.sector = f.sector;
  if (f.geo) params.geo = f.geo;
  if (f.amountMin) params.amount_min = f.amountMin;
  if (f.dateFrom) params.date_from = f.dateFrom.toISOString().slice(0, 10);
  if (f.dateTo) params.date_to = f.dateTo.toISOString().slice(0, 10);
  return params;
}

// ---- Component ----

export default function DealFeed() {
  const navigate = useNavigate();

  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [deals, setDeals] = useState<DealResponse[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kpis, setKpis] = useState<KPIResponse | null>(null);
  const [sectors, setSectors] = useState<string[]>([]);

  const fetchDeals = useCallback(async (f: FilterState) => {
    setLoading(true);
    setError(null);
    setPage(1);
    try {
      const params = { ...buildParams(f), page: "1", limit: "25" };
      const res = await axios.get("/api/deals", { params });
      setDeals(res.data.deals);
      setHasMore(res.data.page < res.data.pages);
    } catch {
      setError(
        "Could not load data. Check your connection or try refreshing the page."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const res = await axios.get("/api/deals", {
        params: { ...buildParams(filters), page: String(nextPage), limit: "25" },
      });
      setDeals((prev) => [...prev, ...res.data.deals]);
      setPage(nextPage);
      setHasMore(nextPage < res.data.pages);
    } catch {
      // silently fail on load-more; user already has data
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    axios
      .get("/api/kpis")
      .then((r) => setKpis(r.data))
      .catch(() => {});
    axios
      .get("/api/deals/sectors")
      .then((r) => setSectors(r.data.sectors ?? []))
      .catch(() => {});
    fetchDeals(defaultFilters);
  }, [fetchDeals]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-100 mb-6">Deal Feed</h1>

      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card className="bg-gray-900 border-gray-800">
          <Text className="text-xs font-bold text-gray-400 uppercase tracking-wide">
            Deals This Week
          </Text>
          <Metric className="text-gray-100 tabular-nums">
            {kpis?.deals_this_week ?? "—"}
          </Metric>
        </Card>
        <Card className="bg-gray-900 border-gray-800">
          <Text className="text-xs font-bold text-gray-400 uppercase tracking-wide">
            Capital Raised (7d)
          </Text>
          <Metric className="text-gray-100 tabular-nums">
            {kpis ? formatCapital(kpis.capital_this_week_usd) : "—"}
          </Metric>
        </Card>
        <Card className="bg-gray-900 border-gray-800">
          <Text className="text-xs font-bold text-gray-400 uppercase tracking-wide">
            Top Sector
          </Text>
          <Metric className="text-gray-100">
            {kpis?.top_sector_this_week ?? "—"}
          </Metric>
        </Card>
      </div>

      {/* Filter bar */}
      <FilterBar
        filters={filters}
        sectors={sectors}
        onFilterChange={(f) => {
          setFilters(f);
          fetchDeals(f);
        }}
      />

      {/* Table area */}
      <div className="mt-2">
        {loading ? (
          <LoadingSpinner />
        ) : error ? (
          <ErrorBanner message={error} />
        ) : deals.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-xl font-bold text-gray-300">No deals found</p>
            <p className="text-sm text-gray-400 mt-2">
              Try adjusting your filters, or check back after the next ingestion
              at 7am UTC.
            </p>
          </div>
        ) : (
          <>
            <Table>
              <TableHead>
                <TableRow>
                  {[
                    "Date",
                    "Company",
                    "Round",
                    "Amount",
                    "Sector",
                    "Geo",
                    "Investors",
                  ].map((h) => (
                    <TableHeaderCell
                      key={h}
                      className="text-xs font-bold text-gray-400 uppercase tracking-wide"
                    >
                      {h}
                    </TableHeaderCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {deals.map((deal) => {
                  const amt = formatAmount(deal.amount_usd);
                  return (
                    <TableRow
                      key={deal.id}
                      className="cursor-pointer hover:bg-gray-800 transition-colors"
                      onClick={() =>
                        deal.company_id &&
                        navigate(`/company/${deal.company_id}`)
                      }
                    >
                      <TableCell className="text-sm text-gray-400">
                        {formatDate(deal.announced_date)}
                      </TableCell>
                      <TableCell className="text-sm text-gray-100">
                        {deal.company_name ?? "—"}
                      </TableCell>
                      <TableCell>
                        <DealTypeBadge
                          dealType={deal.deal_type}
                          label={deal.round_label ?? undefined}
                        />
                      </TableCell>
                      <TableCell
                        className={`text-sm tabular-nums ${
                          amt.muted ? "text-gray-400 italic" : "text-gray-100"
                        }`}
                      >
                        {amt.text}
                      </TableCell>
                      <TableCell className="text-sm text-gray-400">
                        {deal.sector.join(", ") || "—"}
                      </TableCell>
                      <TableCell className="text-sm text-gray-400">
                        {deal.geo ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm text-gray-400">
                        {formatInvestors(deal.all_investors)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {/* Load more */}
            {hasMore && (
              <div className="mt-4 text-center">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="text-sm text-amber-400 underline hover:text-amber-300 disabled:opacity-50"
                >
                  {loadingMore ? "Loading..." : "Load more deals"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
