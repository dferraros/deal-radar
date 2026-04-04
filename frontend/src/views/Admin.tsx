import { useEffect, useState } from 'react'

interface IngestionRun {
  id: string
  source: string | null
  status: string | null
  deals_found: number | null
  deals_added: number | null
  run_at: string | null
  error_log: string | null
}

function StatusText({ status }: { status: string | null }) {
  if (!status) return <span className="text-zinc-500">unknown</span>
  if (status === 'success')
    return <span className="text-emerald-400 font-mono text-xs">SUCCESS</span>
  if (status === 'failed')
    return <span className="text-red-400 font-mono text-xs">FAILED</span>
  if (status === 'partial')
    return <span className="text-amber-400 font-mono text-xs">PARTIAL</span>
  return <span className="text-zinc-400 font-mono text-xs uppercase">{status}</span>
}

function formatRunAt(runAt: string | null): string {
  if (!runAt) return '—'
  const d = new Date(runAt)
  return d.toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}

export default function Admin() {
  const [runs, setRuns] = useState<IngestionRun[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch('/api/admin/runs?limit=50')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data: IngestionRun[]) => {
        setRuns(data)
        setLoading(false)
      })
      .catch((e) => {
        setError(e.message)
        setLoading(false)
      })
  }, [])

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-zinc-500 font-mono text-sm">
        Loading run history...
      </div>
    )
  }

  if (error) {
    return (
      <div className="m-6 rounded bg-red-950/30 border border-red-800/50 text-red-300 px-4 py-3 text-sm font-mono">
        Failed to load ingestion runs: {error}
      </div>
    )
  }

  return (
    <div className="px-6 pt-6 pb-6 space-y-4">
      {/* Page header */}
      <div>
        <h1 className="text-lg font-semibold text-zinc-50">Ingestion Run Log</h1>
        <p className="text-xs text-zinc-500 mt-0.5 font-mono">
          Last {runs.length} pipeline runs — newest first
        </p>
      </div>

      {runs.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center">
          <p className="text-sm text-zinc-400 font-mono">
            No ingestion runs yet. Trigger via POST /api/ingest/run
          </p>
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-zinc-800">
                {['Run Time', 'Source', 'Status', 'Found', 'Added', 'Error'].map((h) => (
                  <th
                    key={h}
                    className="text-left text-xs uppercase tracking-wider text-zinc-500 py-3 px-4 font-medium"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <>
                  <tr
                    key={run.id}
                    className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors"
                  >
                    <td className="py-2.5 px-4 font-mono text-xs text-zinc-500 whitespace-nowrap">
                      {formatRunAt(run.run_at)}
                    </td>
                    <td className="py-2.5 px-4">
                      <span className="font-mono text-xs text-zinc-300">{run.source ?? '—'}</span>
                    </td>
                    <td className="py-2.5 px-4">
                      <StatusText status={run.status} />
                    </td>
                    <td className="py-2.5 px-4 font-mono text-xs text-zinc-400 text-right">
                      {run.deals_found ?? '—'}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-xs text-zinc-400 text-right">
                      {run.deals_added ?? '—'}
                    </td>
                    <td className="py-2.5 px-4 max-w-xs">
                      {run.error_log ? (
                        <button
                          onClick={() => toggleExpand(run.id)}
                          className="text-left text-xs text-red-400 hover:text-red-300 transition-colors font-mono"
                        >
                          {expanded.has(run.id)
                            ? '▲ hide'
                            : run.error_log.slice(0, 50) + (run.error_log.length > 50 ? '…' : '')}
                        </button>
                      ) : (
                        <span className="text-zinc-700 text-xs font-mono">—</span>
                      )}
                    </td>
                  </tr>
                  {/* Expanded error row */}
                  {expanded.has(run.id) && run.error_log && (
                    <tr
                      key={`${run.id}-expanded`}
                      className="border-b border-zinc-800/50"
                    >
                      <td colSpan={6} className="px-4 pb-2">
                        <pre className="font-mono text-xs text-red-300 bg-red-950/20 p-2 rounded mt-1 overflow-x-auto whitespace-pre-wrap">
                          {run.error_log}
                        </pre>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
