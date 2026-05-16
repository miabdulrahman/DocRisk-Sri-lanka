import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { User } from 'firebase/auth'
import { doc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore'
import { ChevronLeft, History } from 'lucide-react'
import { DocumentAnalysisResult } from '../components/DocumentAnalysisResult'
import { db, isFirebaseConfigured } from '../lib/firebase'
import type { AnalysisResult } from '../types'

const PLACEHOLDER_FILE = new File([], 'saved-check', { type: 'application/octet-stream' })

function fmtWhen(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(iso),
    )
  } catch {
    return iso
  }
}

export default function GuardianCheckDetail({ user }: { user: User }) {
  const { requestId } = useParams<{ requestId: string }>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [payload, setPayload] = useState<{
    memberName: string
    type: string
    result: AnalysisResult | null
    status: string
    completedAt: string | null
    createdAt: string | null
    guardianNote: string
  } | null>(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  useEffect(() => {
    if (!isFirebaseConfigured || !requestId) {
      setLoading(false)
      setError('Invalid request.')
      return
    }

    const ref = doc(db, 'check_requests', requestId)
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setError('This check was not found.')
          setPayload(null)
          setLoading(false)
          return
        }
        const data = snap.data() as Record<string, unknown>
        const gid = String(data.guardianId ?? '')
        if (gid !== user.uid) {
          setError('You do not have access to this check.')
          setPayload(null)
          setLoading(false)
          return
        }

        const completedRaw = data.completedAt
        let completedAt: string | null = null
        if (completedRaw && typeof completedRaw === 'object' && completedRaw !== null && 'toDate' in completedRaw) {
          try {
            completedAt = (completedRaw as { toDate(): Date }).toDate().toISOString()
          } catch {
            completedAt = null
          }
        } else if (typeof completedRaw === 'string') {
          completedAt = completedRaw
        }

        const createdRaw = data.createdAt
        let createdAt: string | null = null
        if (createdRaw && typeof createdRaw === 'object' && createdRaw !== null && 'toDate' in createdRaw) {
          try {
            createdAt = (createdRaw as { toDate(): Date }).toDate().toISOString()
          } catch {
            createdAt = null
          }
        } else if (typeof createdRaw === 'string') {
          createdAt = createdRaw
        }

        const gn = String(data.guardianNote ?? '')
        setPayload({
          memberName: String(data.memberName ?? ''),
          type: String(data.type ?? ''),
          result: (data.result as AnalysisResult) ?? null,
          status: String(data.status ?? ''),
          completedAt,
          createdAt,
          guardianNote: gn,
        })
        setNoteDraft(gn)
        setError(null)
        setLoading(false)
      },
      (err) => {
        console.warn('[GuardianCheckDetail]', err)
        setError('Could not load this check.')
        setLoading(false)
      },
    )
    return () => unsub()
  }, [requestId, user.uid])

  const saveNote = async () => {
    if (!isFirebaseConfigured || !requestId || !payload) return
    setSavingNote(true)
    try {
      await updateDoc(doc(db, 'check_requests', requestId), {
        guardianNote: noteDraft.trim(),
        guardianNoteUpdatedAt: serverTimestamp(),
      })
    } catch (e) {
      console.error(e)
    } finally {
      setSavingNote(false)
    }
  }

  if (!isFirebaseConfigured) {
    return (
      <div className="page guardian-page">
        <p className="api-error">Firebase is not configured.</p>
        <Link to="/guardian" className="btn btn-ghost">
          Back
        </Link>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="page guardian-page">
        <div className="admin-loading">
          <div className="spinner" />
          <p>Loading…</p>
        </div>
      </div>
    )
  }

  if (error || !payload) {
    return (
      <div className="page guardian-page">
        <p className="api-error">{error ?? 'Not found.'}</p>
        <Link to="/guardian" className="btn btn-ghost">
          <ChevronLeft size={16} aria-hidden /> Back to My Circle
        </Link>
      </div>
    )
  }

  const fileLabel =
    payload.type === 'link'
      ? `Link check · ${payload.memberName || 'Member'}`
      : `Document check · ${payload.memberName || 'Member'}`

  return (
    <div className="page guardian-page guardian-check-detail-page">
      <header className="guardian-page__bar guardian-page__bar--split">
        <Link to="/guardian" className="guardian-page__home">
          <ChevronLeft size={18} aria-hidden />
          My Circle
        </Link>
        <Link to="/guardian/history" className="guardian-page__link-history">
          <History size={16} aria-hidden />
          Full history
        </Link>
      </header>

      <section className="guardian-section">
        <h1 className="guardian-title">Check details</h1>
        <p className="guardian-sub">
          <strong>{payload.memberName || 'Member'}</strong> checked this {payload.type === 'document' ? 'document' : 'link'}.
          {' · '}
          Status: <strong>{payload.status}</strong>
          {payload.completedAt && (
            <>
              {' · '}
              Completed {fmtWhen(payload.completedAt)}
            </>
          )}
          {!payload.completedAt && payload.createdAt && (
            <>
              {' · '}
              Started {fmtWhen(payload.createdAt)}
            </>
          )}
        </p>
      </section>

      <section className="guardian-section guardian-check-note">
        <h2 className="guardian-check-note__title">Your note</h2>
        <p className="guardian-check-note__hint">
          Add a private reminder after you talk with your family member (stored on this check only).
        </p>
        <textarea
          className="guardian-check-note__input"
          rows={3}
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          placeholder='e.g. "I talked to grandmother about this link."'
        />
        <button type="button" className="btn btn-primary btn-sm" disabled={savingNote} onClick={() => void saveNote()}>
          {savingNote ? 'Saving…' : 'Save note'}
        </button>
      </section>

      {payload.result && (
        <section className="guardian-section guardian-check-result-wrap">
          <DocumentAnalysisResult
            mode="readonly"
            result={payload.result}
            file={PLACEHOLDER_FILE}
            previewUrl={null}
            outputLang="english"
            fileLabel={fileLabel}
          />
        </section>
      )}

      {!payload.result && payload.status !== 'done' && (
        <section className="guardian-section">
          <p className="guardian-sub">Analysis is not available for this check yet.</p>
        </section>
      )}
    </div>
  )
}
