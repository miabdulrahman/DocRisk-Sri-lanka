import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { User } from 'firebase/auth'
import { collection, getDocs } from 'firebase/firestore'
import { IconFile, IconLink } from '@tabler/icons-react'
import { ChevronLeft, History } from 'lucide-react'
import { db, isFirebaseConfigured } from '../lib/firebase'
import { apiFetch, getApiBase } from '../lib/apiBase'
import type { CircleMember, RiskLevel } from '../types'

const REL_LABEL: Record<CircleMember['relationship'], string> = {
  grandmother: 'Grandmother',
  grandfather: 'Grandfather',
  child: 'Child',
  parent: 'Parent',
  other: 'Family member',
}

export type HistoryRow = {
  id: string
  memberName: string
  type: 'link' | 'document'
  inputPreview: string
  riskLevel: RiskLevel | null
  riskScore: number | null
  status: string
  createdAt: string
  completedAt: string | null
}

type ApiResponse = {
  success: boolean
  page: number
  pageSize: number
  total: number
  totalFamilyChecks: number
  items: HistoryRow[]
  stats: {
    high: number
    medium: number
    safe: number
    mostActiveMemberName: string | null
  }
  error?: string
}

function riskBadgeClass(rl: RiskLevel | null): string {
  if (rl === 'high') return 'guardian-history__pill guardian-history__pill--high'
  if (rl === 'medium') return 'guardian-history__pill guardian-history__pill--med'
  if (rl === 'low') return 'guardian-history__pill guardian-history__pill--low'
  return 'guardian-history__pill guardian-history__pill--na'
}

function riskLabel(rl: RiskLevel | null): string {
  if (rl === 'high') return 'High risk'
  if (rl === 'medium') return 'Caution'
  if (rl === 'low') return 'Safe'
  return '—'
}

function mapMemberDoc(id: string, data: Record<string, unknown>): CircleMember {
  const rel = data.relationship
  const relationship: CircleMember['relationship'] =
    rel === 'grandmother' ||
    rel === 'grandfather' ||
    rel === 'child' ||
    rel === 'parent' ||
    rel === 'other'
      ? rel
      : 'other'
  return {
    id,
    name: String(data.name ?? ''),
    phone: String(data.phone ?? ''),
    relationship,
    memberToken: String(data.memberToken ?? ''),
    checkLink: String(data.checkLink ?? ''),
    addedAt: '',
    totalChecks: typeof data.totalChecks === 'number' ? data.totalChecks : 0,
    lastCheckAt: null,
    isActive: data.isActive !== false,
  }
}

export default function GuardianHistory({ user }: { user: User }) {
  const navigate = useNavigate()
  const [members, setMembers] = useState<CircleMember[]>([])
  const [memberKey, setMemberKey] = useState<string>('all')
  const [riskKey, setRiskKey] = useState<string>('all')
  const [page, setPage] = useState(1)
  const pageSize = 20

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<ApiResponse | null>(null)

  useEffect(() => {
    if (!isFirebaseConfigured) return
    let cancelled = false
    ;(async () => {
      try {
        const snap = await getDocs(collection(db, 'circles', user.uid, 'members'))
        if (cancelled) return
        const list: CircleMember[] = []
        snap.forEach((d) => list.push(mapMemberDoc(d.id, d.data() as Record<string, unknown>)))
        list.sort((a, b) => a.name.localeCompare(b.name))
        setMembers(list)
      } catch {
        if (!cancelled) setMembers([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user.uid])

  const memberFilter = memberKey === 'all' ? '' : memberKey
  const riskFilter =
    riskKey === 'all' ? '' : riskKey === 'high' || riskKey === 'medium' || riskKey === 'low' ? riskKey : ''

  const loadHistory = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const token = await user.getIdToken()
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
      })
      if (memberFilter) params.set('memberName', memberFilter)
      if (riskFilter) params.set('riskLevel', riskFilter)

      const base = getApiBase()
      const res = await apiFetch(`${base}/api/guardian/history?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = (await res.json()) as ApiResponse
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? `Request failed (${res.status})`)
      }
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load history.')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [user, page, memberFilter, riskFilter])

  useEffect(() => {
    void loadHistory()
  }, [loadHistory])

  const nameToRel = useMemo(() => {
    const m = new Map<string, string>()
    for (const mem of members) {
      if (mem.name && !m.has(mem.name)) {
        m.set(mem.name, REL_LABEL[mem.relationship])
      }
    }
    return m
  }, [members])

  const fmtDt = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [],
  )

  if (!isFirebaseConfigured) {
    return (
      <div className="page guardian-page">
        <p className="api-error">Firebase is not configured.</p>
        <Link to="/guardian" className="btn btn-ghost">
          Back to My Circle
        </Link>
      </div>
    )
  }

  const items = data?.items ?? []
  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1

  return (
    <div className="page guardian-page guardian-history">
      <header className="guardian-page__bar guardian-page__bar--split">
        <Link to="/guardian" className="guardian-page__home">
          <ChevronLeft size={18} aria-hidden />
          My Circle
        </Link>
      </header>

      <section className="guardian-section guardian-history__intro">
        <span className="guardian-history__eyebrow">
          <History size={14} aria-hidden /> Family activity
        </span>
        <h1 className="guardian-title">Family Check History</h1>
        <p className="guardian-sub">Review every link and document your members checked, with full risk context.</p>
      </section>

      {data && (
        <section className="guardian-history__stats" aria-label="Family check statistics">
          <article className="guardian-history__stat-card">
            <p className="guardian-history__stat-label">Total checks (family)</p>
            <p className="guardian-history__stat-value">{data.totalFamilyChecks}</p>
          </article>
          <article className="guardian-history__stat-card">
            <p className="guardian-history__stat-label">Risk mix</p>
            <p className="guardian-history__stat-mix">
              <span>
                <span className="guardian-history__dot guardian-history__dot--high" /> High risk: {data.stats.high}
              </span>
              <span className="guardian-history__stat-sep">|</span>
              <span>
                <span className="guardian-history__dot guardian-history__dot--med" /> Medium: {data.stats.medium}
              </span>
              <span className="guardian-history__stat-sep">|</span>
              <span>
                <span className="guardian-history__dot guardian-history__dot--low" /> Safe: {data.stats.safe}
              </span>
            </p>
          </article>
          <article className="guardian-history__stat-card">
            <p className="guardian-history__stat-label">Most active member</p>
            <p className="guardian-history__stat-value guardian-history__stat-value--sm">
              {data.stats.mostActiveMemberName ?? '—'}
            </p>
          </article>
        </section>
      )}

      <div className="guardian-history__filters">
        <label className="guardian-history__field">
          <span>Member</span>
          <select
            value={memberKey}
            onChange={(e) => {
              setMemberKey(e.target.value)
              setPage(1)
            }}
          >
            <option value="all">All members</option>
            {members.map((m) => (
              <option key={m.id} value={m.name}>
                {m.name || 'Unnamed'}
              </option>
            ))}
          </select>
        </label>
        <label className="guardian-history__field">
          <span>Risk level</span>
          <select
            value={riskKey}
            onChange={(e) => {
              setRiskKey(e.target.value)
              setPage(1)
            }}
          >
            <option value="all">All levels</option>
            <option value="low">Safe</option>
            <option value="medium">Caution</option>
            <option value="high">High risk</option>
          </select>
        </label>
      </div>

      {error && (
        <div className="api-error" role="alert">
          {error}
        </div>
      )}

      {loading && (
        <div className="admin-loading">
          <div className="spinner" />
          <p>Loading history…</p>
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <p className="guardian-history__empty">No checks match these filters yet.</p>
      )}

      {!loading && items.length > 0 && (
        <>
          <div className="guardian-history__table-wrap">
            <table className="guardian-history__table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Type</th>
                  <th>Input</th>
                  <th>Risk</th>
                  <th>Score</th>
                  <th>When</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((row) => {
                  const rel = nameToRel.get(row.memberName) ?? 'Family member'
                  return (
                    <tr key={row.id}>
                      <td>
                        <span className="guardian-history__member">{row.memberName || 'Member'}</span>
                        <span className="guardian-history__rel">{rel}</span>
                      </td>
                      <td>
                        <span
                          className="guardian-history__type-icon"
                          title={row.type === 'link' ? 'Link' : 'Document'}
                        >
                          {row.type === 'link' ? <IconLink size={20} stroke={1.6} /> : <IconFile size={20} stroke={1.6} />}
                        </span>
                      </td>
                      <td>
                        <span className="guardian-history__preview">{row.inputPreview}</span>
                      </td>
                      <td>
                        <span className={riskBadgeClass(row.riskLevel)}>{riskLabel(row.riskLevel)}</span>
                      </td>
                      <td>
                        <span className="guardian-history__score">
                          {row.riskScore != null ? Math.round(row.riskScore) : '—'}
                        </span>
                      </td>
                      <td>
                        <time className="guardian-history__time" dateTime={row.createdAt}>
                          {fmtDt.format(new Date(row.createdAt))}
                        </time>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => navigate(`/guardian/check/${row.id}`)}
                        >
                          View details
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="guardian-history__pager">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <span className="guardian-history__page-meta">
              Page {page} of {totalPages} ({data?.total ?? 0} results)
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  )
}
