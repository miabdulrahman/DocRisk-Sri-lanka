import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { User } from 'firebase/auth'
import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { Home, Plus } from 'lucide-react'
import { IconCamera, IconLink } from '@tabler/icons-react'
import { NotificationPanel } from '../components/NotificationPanel'
import { ShareProtectionModal } from '../components/ShareProtectionModal'
import { db, isFirebaseConfigured } from '../lib/firebase'
import { timeAgo } from '../lib/timeAgo'
import type { AnalysisResult, CircleMember, RiskLevel } from '../types'
import { MemberCard } from '../components/MemberCard'

function buildCheckLink(token: string): string {
  const raw = (import.meta.env.VITE_APP_ORIGIN as string | undefined)?.trim()
  const base = raw ? raw.replace(/\/$/, '') : window.location.origin
  const url = new URL('/check', base)
  url.searchParams.set('token', token)
  return url.href
}

function toIso(v: unknown): string {
  if (v == null) return new Date().toISOString()
  if (typeof v === 'string') return v
  if (v instanceof Timestamp) return v.toDate().toISOString()
  if (typeof v === 'object' && v !== null && 'toDate' in v && typeof (v as Timestamp).toDate === 'function') {
    return (v as Timestamp).toDate().toISOString()
  }
  return new Date().toISOString()
}

function mapMember(id: string, data: Record<string, unknown>): CircleMember {
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
    addedAt: toIso(data.addedAt),
    totalChecks: typeof data.totalChecks === 'number' ? data.totalChecks : 0,
    lastCheckAt: data.lastCheckAt == null ? null : toIso(data.lastCheckAt),
    isActive: data.isActive !== false,
  }
}

function riskShort(rl: RiskLevel | null): string {
  if (rl === 'high') return 'High'
  if (rl === 'medium') return 'Caution'
  if (rl === 'low') return 'Safe'
  return '—'
}

type ActivityRow = {
  id: string
  memberName: string
  checkType: 'link' | 'document'
  riskLevel: RiskLevel | null
  createdAt: string
}

type FormRel = 'grandmother' | 'grandfather' | 'child' | 'parent' | 'other'

const FORM_REL_OPTIONS: { value: FormRel; label: string }[] = [
  { value: 'grandmother', label: 'Grandmother' },
  { value: 'grandfather', label: 'Grandfather' },
  { value: 'child', label: 'Child' },
  { value: 'parent', label: 'Parent' },
  { value: 'other', label: 'Other' },
]

export default function GuardianDashboard({ user }: { user: User }) {
  const uid = user.uid
  const [loading, setLoading] = useState(true)
  const [circleReady, setCircleReady] = useState(false)
  const [members, setMembers] = useState<CircleMember[]>([])
  const [recentActivity, setRecentActivity] = useState<ActivityRow[]>([])
  const [error, setError] = useState<string | null>(null)

  const [showAddForm, setShowAddForm] = useState(false)
  const [memberName, setMemberName] = useState('')
  const [memberPhone, setMemberPhone] = useState('')
  const [memberRel, setMemberRel] = useState<FormRel>('parent')
  const [saving, setSaving] = useState(false)
  const [shareMember, setShareMember] = useState<CircleMember | null>(null)

  const displayGuardianName = user.displayName?.trim() || user.email?.split('@')[0] || 'Guardian'

  // Optional desktop alerts for high-risk member checks (handled in NotificationPanel)
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    if (Notification.permission === 'default') {
      void Notification.requestPermission()
    }
  }, [])
  useEffect(() => {
    if (!isFirebaseConfigured) {
      setLoading(false)
      setError('Firebase is not configured. Add VITE_FIREBASE_* to client/.env.')
      return
    }

    let unsubMembers: (() => void) | undefined

    ;(async () => {
      try {
        const circleRef = doc(db, 'circles', uid)
        const snap = await getDoc(circleRef)
        if (!snap.exists()) {
          await setDoc(circleRef, {
            guardianName: displayGuardianName,
            createdAt: serverTimestamp(),
            memberCount: 0,
          })
        } else {
          await updateDoc(circleRef, { guardianName: displayGuardianName }).catch(() => {})
        }

        setCircleReady(true)
        unsubMembers = onSnapshot(collection(db, 'circles', uid, 'members'), (q) => {
          const list: CircleMember[] = []
          q.forEach((d) => {
            list.push(mapMember(d.id, d.data() as Record<string, unknown>))
          })
          list.sort((a, b) => a.name.localeCompare(b.name))
          setMembers(list)
          setLoading(false)
        })
      } catch (e) {
        console.error(e)
        setError(e instanceof Error ? e.message : 'Could not load guardian circle.')
        setLoading(false)
      }
    })()

    return () => {
      unsubMembers?.()
    }
  }, [uid, displayGuardianName])

  // Recent activity (last 5 checks for this guardian)
  useEffect(() => {
    if (!isFirebaseConfigured || !circleReady) return
    const q = query(
      collection(db, 'check_requests'),
      where('guardianId', '==', uid),
      orderBy('createdAt', 'desc'),
      limit(5),
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
        setRecentActivity(list)
      },
      (err) => console.warn('[recent activity]', err),
    )
    return () => unsub()
  }, [uid, circleReady])

  const removeMember = useCallback(
    async (memberId: string) => {
      if (!isFirebaseConfigured) return
      setError(null)
      try {
        await deleteDoc(doc(db, 'circles', uid, 'members', memberId))
        await updateDoc(doc(db, 'circles', uid), {
          memberCount: increment(-1),
        })
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to remove member.')
      }
    },
    [uid],
  )

  const onCopyLinkGlobal = useCallback((_link: string) => {
    /* optional analytics */
  }, [])

  const submitMember = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!memberName.trim() || !memberPhone.trim()) {
      setError('Please enter name and phone.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const memberToken = crypto.randomUUID()
      const checkLink = buildCheckLink(memberToken)
      const memberRef = await addDoc(collection(db, 'circles', uid, 'members'), {
        name: memberName.trim(),
        phone: memberPhone.trim(),
        relationship: memberRel,
        memberToken,
        checkLink,
        addedAt: serverTimestamp(),
        totalChecks: 0,
        lastCheckAt: null,
        isActive: true,
      })
      await updateDoc(doc(db, 'circles', uid), {
        memberCount: increment(1),
      })

      const newMember: CircleMember = {
        id: memberRef.id,
        name: memberName.trim(),
        phone: memberPhone.trim(),
        relationship: memberRel,
        memberToken,
        checkLink,
        addedAt: new Date().toISOString(),
        totalChecks: 0,
        lastCheckAt: null,
        isActive: true,
      }
      setShareMember(newMember)
      setMemberName('')
      setMemberPhone('')
      setMemberRel('parent')
      setShowAddForm(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add member.')
    } finally {
      setSaving(false)
    }
  }

  if (!isFirebaseConfigured) {
    return (
      <div className="page guardian-page">
        <div className="api-error" role="alert">
          Firebase is not configured. Add your web app keys to <code>client/.env</code>.
        </div>
        <Link to="/" className="btn btn-ghost">
          <Home size={16} /> Back to app
        </Link>
      </div>
    )
  }

  return (
    <div className="page guardian-page">
      <header className="guardian-page__bar guardian-page__bar--split">
        <Link to="/" className="guardian-page__home">
          <Home size={18} />
          Back to DocRisk
        </Link>
        <NotificationPanel guardianId={uid} />
      </header>

      {error && (
        <div className="api-error" role="alert">
          {error}
        </div>
      )}

      <section className="guardian-section guardian-section--header">
        <div className="guardian-section__title-row">
          <h1 className="guardian-title">My Guardian Circle</h1>
          <span className="guardian-count-badge">{members.length}</span>
        </div>
        <p className="guardian-sub">
          Protect family members with a private check link. Only you manage who is in your circle.
        </p>
      </section>

      {loading && (
        <div className="admin-loading">
          <div className="spinner" />
          <p>Loading your circle…</p>
        </div>
      )}

      {!loading && (
        <section className="guardian-section">
          <div className="guardian-member-grid">
            {members.map((m) => (
              <MemberCard
                key={m.id}
                member={m}
                onCopyLink={onCopyLinkGlobal}
                onRemove={removeMember}
                onResendLink={(mem) => setShareMember(mem)}
              />
            ))}
          </div>
        </section>
      )}

      {!loading && (
        <section className="guardian-section guardian-recent-section" aria-labelledby="recent-activity-heading">
          <h2 id="recent-activity-heading" className="guardian-recent-section__title">
            Recent Activity
          </h2>
          {recentActivity.length === 0 ? (
            <p className="guardian-recent-section__empty">No checks yet.</p>
          ) : (
            <ul className="guardian-recent-section__list">
              {recentActivity.map((r) => (
                <li key={r.id}>
                  <Link to={`/guardian/check/${r.id}`} className="guardian-recent-section__row">
                    <span className="guardian-recent-section__name">{r.memberName}</span>
                    <span className="guardian-recent-section__meta">
                      {r.checkType === 'link' ? 'Link' : 'Document'} · {riskShort(r.riskLevel)} ·{' '}
                      {timeAgo(r.createdAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link to="/guardian/history" className="guardian-recent-section__full-link">
            View full history
          </Link>
        </section>
      )}

      <section className="guardian-section">
        {!showAddForm ? (
          <button type="button" className="btn btn-primary guardian-add-start" onClick={() => setShowAddForm(true)}>
            <Plus size={18} />
            Add a family member
          </button>
        ) : (
          <form className="guardian-add-form" onSubmit={submitMember}>
            <h2 className="guardian-add-form__title">New member</h2>
            <label className="guardian-field">
              <span>Name</span>
              <input
                value={memberName}
                onChange={(e) => setMemberName(e.target.value)}
                required
                autoComplete="name"
                placeholder="Full name"
              />
            </label>
            <label className="guardian-field">
              <span>Phone number</span>
              <input
                value={memberPhone}
                onChange={(e) => setMemberPhone(e.target.value)}
                required
                inputMode="tel"
                placeholder="+94771234567"
                autoComplete="tel"
              />
            </label>
            <p className="guardian-field-hint">Sri Lanka format: +94 followed by 9 digits (e.g. +94771234567).</p>
            <label className="guardian-field">
              <span>Relationship</span>
              <select value={memberRel} onChange={(e) => setMemberRel(e.target.value as FormRel)} required>
                {FORM_REL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="guardian-member-preview">
              <p className="guardian-member-preview__caption">
                This is what {memberName.trim() || 'your family member'} will see — simple and easy to use.
              </p>
              <div className="guardian-mc-mock" aria-hidden>
                <div className="guardian-mc-mock__inner">
                  <header className="guardian-mc-mock__header">
                    <span className="guardian-mc-mock__logo" />
                    <span className="guardian-mc-mock__brand">DocRisk Safety Check</span>
                  </header>
                  <p className="guardian-mc-mock__hello">
                    Hello, {memberName.trim() || '…'}
                  </p>
                  <p className="guardian-mc-mock__intro">
                    Received something suspicious? Check it here before clicking or signing.
                  </p>
                  <div className="guardian-mc-mock__actions">
                    <div className="guardian-mc-mock__choice guardian-mc-mock__choice--blue">
                      <IconLink className="guardian-mc-mock__ic" size={22} stroke={1.75} />
                      <span className="guardian-mc-mock__title">Check a suspicious LINK</span>
                      <span className="guardian-mc-mock__sub">
                        Got a text or WhatsApp with a link? Paste it here.
                      </span>
                    </div>
                    <div className="guardian-mc-mock__choice guardian-mc-mock__choice--teal">
                      <IconCamera className="guardian-mc-mock__ic" size={22} stroke={1.75} />
                      <span className="guardian-mc-mock__title">Check a suspicious DOCUMENT</span>
                      <span className="guardian-mc-mock__sub">Got a letter, contract, or job offer? Take a photo.</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="guardian-form-actions">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save member'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setShowAddForm(false)} disabled={saving}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </section>

      {shareMember && (
        <ShareProtectionModal
          member={shareMember}
          guardianName={displayGuardianName}
          onClose={() => setShareMember(null)}
        />
      )}
    </div>
  )
}
