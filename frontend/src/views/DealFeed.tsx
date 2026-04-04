import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
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

interface BriefingResponse {
  week_start: string;
  week_end: string;
  deal_count: number;
  total_capital_usd: number;
  top_company: string | null;
  top_amount_usd: number | null;
  top_sector: string | null;
  ai_summary: string | null;
  generated_at: string | null;
}

// ---- Format helpers ----

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatAmount(usd: number | null): { text: string; muted: boolean } {
  if (usd === null || usd === undefined) return { text: "Undisclosed", muted: true };
  if (isNaN(usd)) return { text: "Undisclosed", muted: true };
  const m = usd / 1_000_000;
  const formatted = m >= 100 ? `$${Math.round(m)}M` : `$${m.toFixed(1)}M`;
  return { text: formatted, muted: false };
}

function formatInvestors(all: string[]): string {
  if (!all || all.length === 0) return "—";
  if (all.length === 1) return all[0];
  return `${all[0]} +${all.length - 1}`;
}

function formatCapital(usd: number | null | undefined): string {
  if (usd === null || usd === undefined || isNaN(usd)) return "--";
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

function getTodayDeals(deals: DealResponse[]): DealResponse[] {
  const today = new Date().toISOString().slice(0, 10);
  return deals.filter((d) => d.announced_date?.slice(0, 10) === today);
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
  const [search, setSearch] = useState("");
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [briefing, setBriefing] = useState<BriefingResponse | null>(null);

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
      // silently fail on load-more
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
    fetch("/api/admin/runs?limit=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (Array.isArray(data) && data.length > 0 && data[0].run_at) {
          const d = new Date(data[0].run_at);
          setLastSync(
            d.toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })
          );
        }
      })
      .catch(() => {});
    axios
      .get("/api/briefing/latest")
      .then((r) => setBriefing(r.data))
      .catch(() => {});
    fetchDeals(defaultFilters);
  }, [fetchDeals]);

  // Client-side search filter
  const visibleDeals = deals.filter(
    (d) =>
      !search ||
      d.company_name?.toLowerCase().includes(search.toLowerCase()) ||
      d.lead_investor?.toLowerCase().includes(search.toLowerCase())
  );

  const todayDeals = getTodayDeals(deals);
  const todayCapital = todayDeals.reduce(
    (sum, d) => sum + (d.amount_usd ?? 0),
    0
  );

  // KPI card values with NaN guards
  const totalCapitalThisWeek = kpis?.capital_this_week_usd ?? 0;
  const capitalDisplay =
    !kpis || deals.length === 0 ? "--" : formatCapital(totalCapitalThisWeek);

  return (
    <div>
      {/* Ticker / status bar */}
      <div className="bg-[#0f1629] border-b border-[#1e2d4a] px-6 py-1.5 flex items-center gap-6 text-xs font-mono text-slate-400">
        <span>
          DEALS TODAY:{" "}
          <span className="text-white">{todayDeals.length}</span>
        </span>
        <span>
          CAPITAL TODAY:{" "}
          <span className="text-green-400">
            {todayCapital > 0 ? formatCapital(todayCapital) : "--"}
          </span>
        </span>
        {lastSync && (
          <span>
            LAST UPDATED: <span className="text-white">{lastSync}</span>
          </span>
        )}
      </div>

      <div className="px-6 py-4">
        {/* Page title */}
        <div className="mb-4">
          <p className="text-xs uppercase tracking-widest text-slate-500">
            Overview
          </p>
          <h1 className="text-lg font-semibold text-slate-200">Deal Feed</h1>
        </div>

        {/* Weekly briefing banner — only shown when AI summary is available */}
        {briefing?.ai_summary && (
          <div className="bg-[#0f1629] border border-blue-500/30 rounded px-4 py-3 mb-4 text-sm">
            <span className="text-xs uppercase tracking-widest text-blue-400 font-mono mr-2">
              WEEKLY BRIEFING
            </span>
            <span className="text-slate-300">{briefing.ai_summary}</span>
            <span className="text-xs text-slate-500 ml-2 font-mono">
              {briefing.deal_count} deals · {formatCapital(briefing.total_capital_usd)}
            </span>
          </div>
        )}

        {/* KPI row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div className="bg-[#0f1629] border border-[#1e2d4a] rounded px-4 py-3">
            <p className="text-xs uppercase tracking-widest text-slate-500">
              Deals This Week
            </p>
            <p className="font-mono text-xl font-bold text-white mt-1">
              {kpis?.deals_this_week ?? "--"}
            </p>
          </div>
          <div className="bg-[#0f1629] border border-[#1e2d4a] rounded px-4 py-3">
            <p className="text-xs uppercase tracking-widest text-slate-500">
              Capital Raised
            </p>
            <p className="font-mono text-xl font-bold text-white mt-1">
              {capitalDisplay}
            </p>
          </div>
          <div className="bg-[#0f1629] border border-[#1e2d4a] rounded px-4 py-3">
            <p className="text-xs uppercase tracking-widest text-slate-500">
              Top Sector
            </p>
            <p className="font-mono text-xl font-bold text-white mt-1">
              {kpis?.top_sector_this_week ?? "--"}
            </p>
          </div>
        </div>

        {/* Search */}
        <input
          placeholder="Search companies, investors..."
          className="w-full bg-[#0f1629] border border-[#1e2d4a] rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 mb-2"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

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
          ) : visibleDeals.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-base font-semibold text-slate-300">
                No deals found
              </p>
              <p className="text-sm text-slate-500 mt-2">
                Try adjusting your filters, or check back after the next
                ingestion at 7am UTC.
              </p>
            </div>
          ) : (
            <>
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
                    ].map((h) => (
                      <th
                        key={h}
                        className="text-left text-xs uppercase tracking-widest text-slate-500 pb-2 border-b border-[#1e2d4a] font-normal px-2"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleDeals.map((deal) => {
                    const amt = formatAmount(deal.amount_usd);
                    return (
                      <tr
                        key={deal.id}
                        className="border-b border-[#1e2d4a]/50 hover:bg-[#0f1629] cursor-pointer transition-colors"
                        onClick={() =>
                          deal.company_id &&
                          navigate(`/company/${deal.company_id}`)
                        }
                      >
                        <td className="py-2 px-2 font-mono text-slate-400 text-xs whitespace-nowrap">
                          {formatDate(deal.announced_date)}
                        </td>
                        <td className="py-2 px-2 font-semibold text-white">
                          {deal.company_name ?? "—"}
                        </td>
                        <td className="py-2 px-2">
                          <DealTypeBadge
                            dealType={deal.deal_type}
                            label={deal.round_label ?? undefined}
                          />
                        </td>
                        <td className="py-2 px-2">
                          {amt.muted ? (
                            <span className="text-slate-500 italic text-xs">
                              {amt.text}
                            </span>
                          ) : (
                            <span className="font-mono text-green-400 font-semibold">
                              {amt.text}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-slate-400 text-xs">
                          {deal.sector.join(", ") || "—"}
                        </td>
                        <td className="py-2 px-2 text-slate-400 text-xs uppercase">
                          {deal.geo ?? "—"}
                        </td>
                        <td className="py-2 px-2 text-slate-400 text-xs">
                          {formatInvestors(deal.all_investors)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Load more */}
              {hasMore && (
                <div className="mt-4 text-center">
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="text-xs text-blue-400 hover:text-blue-300 underline disabled:opacity-50 font-mono"
                  >
                    {loadingMore ? "Loading..." : "Load more deals"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
