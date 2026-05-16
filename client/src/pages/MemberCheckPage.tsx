import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  collectionGroup,
  getDocs,
  limit,
  query,
  where,
} from 'firebase/firestore'
import { IconAlertCircle, IconAlertTriangle, IconCamera, IconCircleCheck, IconLink } from '@tabler/icons-react'
import { ShieldCheck } from 'lucide-react'
import { db, isFirebaseConfigured } from '../lib/firebase'
import { getApiBase } from '../lib/apiBase'
import type { AnalysisResult } from '../types'
import '../member-check.css'

/** Chromium PWA install prompt (non-standard; typed locally). */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return true
  const nav = window.navigator as Navigator & { standalone?: boolean }
  if (nav.standalone === true) return true
  return window.matchMedia('(display-mode: standalone)').matches
}

function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const isWebKit = /WebKit/.test(ua)
  const isOtherIOSBrowser = /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)
  return isIOS && isWebKit && !isOtherIOSBrowser
}

type MemberContext = {
  guardianId: string
  memberId: string
  memberName: string
  guardianName: string
  guardianPhone: string | null
}

async function fetchMemberContextApi(token: string): Promise<MemberContext | null> {
  const base = getApiBase()
  const url = `${base}/api/guardian/member-context?token=${encodeURIComponent(token)}`
  const res = await fetch(url)
  const data = (await res.json()) as {
    success?: boolean
    guardianId?: string
    memberId?: string
    memberName?: string
    guardianName?: string
    guardianPhone?: string | null
  }
  if (!res.ok || !data.success || !data.guardianId || !data.memberId) return null
  const phone =
    typeof data.guardianPhone === 'string' && data.guardianPhone.trim()
      ? data.guardianPhone.trim()
      : null
  return {
    guardianId: data.guardianId,
    memberId: data.memberId,
    memberName: typeof data.memberName === 'string' ? data.memberName : 'friend',
    guardianName: typeof data.guardianName === 'string' ? data.guardianName : 'your family member',
    guardianPhone: phone,
  }
}

/**
 * Tries a client-side collectionGroup query (as in product specs). Member documents are
 * protected by default rules, so this usually fails; we then load the same data via the API
 * (server uses Admin / collectionGroup securely).
 */
async function tryClientMemberLookup(token: string): Promise<MemberContext | null> {
  if (!isFirebaseConfigured) return null
  try {
    const q = query(
      collectionGroup(db, 'members'),
      where('memberToken', '==', token),
      limit(2),
    )
    const snap = await getDocs(q)
    if (snap.empty) return null
    const docSnap = snap.docs[0]
    if (!docSnap) return null
    const guardianId = docSnap.ref.parent.parent?.id
    if (!guardianId) return null
    const data = docSnap.data() as Record<string, unknown>
    if (data.isActive === false) return null
    const memberName = typeof data.name === 'string' && data.name.trim() ? data.name.trim() : 'friend'
    const api = await fetchMemberContextApi(token)
    const guardianName = api?.guardianName ?? 'your family member'
    return {
      guardianId,
      memberId: docSnap.id,
      memberName,
      guardianName,
      guardianPhone: api?.guardianPhone ?? null,
    }
  } catch {
    return null
  }
}

async function resolveMemberContext(token: string): Promise<MemberContext | null> {
  const fromClient = await tryClientMemberLookup(token)
  if (fromClient) return fromClient
  return fetchMemberContextApi(token)
}

function tierRisk(level: string | undefined): 'low' | 'medium' | 'high' {
  if (level === 'low' || level === 'medium' || level === 'high') return level
  return 'medium'
}

function telHref(phone: string): string {
  const cleaned = phone.trim().replace(/\s/g, '')
  if (!cleaned) return '#'
  return cleaned.startsWith('+') ? `tel:${cleaned}` : `tel:+${cleaned.replace(/\D/g, '')}`
}

type MemberResultProps = {
  riskLevel: 'low' | 'medium' | 'high'
  summary: string
  recommendedAction: string
  redFlags: string[]
  onGuardianReminderPress: () => void
}

function MemberResult({
  riskLevel,
  summary,
  recommendedAction,
  redFlags,
  onGuardianReminderPress,
}: MemberResultProps) {
  if (riskLevel === 'high') {
    return (
      <div className="member-result member-result--high">
        <IconAlertTriangle className="member-result__hero-icon" size={64} stroke={1.5} aria-hidden />
        <h2 className="member-result__title member-result__title--danger">DANGER — Do not click or sign this!</h2>
        <p className="member-result__text">{summary}</p>
        {redFlags.length > 0 && (
          <ul className="member-result__flags">
            {redFlags.map((f, i) => (
              <li key={`${i}-${f.slice(0, 48)}`} className="member-result__flag-item">
                <IconAlertTriangle size={22} stroke={1.6} aria-hidden className="member-result__flag-ic" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="member-result__action-box member-result__action-box--danger">
          <p className="member-result__action-text">{recommendedAction}</p>
        </div>
        <button
          type="button"
          className="member-result__reassure-btn member-result__reassure-btn--danger"
          onClick={onGuardianReminderPress}
        >
          Tell my guardian
        </button>
      </div>
    )
  }

  if (riskLevel === 'medium') {
    return (
      <div className="member-result member-result--medium">
        <IconAlertCircle className="member-result__hero-icon member-result__hero-icon--amber" size={64} stroke={1.5} aria-hidden />
        <h2 className="member-result__title member-result__title--amber">Be careful — something seems unusual</h2>
        <p className="member-result__text">{summary}</p>
        {redFlags.length > 0 && (
          <ul className="member-result__flags member-result__flags--amber">
            {redFlags.map((f, i) => (
              <li key={`${i}-${f.slice(0, 48)}`} className="member-result__flag-item">
                <IconAlertCircle size={22} stroke={1.6} aria-hidden className="member-result__flag-ic" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="member-result__action-box member-result__action-box--amber">
          <p className="member-result__action-text">{recommendedAction}</p>
        </div>
        <button
          type="button"
          className="member-result__reassure-btn member-result__reassure-btn--amber"
          onClick={onGuardianReminderPress}
        >
          Ask my guardian before proceeding
        </button>
      </div>
    )
  }

  return (
    <div className="member-result member-result--low">
      <IconCircleCheck className="member-result__hero-icon member-result__hero-icon--green" size={64} stroke={1.5} aria-hidden />
      <h2 className="member-result__title member-result__title--green">This looks safe</h2>
      <p className="member-result__text">{summary}</p>
      <p className="member-result__inline-note">Your guardian has also been notified.</p>
      {recommendedAction.trim() ? (
        <p className="member-result__text member-result__text--muted">{recommendedAction}</p>
      ) : null}
    </div>
  )
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => {
      const s = r.result as string
      const i = s.indexOf(',')
      resolve(i >= 0 ? s.slice(i + 1) : s)
    }
    r.onerror = () => reject(new Error('Could not read the file.'))
    r.readAsDataURL(file)
  })
}

function MemberPwaStrip({
  standalone,
  deferredInstall,
  hasUsedOnce,
  mode,
  result,
  onInstallClick,
}: {
  standalone: boolean
  deferredInstall: BeforeInstallPromptEvent | null
  hasUsedOnce: boolean
  mode: 'pick' | 'link' | 'document' | null
  result: AnalysisResult | null
  onInstallClick: () => void
}) {
  const showTip = hasUsedOnce && mode === 'pick' && !result

  return (
    <>
      {!standalone && deferredInstall && (
        <div className="member-check__pwa-banner member-check__pwa-banner--install" role="status">
          <p className="member-check__pwa-banner-title">
            Tap &quot;Add to Home Screen&quot; to access this quickly anytime
          </p>
          <button type="button" className="member-check__pwa-install-btn" onClick={onInstallClick}>
            Add to Home Screen
          </button>
        </div>
      )}

      {!standalone && !deferredInstall && isIosSafari() && (
        <div className="member-check__pwa-banner member-check__pwa-banner--ios" role="status">
          <p className="member-check__pwa-banner-title">
            To save this: tap the Share button in Safari, then tap &quot;Add to Home Screen&quot;
          </p>
        </div>
      )}

      {showTip && (
        <div className="member-check__pwa-tip" role="note">
          <p>
            <strong>Tip:</strong> Save this page to your home screen so you can always check suspicious messages
            quickly.
          </p>
        </div>
      )}
    </>
  )
}

export default function MemberCheckPage() {
  const notifyLineRef = useRef<HTMLParagraphElement>(null)

  const [searchParams] = useSearchParams()
  const token = useMemo(() => {
    const t = searchParams.get('token')?.trim()
    return t || null
  }, [searchParams])
  const [loadingContext, setLoadingContext] = useState(true)
  const [contextError, setContextError] = useState(false)
  const [needsConnection, setNeedsConnection] = useState(false)
  const [ctx, setCtx] = useState<MemberContext | null>(null)

  const [deferredInstall, setDeferredInstall] = useState<BeforeInstallPromptEvent | null>(null)
  const [hasUsedOnce, setHasUsedOnce] = useState(false)

  const [mode, setMode] = useState<'pick' | 'link' | 'document' | null>('pick')
  const [linkInput, setLinkInput] = useState('')
  const [filePreview, setFilePreview] = useState<string | null>(null)
  const [fileMime, setFileMime] = useState<string>('')
  const [filePayload, setFilePayload] = useState<string | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [checkError, setCheckError] = useState<string | null>(null)

  const guardianName = ctx?.guardianName ?? 'your family member'

  useEffect(() => {
    const onBip = (e: Event) => {
      e.preventDefault()
      setDeferredInstall(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onBip)
    return () => window.removeEventListener('beforeinstallprompt', onBip)
  }, [])

  useEffect(() => {
    if (!token) return
    const key = `docrisk-member-used-${token}`
    if (localStorage.getItem(key)) setHasUsedOnce(true)
  }, [token])

  useEffect(() => {
    if (!token) {
      setLoadingContext(false)
      setContextError(true)
      return
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setLoadingContext(false)
      setNeedsConnection(true)
      setContextError(false)
      setCtx(null)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const resolved = await resolveMemberContext(token)
        if (cancelled) return
        if (!resolved) {
          setContextError(true)
          setCtx(null)
        } else {
          setCtx(resolved)
          setContextError(false)
        }
      } catch {
        if (!cancelled) {
          setContextError(true)
          setCtx(null)
        }
      } finally {
        if (!cancelled) setLoadingContext(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token])

  useEffect(() => {
    return () => {
      if (filePreview?.startsWith('blob:')) {
        URL.revokeObjectURL(filePreview)
      }
    }
  }, [filePreview])

  const resetFlow = useCallback(() => {
    setMode('pick')
    setLinkInput('')
    setFilePreview(null)
    setFileMime('')
    setFilePayload(null)
    setResult(null)
    setCheckError(null)
  }, [])

  const runCheck = useCallback(
    async (type: 'link' | 'document', input: string, mimeType: string | null) => {
      if (!token) return
      setSubmitting(true)
      setCheckError(null)
      setResult(null)
      try {
        const base = getApiBase()
        const res = await fetch(`${base}/api/guardian/check`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            memberToken: token,
            type,
            input,
            mimeType: mimeType ?? null,
          }),
        })
        const data = (await res.json()) as {
          success?: boolean
          result?: AnalysisResult
          guardianName?: string
          guardianPhone?: string | null
        }
        const nameForError =
          typeof data.guardianName === 'string' && data.guardianName.trim()
            ? data.guardianName.trim()
            : guardianName
        if (!res.ok || !data.success || !data.result) {
          setCheckError(`Something went wrong. Ask ${nameForError} to check for you.`)
          return
        }
        setCtx((c) => {
          if (!c) return c
          const g =
            typeof data.guardianName === 'string' && data.guardianName.trim()
              ? data.guardianName.trim()
              : c.guardianName
          let nextPhone = c.guardianPhone
          if (data.guardianPhone !== undefined) {
            const raw = data.guardianPhone
            nextPhone =
              typeof raw === 'string' && raw.trim()
                ? raw.trim()
                : null
          }
          return { ...c, guardianName: g, guardianPhone: nextPhone }
        })
        setResult(data.result)
        setMode(null)
      } catch {
        setCheckError(`Something went wrong. Ask ${guardianName} to check for you.`)
      } finally {
        setSubmitting(false)
      }
    },
    [token, guardianName],
  )

  const onSubmitLink = (e: React.FormEvent) => {
    e.preventDefault()
    const url = linkInput.trim()
    if (!url) return
    void runCheck('link', url, null)
  }

  const onSubmitDocument = (e: React.FormEvent) => {
    e.preventDefault()
    if (!filePayload || !fileMime) return
    void runCheck('document', filePayload, fileMime)
  }

  const onPickFile = async (fileList: FileList | null) => {
    const file = fileList?.[0]
    if (!file) return
    setFilePreview((prev) => {
      if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev)
      return null
    })
    setFilePayload(null)
    const mime = file.type || 'image/jpeg'
    setFileMime(mime)
    try {
      const b64 = await fileToBase64(file)
      setFilePayload(b64)
      if (mime.startsWith('image/')) {
        setFilePreview(URL.createObjectURL(file))
      } else {
        setFilePreview(null)
      }
    } catch {
      setCheckError(`Something went wrong. Ask ${guardianName} to check for you.`)
    }
  }

  if (!token) {
    return (
      <div className="member-check">
        <p className="member-check__invalid">
          Invalid link. Ask your family member to share the correct link.
        </p>
      </div>
    )
  }

  if (loadingContext) {
    return (
      <div className="member-check member-check--center">
        <div className="member-check__spinner" aria-hidden />
        <p className="member-check__loading-text">One moment…</p>
      </div>
    )
  }

  if (contextError || !ctx) {
    return (
      <div className="member-check">
        <p className="member-check__invalid">
          Invalid link. Ask your family member to share the correct link.
        </p>
      </div>
    )
  }

  if (submitting) {
    return (
      <div className="member-check member-check--center member-check--loading">
        <div className="member-check__spinner member-check__spinner--large" aria-hidden />
        <p className="member-check__loading-title">Checking… please wait</p>
      </div>
    )
  }

  if (result) {
    const tier = tierRisk(result.risk_level)
    const phone = ctx.guardianPhone
    const callHref = phone ? telHref(phone) : '#'
    const canCall = phone && callHref !== '#'

    return (
      <div
        className={`member-check member-check--result-view${tier === 'high' ? ' member-check--result-view-high' : ''}`}
      >
        <MemberResult
          riskLevel={tier}
          summary={result.summary}
          recommendedAction={result.recommended_action}
          redFlags={result.red_flags}
          onGuardianReminderPress={() =>
            notifyLineRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }
        />

        <p ref={notifyLineRef} className="member-check__notify-footer" tabIndex={-1}>
          Your guardian <strong>{guardianName}</strong> has been automatically notified of this check.
        </p>

        {canCall && (
          <a
            href={callHref}
            className={tier === 'high' ? 'member-check__call-tel member-check__call-tel--prominent' : 'member-check__call-tel'}
          >
            Call my guardian
          </a>
        )}

        <button
          type="button"
          className="member-check__big-btn member-check__big-btn--neutral member-check__again-btn"
          onClick={resetFlow}
        >
          Check another one
        </button>
      </div>
    )
  }

  return (
    <div className="member-check">
      <header className="member-check__header">
        <div className="member-check__brand">
          <ShieldCheck className="member-check__logo" aria-hidden />
          <span>DocRisk Safety Check</span>
        </div>
        <p className="member-check__hello">Hello, {ctx.memberName}</p>
      </header>

      <p className="member-check__intro">
        Received something suspicious? Check it here before clicking or signing.
      </p>

      {checkError && (
        <div className="member-check__error" role="alert">
          {checkError}
        </div>
      )}

      {mode === 'pick' && (
        <div className="member-check__actions">
          <button
            type="button"
            className="member-check__choice member-check__choice--blue"
            onClick={() => {
              setMode('link')
              setCheckError(null)
            }}
          >
            <IconLink className="member-check__choice-icon" size={32} stroke={1.75} aria-hidden />
            <span className="member-check__choice-title">Check a suspicious LINK</span>
            <span className="member-check__choice-sub">Got a text or WhatsApp with a link? Paste it here.</span>
          </button>

          <button
            type="button"
            className="member-check__choice member-check__choice--teal"
            onClick={() => {
              setMode('document')
              setCheckError(null)
            }}
          >
            <IconCamera className="member-check__choice-icon" size={32} stroke={1.75} aria-hidden />
            <span className="member-check__choice-title">Check a suspicious DOCUMENT</span>
            <span className="member-check__choice-sub">
              Got a letter, contract, or job offer? Take a photo.
            </span>
          </button>
        </div>
      )}

      {mode === 'link' && (
        <form className="member-check__form" onSubmit={onSubmitLink}>
          <label className="member-check__label" htmlFor="suspicious-url">
            Paste the link
          </label>
          <input
            id="suspicious-url"
            className="member-check__input"
            value={linkInput}
            onChange={(e) => setLinkInput(e.target.value)}
            placeholder="Paste the link here..."
            inputMode="url"
            autoComplete="off"
          />
          <button type="submit" className="member-check__big-btn member-check__big-btn--primary">
            Check it now
          </button>
          <button type="button" className="member-check__back" onClick={() => setMode('pick')}>
            Back
          </button>
        </form>
      )}

      {mode === 'document' && (
        <form className="member-check__form" onSubmit={onSubmitDocument}>
          <label className="member-check__label" htmlFor="doc-camera">
            Photo of the document
          </label>
          <input
            id="doc-camera"
            type="file"
            accept="image/jpeg,image/png,image/jpg,image/webp,application/pdf"
            capture="environment"
            className="member-check__file"
            onChange={(e) => void onPickFile(e.target.files)}
          />
          <p className="member-check__hint">Choose a clear photo or a PDF file.</p>

          {filePreview && (
            <div className="member-check__preview-wrap">
              <img src={filePreview} alt="Preview of your document" className="member-check__preview" />
            </div>
          )}

          {filePayload && !filePreview && fileMime === 'application/pdf' && (
            <p className="member-check__pdf-note">PDF selected. Tap “Check it now” when ready.</p>
          )}

          <button
            type="submit"
            className="member-check__big-btn member-check__big-btn--primary"
            disabled={!filePayload}
          >
            Check it now
          </button>
          <button type="button" className="member-check__back" onClick={() => setMode('pick')}>
            Back
          </button>
        </form>
      )}
    </div>
  )
}
