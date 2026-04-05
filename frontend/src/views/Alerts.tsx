import { useEffect, useState } from 'react'
import axios from 'axios'
import { Bell, Plus, Trash2, ToggleLeft, ToggleRight, X } from 'lucide-react'
import LoadingSpinner from '../components/LoadingSpinner'
import ErrorBanner from '../components/ErrorBanner'

interface AlertRule {
  id: string
  label: string | null
  min_amount_usd: number | null
  deal_type: string | null
  sector: string | null
  geo: string | null
  investor_name: string | null
  webhook_url: string | null
  is_active: boolean
  last_triggered_at: string | null
  created_at: string | null
}

interface AlertForm {
  label: string
  min_amount_usd: string
  deal_type: string
  sector: string
  geo: string
  investor_name: string
  webhook_url: string
}

const defaultForm: AlertForm = {
  label: '',
  min_amount_usd: '',
  deal_type: '',
  sector: '',
  geo: '',
  investor_name: '',
  webhook_url: '',
}

const DEAL_TYPES = ['vc', 'ma', 'crypto', 'ipo']
const GEO_OPTIONS = ['latam', 'spain', 'europe', 'us', 'asia', 'global']

function formatAmount(usd: number): string {
  const m = usd / 1_000_000
  if (m >= 1000) return `$${(m / 1000).toFixed(1)}B`
  return m >= 100 ? `$${Math.round(m)}M` : `$${m.toFixed(1)}M`
}

function buildFilterSummary(rule: AlertRule): string {
  const parts: string[] = []
  if (rule.deal_type) parts.push(rule.deal_type.toUpperCase())
  if (rule.min_amount_usd) parts.push(`≥ ${formatAmount(rule.min_amount_usd)}`)
  if (rule.sector) parts.push(rule.sector)
  if (rule.geo) parts.push(rule.geo.toUpperCase())
  if (rule.investor_name) parts.push(`investor: ${rule.investor_name}`)
  return parts.length > 0 ? parts.join(' · ') : 'Any deal'
}

export default function Alerts() {
  const [rules, setRules] = useState<AlertRule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<AlertForm>(defaultForm)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const fetchRules = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await axios.get('/api/alerts')
      setRules(res.data)
    } catch {
      setError('Could not load alert rules. Check your connection or try refreshing.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRules()
  }, [])

  const handleCreate = async () => {
    setSubmitting(true)
    setFormError(null)
    try {
      const payload: Record<string, string | number | null> = {
        label: form.label || null,
        deal_type: form.deal_type || null,
        sector: form.sector || null,
        geo: form.geo || null,
        investor_name: form.investor_name || null,
        webhook_url: form.webhook_url || null,
        min_amount_usd: form.min_amount_usd ? parseInt(form.min_amount_usd, 10) * 1_000_000 : null,
      }
      const res = await axios.post('/api/alerts', payload)
      setRules((prev) => [res.data, ...prev])
      setForm(defaultForm)
      setShowForm(false)
    } catch {
      setFormError('Failed to create alert rule. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleToggle = async (id: string) => {
    try {
      const res = await axios.patch(`/api/alerts/${id}/toggle`)
      setRules((prev) => prev.map((r) => (r.id === id ? res.data : r)))
    } catch {
      // silently fail
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await axios.delete(`/api/alerts/${id}`)
      setRules((prev) => prev.filter((r) => r.id !== id))
    } catch {
      // silently fail
    }
  }

  return (
    <div>
      {/* Page header */}
      <div className="px-6 pt-6 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Bell size={18} className="text-amber-400" strokeWidth={1.5} />
            Alert Rules
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Get notified via webhook when new deals match your criteria
          </p>
        </div>
        <button
          onClick={() => { setShowForm(true); setFormError(null) }}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md transition-colors font-mono"
        >
          <Plus size={13} strokeWidth={2} />
          New Alert
        </button>
      </div>

      {/* New alert form */}
      {showForm && (
        <div className="mx-6 mb-4 bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-slate-800">Create Alert Rule</span>
            <button
              onClick={() => { setShowForm(false); setForm(defaultForm); setFormError(null) }}
              className="text-slate-500 hover:text-slate-700"
            >
              <X size={15} />
            </button>
          </div>

          {formError && (
            <div className="mb-3 text-xs text-red-400 bg-red-900/20 border border-red-800/40 rounded px-3 py-2">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1 uppercase tracking-wider">Label</label>
              <input
                placeholder="e.g. Big LatAm VC rounds"
                className="w-full bg-white border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-amber-400 rounded px-3 py-1.5 text-sm"
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              />
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1 uppercase tracking-wider">Min Amount ($M)</label>
              <input
                type="number"
                placeholder="e.g. 10 for $10M+"
                className="w-full bg-white border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-amber-400 rounded px-3 py-1.5 text-sm"
                value={form.min_amount_usd}
                onChange={(e) => setForm((f) => ({ ...f, min_amount_usd: e.target.value }))}
              />
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1 uppercase tracking-wider">Deal Type</label>
              <select
                className="w-full bg-white border border-slate-200 text-slate-800 focus:outline-none focus:border-amber-400 rounded px-3 py-1.5 text-sm"
                value={form.deal_type}
                onChange={(e) => setForm((f) => ({ ...f, deal_type: e.target.value }))}
              >
                <option value="">Any</option>
                {DEAL_TYPES.map((t) => (
                  <option key={t} value={t}>{t.toUpperCase()}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1 uppercase tracking-wider">Geo</label>
              <select
                className="w-full bg-white border border-slate-200 text-slate-800 focus:outline-none focus:border-amber-400 rounded px-3 py-1.5 text-sm"
                value={form.geo}
                onChange={(e) => setForm((f) => ({ ...f, geo: e.target.value }))}
              >
                <option value="">Any</option>
                {GEO_OPTIONS.map((g) => (
                  <option key={g} value={g}>{g.toUpperCase()}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1 uppercase tracking-wider">Sector</label>
              <input
                placeholder="e.g. fintech, crypto, saas"
                className="w-full bg-white border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-amber-400 rounded px-3 py-1.5 text-sm"
                value={form.sector}
                onChange={(e) => setForm((f) => ({ ...f, sector: e.target.value }))}
              />
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1 uppercase tracking-wider">Investor Name</label>
              <input
                placeholder="e.g. Sequoia Capital"
                className="w-full bg-white border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-amber-400 rounded px-3 py-1.5 text-sm"
                value={form.investor_name}
                onChange={(e) => setForm((f) => ({ ...f, investor_name: e.target.value }))}
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs text-slate-500 mb-1 uppercase tracking-wider">Webhook URL</label>
              <input
                placeholder="https://hooks.slack.com/... or https://your-server.com/hook"
                className="w-full bg-white border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-amber-400 rounded px-3 py-1.5 text-sm"
                value={form.webhook_url}
                onChange={(e) => setForm((f) => ({ ...f, webhook_url: e.target.value }))}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <button
              onClick={() => { setShowForm(false); setForm(defaultForm); setFormError(null) }}
              className="text-xs px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-700 border border-slate-200 rounded transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={submitting}
              className="text-xs px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded transition-colors font-mono"
            >
              {submitting ? 'Creating...' : 'Create Rule'}
            </button>
          </div>
        </div>
      )}

      {/* Rules table */}
      <div className="px-6 pb-6">
        {loading ? (
          <LoadingSpinner />
        ) : error ? (
          <ErrorBanner message={error} />
        ) : rules.length === 0 ? (
          <div className="text-center py-20 bg-white border border-slate-200 rounded-lg shadow-sm">
            <Bell size={32} className="mx-auto text-slate-300 mb-3" strokeWidth={1} />
            <p className="text-base font-semibold text-slate-600">No alert rules yet</p>
            <p className="text-sm text-slate-500 mt-2">
              Create a rule to get notified via webhook when matching deals are ingested.
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="mt-4 text-xs px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md transition-colors font-mono"
            >
              Create your first rule
            </button>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-slate-500 font-medium">
                    Label
                  </th>
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-slate-500 font-medium">
                    Filters
                  </th>
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-slate-500 font-medium">
                    Webhook
                  </th>
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-slate-500 font-medium">
                    Status
                  </th>
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-slate-500 font-medium">
                    Last Triggered
                  </th>
                  <th className="text-right px-4 py-3 text-xs uppercase tracking-wider text-slate-500 font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    {/* Label */}
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-slate-800">
                        {rule.label || <span className="text-slate-400 italic">Unnamed</span>}
                      </span>
                    </td>

                    {/* Filters */}
                    <td className="px-4 py-3">
                      <span className="text-xs text-slate-500 font-mono">
                        {buildFilterSummary(rule)}
                      </span>
                    </td>

                    {/* Webhook */}
                    <td className="px-4 py-3 max-w-[200px]">
                      {rule.webhook_url ? (
                        <span className="text-xs text-slate-500 font-mono truncate block" title={rule.webhook_url}>
                          {rule.webhook_url.replace(/^https?:\/\//, '').substring(0, 40)}
                          {rule.webhook_url.length > 50 ? '…' : ''}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400 italic">No webhook</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-mono border ${
                          rule.is_active
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                            : 'bg-slate-100 text-slate-500 border-slate-200'
                        }`}
                      >
                        {rule.is_active ? 'ACTIVE' : 'PAUSED'}
                      </span>
                    </td>

                    {/* Last Triggered */}
                    <td className="px-4 py-3 text-xs font-mono text-slate-500">
                      {rule.last_triggered_at
                        ? new Date(rule.last_triggered_at).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: false,
                          })
                        : '—'}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleToggle(rule.id)}
                          title={rule.is_active ? 'Pause rule' : 'Activate rule'}
                          className="text-slate-400 hover:text-emerald-500 transition-colors"
                        >
                          {rule.is_active ? (
                            <ToggleRight size={18} strokeWidth={1.5} className="text-emerald-400" />
                          ) : (
                            <ToggleLeft size={18} strokeWidth={1.5} />
                          )}
                        </button>
                        <button
                          onClick={() => handleDelete(rule.id)}
                          title="Delete rule"
                          className="text-slate-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={14} strokeWidth={1.5} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
