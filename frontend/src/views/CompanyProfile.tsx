import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { Card, Badge, List, ListItem } from '@tremor/react'
import DealTypeBadge from '../components/DealTypeBadge'
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
}

interface CompanyResponse {
  id: string
  name: string
  sector: string[]
  geo: string | null
  description: string | null
  website: string | null
  in_watchlist: boolean
  deals: DealResponse[]
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
          {/* Header card */}
          <Card className="bg-zinc-900 border-zinc-800 relative">
            {/* Watchlist toggle — top-right absolute */}
            <div className="absolute top-4 right-4">
              <WatchlistToggle companyId={company.id} initialState={company.in_watchlist} />
            </div>

            {/* Company name */}
            <h1 className="text-2xl font-bold text-zinc-50 pr-40">{company.name}</h1>

            {/* Sector badges */}
            <div className="flex flex-wrap gap-2 mt-2">
              {company.sector.map((s) => (
                <Badge key={s} color="blue">
                  {s}
                </Badge>
              ))}
            </div>

            {/* Geo + Website */}
            {company.geo && <p className="text-sm text-zinc-400 mt-1">{company.geo}</p>}
            {company.website && (
              <a
                href={company.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-amber-400 underline mt-1 block"
              >
                {company.website}
              </a>
            )}

            {/* Description with show more */}
            {company.description && (
              <div className="mt-4">
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
          </Card>

          {/* Deal History section */}
          <div className="mt-8">
            <h2 className="text-xl font-bold text-zinc-100 mb-4">Deal History</h2>
            {company.deals.length === 0 ? (
              <p className="text-sm text-zinc-400">No deals recorded for this company yet.</p>
            ) : (
              <List>
                {company.deals.map((deal) => {
                  const amt = deal.amount_usd
                    ? `$${(deal.amount_usd / 1_000_000).toFixed(1)}M`
                    : 'Undisclosed'
                  const dateStr = deal.announced_date
                    ? new Date(deal.announced_date + 'T00:00:00').toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })
                    : '\u2014'
                  return (
                    <ListItem key={deal.id} className="flex-col items-start gap-1 py-3">
                      <div className="flex items-center gap-3 w-full justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-zinc-400">{dateStr}</span>
                          <DealTypeBadge
                            dealType={deal.deal_type}
                            label={deal.round_label ?? undefined}
                          />
                          <span
                            className={`text-sm tabular-nums ${
                              deal.amount_usd ? 'text-zinc-100' : 'text-zinc-400 italic'
                            }`}
                          >
                            {amt}
                          </span>
                        </div>
                        {deal.source_name && (
                          <span className="text-xs text-zinc-400">{deal.source_name}</span>
                        )}
                      </div>
                      {deal.ai_summary && (
                        <p className="text-sm text-zinc-300 italic line-clamp-2 mt-0.5">
                          {deal.ai_summary}
                        </p>
                      )}
                    </ListItem>
                  )
                })}
              </List>
            )}
          </div>

          {/* Known Investors */}
          {company.deals.flatMap((d) => d.all_investors).filter(Boolean).length > 0 && (
            <div className="mt-8">
              <h2 className="text-xl font-bold text-zinc-100 mb-4">Known Investors</h2>
              <div className="flex flex-wrap gap-2">
                {[...new Set(company.deals.flatMap((d) => d.all_investors))].map((inv) => (
                  <Badge key={inv} color="gray">
                    {inv}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
