import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { User } from 'firebase/auth'
import {
  Timestamp,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore'
import { Home } from 'lucide-react'
import { db, isFirebaseConfigured } from '../lib/firebase'
import type { AnalysisResult, RiskLevel } from '../types'
import { timeAgo } from '../lib/timeAgo'

type ActivityRow = {
  id: string
  memberName: string
  checkType: 'link' | 'document'
  riskLevel: RiskLevel | null
  createdAt: string
}

function toIso(v: unknown): string {
  if (v == null) return new Date().toISOString()
  if (typeof v === 'string') return v
  if (v instanceof Timestamp) return v.toDate().toISOString()
  return new Date().toISOString()
}

export default function GuardianActivityPage({ user }: { user: User }) {
  const uid = user.uid
  const [rows, setRows] = useState<ActivityRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setLoading(false)
      return
    }

    const q = query(
      collection(db, 'check_requests'),
      where('guardianId', '==', uid),
      orderBy('createdAt', 'desc'),
      limit(100),
    )

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: ActivityRow[] = []
        snap.forEach((d) => {
          const data = d.data() as Record<string, unknown>
          const t = data.type === 'document' ? 'document' : 'link'
          const res = data.result as AnalysisResult | undefined
          const rl = res?.risk_level
          const risk: RiskLevel | null =
            rl === 'low' || rl === 'medium' || rl === 'high' ? rl : null
          list.push({
            id: d.id,
            memberName: String(data.memberName ?? ''),
            checkType: t,
            riskLevel: risk,
            createdAt: toIso(data.createdAt),
          })
        })
        setRows(list)
        setLoading(false)
      },
      (err) => {
        console.warn('[GuardianActivityPage]', err)
        setLoading(false)
      },
    )

    return () => unsub()
  }, [uid])

  if (!isFirebaseConfigured) {
    return (
      <div className="page guardian-page">
        <p className="api-error">Firebase is not configured.</p>
      </div>
    )
  }

  return (
    <div className="page guardian-page">
      <header className="guardian-page__bar">
        <Link to="/guardian" className="guardian-page__home">
          <Home size={18} />
          Back to My Circle
        </Link>
      </header>

      <section className="guardian-section">
        <h1 className="guardian-title">Full activity history</h1>
        <p className="guardian-sub">All recent checks from your circle members.</p>
      </section>

      {loading ? (
        <div className="admin-loading">
          <div className="spinner" />
        </div>
      ) : (
        <section className="guardian-section">
          <ul className="guardian-activity-list">
            {rows.length === 0 ? (
              <li className="guardian-activity-empty">No checks yet.</li>
            ) : (
              rows.map((r) => (
                <li key={r.id} className="guardian-activity-row">
                  <Link to={`/guardian/check/${r.id}`} className="guardian-activity-link">
                    <span className="guardian-activity-name">{r.memberName}</span>
                    <span className="guardian-activity-meta">
                      {r.checkType === 'link' ? 'Link' : 'Document'} ·{' '}
                      {r.riskLevel ? r.riskLevel : '—'} · {timeAgo(r.createdAt)}
                    </span>
                  </Link>
                </li>
              ))
            )}
          </ul>
        </section>
      )}
    </div>
  )
}
