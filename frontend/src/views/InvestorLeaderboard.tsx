import { useEffect, useState } from "react";
import axios from "axios";

interface InvestorEntry {
  investor_name: string;
  deal_count: number;
  total_capital_usd: number;
}

interface LeaderboardResponse {
  period: string;
  date_from: string;
  date_to: string;
  investors: InvestorEntry[];
}

type Period = "weekly" | "monthly" | "quarterly";

function formatCapital(usd: number): string {
  const m = usd / 1_000_000;
  if (m === 0) return "--";
  return m >= 1000 ? `$${(m / 1000).toFixed(1)}B` : `$${Math.round(m)}M`;
}

export default function InvestorLeaderboard() {
  const [period, setPeriod] = useState<Period>("monthly");
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    axios
      .get("/api/investors/leaderboard", { params: { period, limit: 20 } })
      .then((r) => {
        setData(r.data);
      })
      .catch(() => {
        setError("Could not load investor data.");
      })
      .finally(() => setLoading(false));
  }, [period]);

  const periods: { key: Period; label: string }[] = [
    { key: "weekly", label: "Weekly" },
    { key: "monthly", label: "Monthly" },
    { key: "quarterly", label: "Quarterly" },
  ];

  return (
    <div>
      {/* Header */}
      <div className="bg-[#0f1629] border-b border-[#1e2d4a] px-6 py-1.5 flex items-center gap-6 text-xs font-mono text-slate-400">
        <span>
          INVESTOR LEADERBOARD
        </span>
        {data && (
          <span>
            {data.date_from} — {data.date_to}
          </span>
        )}
      </div>

      <div className="px-6 py-4">
        {/* Title + period toggle */}
        <div className="flex items-end justify-between mb-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-500">Analytics</p>
            <h1 className="text-lg font-semibold text-slate-200">Investor Leaderboard</h1>
          </div>

          {/* Period toggle */}
          <div className="flex items-center bg-[#0a0e1a] border border-[#1e2d4a] rounded overflow-hidden">
            {periods.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setPeriod(key)}
                className={`px-3 py-1.5 text-xs font-mono font-semibold uppercase tracking-wide transition-colors ${
                  period === key
                    ? "bg-blue-600 text-white"
                    : "text-slate-400 hover:text-white hover:bg-[#0f1629]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="text-slate-400 font-mono text-sm py-10 text-center">Loading...</div>
        ) : error ? (
          <div className="text-red-400 text-sm py-10 text-center">{error}</div>
        ) : !data || data.investors.length === 0 ? (
          <div className="text-slate-400 font-mono text-sm py-10 text-center">
            No investor data for this period
          </div>
        ) : (
          <div className="bg-[#0f1629] border border-[#1e2d4a] rounded overflow-hidden">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-[#1e2d4a]">
                  {["Rank", "Investor", "Deals", "Total Capital"].map((h) => (
                    <th
                      key={h}
                      className="text-left text-xs uppercase tracking-widest text-slate-500 px-4 py-3 font-normal"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.investors.map((entry, idx) => (
                  <tr
                    key={entry.investor_name}
                    className="border-b border-[#1e2d4a]/50 hover:bg-[#0a0e1a] transition-colors"
                  >
                    <td className="px-4 py-2.5 font-mono text-slate-500 text-xs w-12">
                      {idx + 1}
                    </td>
                    <td className="px-4 py-2.5 font-semibold text-white">
                      {entry.investor_name}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-slate-300 text-sm">
                      {entry.deal_count}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-green-400 font-semibold text-sm">
                      {formatCapital(entry.total_capital_usd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
