import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { Brain, ChevronDown, ChevronRight, ExternalLink, ArrowLeft } from 'lucide-react'
import LoadingSpinner from '../components/LoadingSpinner'
import ErrorBanner from '../components/ErrorBanner'

interface EvidenceItem { evidence_text: string; evidence_type: string | null }
interface PrimitiveItem {
  canonical_name: string; layer: string | null;
  confidence: number; is_explicit: boolean; evidence: EvidenceItem[]
}
interface Dossier {
  queue_id: string; company_name: string; website: string
  jtbd: string | null; summary: string | null; target_user: string[]
  profile_confidence: number; primitives: PrimitiveItem[]
  total_funding_usd: number | null
}

const LAYER_ORDER = ['interface', 'application_logic', 'model', 'infra', 'hardware']
const CONFIDENCE_COLOR = (c: number) =>
  c >= 0.75 ? 'text-emerald-400 bg-emerald-950/40 border-emerald-800/40'
  : c >= 0.5  ? 'text-amber-400 bg-amber-950/40 border-amber-800/40'
  : 'text-zinc-400 bg-zinc-800/40 border-zinc-700/40'

function formatUSD(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`
  return `$${n.toLocaleString()}`
}

export default function IntelDossier() {
  const { queueId } = useParams<{ queueId: string }>()
  const navigate = useNavigate()
  const [dossier, setDossier] = useState<Dossier | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [layerExpanded, setLayerExpanded] = useState<Record<string, boolean>>({})

  useEffect(() => {
    axios.get(`/api/intel/companies/${queueId}/dossier`)
      .then((r) => setDossier(r.data))
      .catch(() => setError('Could not load dossier.'))
      .finally(() => setLoading(false))
  }, [queueId])

  if (loading) return <LoadingSpinner />
  if (error || !dossier) return <ErrorBanner message={error || 'Not found'} />

  const byLayer = LAYER_ORDER.reduce((acc, layer) => {
    acc[layer] = dossier.primitives.filter((p) => p.layer === layer)
    return acc
  }, {} as Record<string, PrimitiveItem[]>)

  const LAYER_LABELS: Record<string, string> = {
    interface: 'Interface', application_logic: 'App Logic',
    model: 'Models / Algorithms', infra: 'Infrastructure', hardware: 'Hardware',
  }

  const explicitCount = dossier.primitives.filter(p => p.is_explicit).length
  const inferredCount = dossier.primitives.filter(p => !p.is_explicit).length

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="px-6 pt-6 pb-4">
        <button onClick={() => navigate('/intel')} className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1 mb-4">
          <ArrowLeft size={12} /> Back to queue
        </button>

        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-zinc-50 flex items-center gap-2">
              <Brain size={18} className="text-amber-400" strokeWidth={1.5} />
              {dossier.company_name}
            </h1>
            <a href={dossier.website} target="_blank" rel="noreferrer"
              className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1 mt-1">
              {dossier.website} <ExternalLink size={10} />
            </a>
          </div>
          {dossier.total_funding_usd && (
            <div className="text-right">
              <div className="text-xs text-zinc-500">Total Funding</div>
              <div className="text-lg font-bold text-emerald-400 tabular">{formatUSD(dossier.total_funding_usd)}</div>
            </div>
          )}
        </div>

        {dossier.jtbd && (
          <div className="border-l-4 border-amber-400 bg-amber-950/20 px-4 py-3 rounded-r-lg mb-6">
            <div className="text-xs text-amber-500 font-mono uppercase tracking-wider mb-1">Core Job To Be Done</div>
            <p className="text-sm text-zinc-100 leading-relaxed">{dossier.jtbd}</p>
          </div>
        )}

        {dossier.target_user.length > 0 && (
          <div className="mb-6">
            <div className="text-xs text-zinc-500 font-mono uppercase tracking-wider mb-2">Target Users</div>
            <div className="flex flex-wrap gap-2">
              {dossier.target_user.map((u) => (
                <span key={u} className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">{u}</span>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3 mb-6">
          <div className="flex-1 bg-emerald-950/30 border border-emerald-900/40 rounded-lg px-4 py-3">
            <div className="text-2xl font-bold text-emerald-400 tabular">{explicitCount}</div>
            <div className="text-[10px] text-emerald-600 font-mono uppercase tracking-wider mt-0.5">Explicit signals</div>
            <div className="text-[10px] text-zinc-600 mt-1">from SBOM / ATS</div>
          </div>
          <div className="flex-1 bg-amber-950/30 border border-amber-900/40 rounded-lg px-4 py-3">
            <div className="text-2xl font-bold text-amber-400 tabular">{inferredCount}</div>
            <div className="text-[10px] text-amber-600 font-mono uppercase tracking-wider mt-0.5">Inferred signals</div>
            <div className="text-[10px] text-zinc-600 mt-1">from page text</div>
          </div>
          <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3">
            <div className="text-2xl font-bold text-zinc-100 tabular">{(dossier.profile_confidence * 100).toFixed(0)}%</div>
            <div className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider mt-0.5">Profile confidence</div>
            <div className="w-full h-1 bg-zinc-800 rounded mt-2">
              <div className="h-full rounded bg-amber-400" style={{ width: `${dossier.profile_confidence * 100}%` }} />
            </div>
          </div>
        </div>

        {dossier.summary && (
          <p className="text-sm text-zinc-400 mb-6 leading-relaxed">{dossier.summary}</p>
        )}

        <h2 className="text-xs font-mono text-zinc-500 uppercase tracking-wider mb-3">Inferred Technology Stack</h2>
        <div className="space-y-3 mb-8">
          {LAYER_ORDER.map((layer) => {
            const prims = byLayer[layer]
            if (!prims.length) return null
            const isExpanded = layerExpanded[layer] ?? true
            return (
              <div key={layer} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                <button
                  onClick={() => setLayerExpanded(e => ({ ...e, [layer]: !(e[layer] ?? true) }))}
                  className="flex items-center justify-between w-full text-xs text-zinc-500 font-mono uppercase tracking-wider mb-3"
                >
                  <span>{LAYER_LABELS[layer]}</span>
                  <span className="text-zinc-600">{isExpanded ? '▾' : '▸'} {prims.length}</span>
                </button>
                {isExpanded && (
                  <div className="flex flex-wrap gap-2">
                    {prims.map((p) => (
                      <div key={p.canonical_name}>
                        <button
                          onClick={() => setExpanded((e) => ({ ...e, [p.canonical_name]: !e[p.canonical_name] }))}
                          className={`inline-flex flex-col items-start gap-1 text-xs px-2.5 py-1.5 rounded border transition-colors ${CONFIDENCE_COLOR(p.confidence)}`}
                        >
                          <span className="flex items-center gap-1.5">
                            {p.is_explicit ? '●' : '○'} {p.canonical_name}
                            {expanded[p.canonical_name] ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                          </span>
                          <div className="w-8 h-0.5 bg-zinc-700 rounded overflow-hidden">
                            <div className="h-full rounded" style={{
                              width: `${p.confidence * 100}%`,
                              backgroundColor: p.confidence >= 0.75 ? '#34d399' : p.confidence >= 0.5 ? '#fbbf24' : '#71717a'
                            }} />
                          </div>
                        </button>
                        {expanded[p.canonical_name] && p.evidence.length > 0 && (
                          <div className="mt-2 ml-1 space-y-1.5">
                            {p.evidence.map((ev, i) => (
                              <div key={i} className="text-xs text-zinc-400 bg-zinc-800/60 border border-zinc-700/50 rounded px-3 py-2 italic">
                                {p.is_explicit
                                  ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-500 border border-emerald-900/40 font-mono mr-2 not-italic">SBOM/ATS</span>
                                  : <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 border border-zinc-700 font-mono mr-2 not-italic">inferred</span>
                                }
                                "{ev.evidence_text}"
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
