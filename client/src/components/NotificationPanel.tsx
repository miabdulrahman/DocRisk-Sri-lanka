import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { IconBell } from '@tabler/icons-react'
import {
  Timestamp,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { timeAgo } from '../lib/timeAgo'
import type { GuardianNotification } from '../types'

function toIso(v: unknown): string {
  if (v == null) return new Date().toISOString()
  if (typeof v === 'string') return v
  if (v instanceof Timestamp) return v.toDate().toISOString()
  if (typeof v === 'object' && v !== null && 'toDate' in v && typeof (v as Timestamp).toDate === 'function') {
    return (v as Timestamp).toDate().toISOString()
  }
  return new Date().toISOString()
}

function mapNotification(id: string, data: Record<string, unknown>): GuardianNotification {
  const type = data.type === 'member_added' ? 'member_added' : 'check_completed'
  const checkType = data.checkType === 'document' ? 'document' : 'link'
  let riskLevel: GuardianNotification['riskLevel'] = null
  const rl = data.riskLevel
  if (rl === 'low' || rl === 'medium' || rl === 'high') riskLevel = rl

  return {
    id,
    type,
    memberName: String(data.memberName ?? ''),
    checkType,
    riskLevel,
    requestId: String(data.requestId ?? ''),
    read: Boolean(data.read),
    createdAt: toIso(data.createdAt),
  }
}

function riskBadge(rl: GuardianNotification['riskLevel']): string {
  if (rl === 'high') return '🔴 High Risk'
  if (rl === 'medium') return '🟡 Caution'
  if (rl === 'low') return '🟢 Safe'
  return '—'
}

function rowAccentClass(rl: GuardianNotification['riskLevel'], read: boolean): string {
  if (read) return ''
  if (rl === 'high') return 'g-notif-row--accent-high'
  if (rl === 'medium') return 'g-notif-row--accent-med'
  if (rl === 'low') return 'g-notif-row--accent-low'
  return 'g-notif-row--accent-default'
}

export type NotificationPanelProps = {
  guardianId: string
}

export function NotificationPanel({ guardianId }: NotificationPanelProps) {
  const navigate = useNavigate()
  const [items, setItems] = useState<GuardianNotification[]>([])
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const browserAlertedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const q = query(
      collection(db, 'notifications', guardianId, 'items'),
      orderBy('createdAt', 'desc'),
      limit(20),
    )
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: GuardianNotification[] = []
        snap.forEach((d) => list.push(mapNotification(d.id, d.data() as Record<string, unknown>)))
        setItems(list)
      },
      (err) => console.warn('[NotificationPanel]', err),
    )
    return () => unsub()
  }, [guardianId])

  const unreadCount = useMemo(() => items.filter((n) => !n.read).length, [items])

  /** Desktop alerts for new HIGH-risk checks (recent only, once per id). */
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    if (Notification.permission !== 'granted') return

    const recentWindowMs = 5 * 60 * 1000
    const now = Date.now()

    for (const n of items) {
      if (n.type !== 'check_completed' || n.riskLevel !== 'high' || n.read) continue
      if (browserAlertedRef.current.has(n.id)) continue
      const age = now - new Date(n.createdAt).getTime()
      if (age > recentWindowMs) continue

      browserAlertedRef.current.add(n.id)
      try {
        new Notification('DocRisk Alert', {
          body: `${n.memberName} checked a suspicious ${n.checkType}. Risk: HIGH`,
          icon: '/favicon.ico',
        })
      } catch {
        /* ignore */
      }
    }
  }, [items])

  useEffect(() => {
    if (!open) return
    function onDocMouse(e: MouseEvent) {
      const el = wrapRef.current
      if (el && !el.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocMouse)
    return () => document.removeEventListener('mousedown', onDocMouse)
  }, [open])

  const markRead = useCallback(
    async (notifId: string) => {
      await updateDoc(doc(db, 'notifications', guardianId, 'items', notifId), { read: true })
    },
    [guardianId],
  )

  const markAllRead = useCallback(async () => {
    const qUnread = query(collection(db, 'notifications', guardianId, 'items'), where('read', '==', false))
    const snap = await getDocs(qUnread)
    const tasks: Promise<void>[] = []
    snap.forEach((d) => {
      tasks.push(updateDoc(d.ref, { read: true }))
    })
    await Promise.all(tasks)
    setOpen(false)
  }, [guardianId])

  const onRowClick = useCallback(
    async (n: GuardianNotification) => {
      if (!n.read) await markRead(n.id)
      if (n.type === 'check_completed' && n.requestId) {
        navigate(`/guardian/check/${n.requestId}`)
      }
      setOpen(false)
    },
    [markRead, navigate],
  )

  return (
    <div className="g-notif" ref={wrapRef}>
      <button
        type="button"
        className="g-notif__trigger"
        aria-expanded={open}
        aria-label="Notifications"
        onClick={() => setOpen((o) => !o)}
      >
        <IconBell size={22} stroke={1.75} aria-hidden />
        {unreadCount > 0 && (
          <span className="g-notif__badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className="g-notif__dropdown" role="region" aria-label="Notifications">
          <div className="g-notif__toolbar">
            <button type="button" className="g-notif__mark-all" onClick={() => void markAllRead()}>
              Mark all as read
            </button>
          </div>
          <div className="g-notif__scroll">
            {items.length === 0 ? (
              <p className="g-notif__empty">
                No notifications yet. Your family members&apos; checks will appear here.
              </p>
            ) : (
              <ul className="g-notif__list">
                {items.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      className={`g-notif__row ${rowAccentClass(n.riskLevel, n.read)}${n.read ? ' g-notif__row--read' : ''}`}
                      onClick={() => void onRowClick(n)}
                    >
                      <div className="g-notif__row-main">
                        <span className="g-notif__member">{n.memberName || 'Member'}</span>
                        <span className="g-notif__action">
                          {n.type === 'member_added'
                            ? 'joined your circle'
                            : `checked a ${n.checkType === 'document' ? 'document' : 'link'}`}
                        </span>
                        {n.type === 'check_completed' && (
                          <span className="g-notif__risk">{riskBadge(n.riskLevel)}</span>
                        )}
                        <span className="g-notif__time">{timeAgo(n.createdAt)}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
