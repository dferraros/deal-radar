import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import WatchlistToggle from '../components/WatchlistToggle'
import LoadingSpinner from '../components/LoadingSpinner'
import ErrorBanner from '../components/ErrorBanner'

interface DealResponse {
  id: string
  deal_type: string | null
  amount_usd: number | null
  round_label: string | null
  announced_date: string | null
  source_name: string | null
  ai_summary: string | null
  all_investors: string[]
  lead_investor?: string | null
}

interface CompanyResponse {
  id: string
  name: string
  sector: string[]
  tech_stack: string[]
  geo: string | null
  description: string | null
  website: string | null
  in_watchlist: boolean
  deals: DealResponse[]
  founded_year?: number | null
}

// --- Helpers ---

const GEO_FLAGS: Record<string, string> = {
  latam: '🌎', spain: '🇪🇸', europe: '🇪🇺', us: '🇺🇸',
  asia: '🌏', africa: '🌍', mena: '🕌', global: '🌐',
}

const SECTOR_PILL_COLORS: Record<string, string> = {
  crypto:    'bg-violet-500/15 text-violet-300 border-violet-500/30',
  fintech:   'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  saas:      'bg-sky-500/15 text-sky-300 border-sky-500/30',
  healthtech:'bg-rose-500/15 text-rose-300 border-rose-500/30',
  edtech:    'bg-amber-500/15 text-amber-300 border-amber-500/30',
  proptech:  'bg-orange-500/15 text-orange-300 border-orange-500/30',
  other:     'bg-zinc-500/15 text-zinc-400 border-zinc-600/30',
}

function SectorPill({ sector }: { sector: string }) {
  const cls = SECTOR_PILL_COLORS[sector.toLowerCase()] ?? SECTOR_PILL_COLORS['other']
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-mono uppercase tracking-wide ${cls}`}>
      {sector}
    </span>
  )
}

function formatAmount(usd: number): string {
  const m = usd / 1_000_000
  if (m >= 1000) return `$${(m / 1000).toFixed(1)}B`
  return m >= 100 ? `$${Math.round(m)}M` : `$${m.toFixed(1)}M`
}

export default function CompanyProfile() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [company, setCompany] = useState<CompanyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [descExpanded, setDescExpanded] = useState(false)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setError(null)
    axios
      .get(`/api/companies/${id}`)
      .then((r) => setCompany(r.data))
      .catch((err) => {
        if (err?.response?.status === 404) {
          setCompany(null)
        } else {
          setError('Could not load data. Check your connection or try refreshing the page.')
        }
      })
      .finally(() => setLoading(false))
  }, [id])

  return (
    <div className="px-6 pt-6 pb-6">
      {/* Back link */}
      <button
        onClick={() => navigate(-1)}
        className="text-sm text-amber-400 hover:underline mb-4 block"
      >
        &larr; Back
      </button>

      {loading && <LoadingSpinner />}
      {!loading && error && <ErrorBanner message={error} />}
      {!loading && !error && !company && (
        <div className="text-center py-16">
          <p className="text-xl font-bold text-zinc-300">Company not found</p>
        </div>
      )}
      {!loading && !error && company && (
        <>
          {/* === HEADER BANNER === */}
          <div className="relative bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden mb-6">
            <div className="absolute inset-0 opacity-5"
              style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, #f59e0b 0%, transparent 60%)' }}
            />
            <div className="relative flex items-start justify-between p-6">
              <div className="flex items-start gap-5">
                <div className="w-16 h-16 rounded-xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-2xl font-bold text-amber-400 font-mono">
                    {company.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-zinc-50">{company.name}</h1>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {company.sector.map((s) => (
                      <SectorPill key={s} sector={s} />
                    ))}
                    {company.geo && (
                      <span className="text-xs font-mono text-zinc-500 uppercase">
                        {GEO_FLAGS[company.geo] ?? ''} {company.geo}
                      </span>
                    )}
                    {company.founded_year && (
                      <span className="text-xs text-zinc-500 font-mono">Est. {company.founded_year}</span>
                    )}
                    {company.website && (
                      <a
                        href={company.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-amber-400/70 hover:text-amber-400 font-mono transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        ↗ {company.website.replace(/^https?:\/\//, '').split('/')[0]}
                      </a>
                    )}
                  </div>
                </div>
              </div>
              <WatchlistToggle companyId={company.id} initialState={company.in_watchlist} />
            </div>
          </div>

          {/* Tech stack pills */}
          {(company.tech_stack || []).length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {company.tech_stack.map((tech) => (
                <span
                  key={tech}
                  className="text-[11px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700 font-mono"
                >
                  {tech}
                </span>
              ))}
            </div>
          )}

          {/* Description with show more */}
          {company.description && (
            <div className="mb-6">
              <p
                className={`text-sm text-zinc-300 ${descExpanded ? '' : 'line-clamp-3'}`}
              >
                {company.description}
              </p>
              {company.description.length > 200 && (
                <button
                  onClick={() => setDescExpanded(!descExpanded)}
                  className="text-xs text-amber-400 hover:underline mt-1"
                >
                  {descExpanded ? 'Show less' : 'Show more'}
                </button>
              )}
            </div>
          )}

          {/* === FUNDING TIMELINE === */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-6">
              Funding History
            </h2>
            {company.deals.length === 0 ? (
              <p className="text-sm text-zinc-600">No deals recorded.</p>
            ) : (
              <div className="relative">
                <div className="absolute left-4 top-2 bottom-2 w-px bg-zinc-800" />
                <div className="space-y-6">
                  {[...company.deals]
                    .sort((a, b) =>
                      (b.announced_date ?? '').localeCompare(a.announced_date ?? '')
                    )
                    .map((deal) => {
                      const size = deal.amount_usd
                        ? Math.min(Math.max(Math.log10(deal.amount_usd / 1_000_000 + 1) * 10, 8), 28)
                        : 8
                      return (
                        <div key={deal.id} className="flex items-start gap-4 relative pl-10">
                          <div
                            className="absolute left-0 top-1 rounded-full bg-amber-400 border-2 border-zinc-950 flex-shrink-0"
                            style={{ width: size, height: size, marginLeft: `${4 - size / 2}px` }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-3 flex-wrap">
                              <span className="text-sm font-semibold text-zinc-100">
                                {deal.round_label || deal.deal_type?.toUpperCase() || 'Round'}
                              </span>
                              {deal.amount_usd && (
                                <span className="font-mono text-emerald-400 font-bold">
                                  {formatAmount(deal.amount_usd)}
                                </span>
                              )}
                              <span className="text-xs text-zinc-500 font-mono">
                                {deal.announced_date
                                  ? new Date(deal.announced_date).toLocaleDateString('en-US', {
                                      month: 'short', day: 'numeric', year: 'numeric',
                                    })
                                  : '—'}
                              </span>
                            </div>
                            {deal.all_investors.length > 0 && (
                              <div className="flex gap-1.5 flex-wrap mt-1.5">
                                {deal.all_investors.slice(0, 5).map((inv) => (
                                  <button
                                    key={inv}
                                    onClick={() => navigate(`/leaderboard?investor=${encodeURIComponent(inv)}`)}
                                    className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 hover:bg-amber-500/20 hover:text-amber-400 border border-zinc-700 hover:border-amber-500/30 transition-colors cursor-pointer"
                                  >
                                    {inv}
                                  </button>
                                ))}
                                {deal.all_investors.length > 5 && (
                                  <span className="text-[10px] text-zinc-600">
                                    +{deal.all_investors.length - 5}
                                  </span>
                                )}
                              </div>
                            )}
                            {deal.ai_summary && (
                              <p className="text-xs text-zinc-500 mt-1.5 line-clamp-2">{deal.ai_summary}</p>
                            )}
                            {deal.lead_investor && (
                              <div className="text-xs text-zinc-500 mt-0.5">
                                Lead: <span className="text-zinc-400">{deal.lead_investor}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                </div>
              </div>
            )}
          </div>

          {/* Known Investors */}
          {(() => {
            const allInvestors = [...new Set(
              company.deals.flatMap((d) => d.all_investors ?? []).filter(Boolean)
            )] as string[]
            return allInvestors.length > 0 ? (
              <div className="mt-8">
                <h2 className="text-xl font-bold text-zinc-100 mb-4">Known Investors</h2>
                <div className="flex flex-wrap gap-2">
                  {allInvestors.map((inv) => (
                    <button
                      key={inv}
                      onClick={() => navigate(`/leaderboard?investor=${encodeURIComponent(inv)}`)}
                      className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 hover:bg-amber-500/20 hover:text-amber-400 border border-zinc-700 hover:border-amber-500/30 transition-colors cursor-pointer"
                    >
                      {inv}
                    </button>
                  ))}
                </div>
              </div>
            ) : null
          })()}
        </>
      )}
    </div>
  )
}
