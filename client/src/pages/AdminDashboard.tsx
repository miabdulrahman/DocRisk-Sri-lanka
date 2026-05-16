import { useCallback, useEffect, useState } from 'react'
import type { User } from 'firebase/auth'
import { BarChart3, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { verifyAdminGate, fetchAdminStats } from '../lib/admin'
import type { AdminStats, RiskLevel } from '../types'

function formatDocType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function getMostCommonType(breakdown: Record<string, number>): string {
  const entries = Object.entries(breakdown)
  if (entries.length === 0) return '—'
  entries.sort((a, b) => b[1] - a[1])
  return formatDocType(entries[0][0])
}

type AdminDashboardProps = {
  user: User
}

export default function AdminDashboard({ user }: AdminDashboardProps) {
  const [adminChecked, setAdminChecked] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [deniedReason, setDeniedReason] = useState<string | null>(null)
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadStats = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const token = await user.getIdToken()
      const data = await fetchAdminStats(token)

      if (!data.success) {
        throw new Error(data.error ?? 'Failed to load stats.')
      }

      setStats({
        totalAnalyses: data.totalAnalyses ?? 0,
        riskBreakdown: data.riskBreakdown ?? { low: 0, medium: 0, high: 0 },
        docTypeBreakdown: data.docTypeBreakdown ?? {},
        avgRiskScore: data.avgRiskScore ?? 0,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stats.')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    let cancelled = false

    async function verifyAdmin() {
      const idToken = await user.getIdToken()
      const gate = await verifyAdminGate(idToken)
      if (cancelled) return
      setDeniedReason(gate.allowed ? null : gate.reason)
      setIsAdmin(gate.allowed)
      setAdminChecked(true)
      if (gate.allowed) await loadStats()
      else setLoading(false)
    }

    void verifyAdmin()
    return () => {
      cancelled = true
    }
  }, [user.uid, loadStats])

  if (!adminChecked || (loading && !stats)) {
    return (
      <div className="admin-loading">
        <div className="spinner" />
        <p>Loading admin dashboard…</p>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="admin-page">
        <h1 className="admin-title">Admin access</h1>
        <div className="admin-error" role="alert">
          {deniedReason ?? 'You do not have access to this page.'}
        </div>
        <p className="admin-subtitle" style={{ maxWidth: 520 }}>
          The API checks Firebase Admin + Firestore document{' '}
          <strong>config/admins</strong> with array field <strong>uids</strong> (your UID from Firebase
          Authentication). Check the backend terminal for <code>[firebase-admin]</code> log lines after
          a refresh if it still fails.
        </p>
        <Link to="/" className="btn btn-primary">
          ← Back to app
        </Link>
      </div>
    )
  }

  const total = stats?.totalAnalyses ?? 0
  const breakdown = stats?.riskBreakdown ?? { low: 0, medium: 0, high: 0 }
  const highPct =
    total > 0 ? Math.round((breakdown.high / total) * 100) : 0
  const mostCommon = stats ? getMostCommonType(stats.docTypeBreakdown) : '—'
  const docTypes = stats
    ? Object.entries(stats.docTypeBreakdown).sort((a, b) => b[1] - a[1])
    : []

  const riskLevels: RiskLevel[] = ['low', 'medium', 'high']

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div>
          <h1 className="admin-title">Fraud Telemetry</h1>
          <p className="admin-subtitle">
            Anonymized stats from the last {total > 0 ? Math.min(total, 500) : 0} analyses
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => void loadStats()}
          disabled={loading}
        >
          <RefreshCw size={16} className={loading ? 'spin' : ''} />
          Refresh
        </button>
      </header>

      {error && <div className="admin-error" role="alert">{error}</div>}

      <section className="admin-metrics">
        <article className="admin-metric-card">
          <p className="admin-metric-card__label">Total Analyses</p>
          <p className="admin-metric-card__value">{total}</p>
        </article>
        <article className="admin-metric-card">
          <p className="admin-metric-card__label">High Risk %</p>
          <p className="admin-metric-card__value">{highPct}%</p>
          <p className="admin-metric-card__hint">{breakdown.high} high-risk documents</p>
        </article>
        <article className="admin-metric-card">
          <p className="admin-metric-card__label">Most Common Type</p>
          <p className="admin-metric-card__value admin-metric-card__value--sm">{mostCommon}</p>
        </article>
        <article className="admin-metric-card">
          <p className="admin-metric-card__label">Avg Risk Score</p>
          <p className="admin-metric-card__value">{stats?.avgRiskScore ?? 0}</p>
          <p className="admin-metric-card__hint">Out of 100</p>
        </article>
      </section>

      <section className="admin-panel">
        <h2 className="admin-panel__title">
          <BarChart3 size={18} style={{ verticalAlign: 'middle', marginRight: 6 }} />
          Risk level distribution
        </h2>
        <div className="admin-chart">
          {riskLevels.map((level) => {
            const count = breakdown[level]
            const pct = total > 0 ? (count / total) * 100 : 0
            return (
              <div key={level} className="admin-chart__row">
                <span className="admin-chart__label">{level}</span>
                <div className="admin-chart__track">
                  <span
                    className={`admin-chart__fill admin-chart__fill--${level}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="admin-chart__count">{count}</span>
              </div>
            )
          })}
        </div>
      </section>

      <section className="admin-panel">
        <h2 className="admin-panel__title">Document types</h2>
        {docTypes.length === 0 ? (
          <p className="admin-subtitle">No telemetry data yet.</p>
        ) : (
          <ul className="admin-doc-list">
            {docTypes.map(([type, count]) => (
              <li key={type} className="admin-doc-item">
                <span className="admin-doc-item__name">{formatDocType(type)}</span>
                <span className="admin-doc-item__count">{count}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Link to="/" className="btn btn-ghost">
        ← Back to app
      </Link>
    </div>
  )
}
