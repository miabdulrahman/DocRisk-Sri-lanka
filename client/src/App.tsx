import { useCallback, useEffect, useRef, useState } from 'react'
import { FirebaseError } from 'firebase/app'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth'
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  FileText,
  Lightbulb,
  LogOut,
  Mail,
  Shield,
  ShieldAlert,
  Upload,
  X,
} from 'lucide-react'
import { auth } from './lib/firebase'
import { saveAnalysisToFirestore } from './lib/saveAnalysis'
import type { AnalysisResult, AnalyzeApiResponse, RiskLevel } from './types'
import './App.css'

const API_URL =
  import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/analyze'
const MAX_BYTES = 10 * 1024 * 1024
const ACCEPTED_EXT = ['.pdf', '.jpg', '.jpeg', '.png'] as const

function mapAuthError(code: string): string {
  switch (code) {
    case 'auth/invalid-email':
      return 'Invalid email address.'
    case 'auth/user-disabled':
      return 'This account has been disabled.'
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect email or password.'
    case 'auth/email-already-in-use':
      return 'An account with this email already exists.'
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.'
    case 'auth/operation-not-allowed':
      return 'Email/password sign-in is not enabled in Firebase Console.'
    default:
      return 'Authentication failed. Please try again.'
  }
}

function parseAuthError(err: unknown): { code: string; message: string; friendly: string } {
  if (err instanceof FirebaseError) {
    return {
      code: err.code,
      message: err.message,
      friendly: mapAuthError(err.code),
    }
  }
  const code =
    err && typeof err === 'object' && 'code' in err && typeof err.code === 'string'
      ? err.code
      : 'unknown'
  const message =
    err instanceof Error
      ? err.message
      : err && typeof err === 'object' && 'message' in err && typeof err.message === 'string'
        ? err.message
        : String(err)
  return { code, message, friendly: mapAuthError(code) }
}

function getRiskColor(level: RiskLevel): string {
  switch (level) {
    case 'low':
      return '#22c55e'
    case 'medium':
      return '#f59e0b'
    case 'high':
      return '#ef4444'
    default:
      return '#71717a'
  }
}

function formatDocType(type: string): string {
  return type.replace(/_/g, ' ')
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function isAcceptedFile(file: File): boolean {
  const name = file.name.toLowerCase()
  return ACCEPTED_EXT.some((ext) => name.endsWith(ext))
}

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser)
      setAuthLoading(false)
    })
    return unsubscribe
  }, [])

  if (authLoading) {
    return (
      <div className="shell shell--centered">
        <div className="loading-panel">
          <div className="loading-spinner" />
          <p className="loading-text">Loading…</p>
        </div>
      </div>
    )
  }

  if (!user) return <AuthForm />

  return <Dashboard user={user} />
}

function AuthForm() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState<{
    code: string
    message: string
    friendly: string
  } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthError(null)
    setSubmitting(true)
    try {
      if (mode === 'signin') {
        await signInWithEmailAndPassword(auth, email.trim(), password)
      } else {
        await createUserWithEmailAndPassword(auth, email.trim(), password)
      }
    } catch (err: unknown) {
      setAuthError(parseAuthError(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="shell shell--centered">
      <div className="auth-box">
        <div className="auth-box__icon">
          <Shield size={28} strokeWidth={1.5} />
        </div>
        <h1>DocRisk Sri Lanka</h1>
        <p className="auth-box__subtitle">
          {mode === 'signin'
            ? 'Sign in to analyze documents for fraud.'
            : 'Create an account to get started.'}
        </p>

        <form className="auth-form" onSubmit={onSubmit}>
          <label className="auth-field">
            <span>Email</span>
            <div className="auth-input-wrap">
              <Mail size={18} />
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
          </label>

          <label className="auth-field">
            <span>Password</span>
            <input
              type="password"
              className="auth-input"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
            />
          </label>

          {authError && (
            <div className="auth-error-banner" role="alert">
              <p className="auth-error-banner__title">{authError.friendly}</p>
              <p className="auth-error-banner__detail">
                <strong>Code:</strong> {authError.code}
              </p>
              <p className="auth-error-banner__detail">
                <strong>Message:</strong> {authError.message}
              </p>
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary auth-submit"
            disabled={submitting}
          >
            {submitting ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Sign up'}
          </button>
        </form>

        <p className="auth-toggle">
          {mode === 'signin' ? (
            <>
              Don&apos;t have an account?{' '}
              <button
                type="button"
                className="auth-link"
                onClick={() => {
                  setAuthError(null)
                  setMode('signup')
                }}
              >
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                type="button"
                className="auth-link"
                onClick={() => {
                  setAuthError(null)
                  setMode('signin')
                }}
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  )
}

function Dashboard({ user }: { user: User }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [explanationOpen, setExplanationOpen] = useState(false)

  useEffect(() => {
    if (!file || !file.type.startsWith('image/')) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const validateAndSetFile = useCallback((next: File) => {
    setFileError(null)
    setError(null)
    setResult(null)
    if (!isAcceptedFile(next)) {
      setFileError('Please upload a PDF, JPG, JPEG, or PNG file.')
      return
    }
    if (next.size > MAX_BYTES) {
      setFileError('File must be 10 MB or smaller.')
      return
    }
    setFile(next)
  }, [])

  const clearFile = () => {
    setFile(null)
    setFileError(null)
    setError(null)
    setResult(null)
    setExplanationOpen(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) validateAndSetFile(dropped)
  }

  const onAnalyze = async () => {
    if (!file || loading) return

    setLoading(true)
    setError(null)
    setResult(null)
    setExplanationOpen(false)

    const formData = new FormData()
    formData.append('document', file)

    try {
      const token = await user.getIdToken()
      const res = await fetch(API_URL, {
        method: 'POST',
        body: formData,
        headers: { Authorization: `Bearer ${token}` },
      })
      const data: AnalyzeApiResponse = await res.json()

      if (!res.ok || !data.success || !data.result) {
        throw new Error(data.error ?? 'Analysis failed. Please try again.')
      }

      setResult(data.result)
      await saveAnalysisToFirestore(user.uid, file.name, data.result).catch(
        (saveErr) => console.warn('Could not save to Firestore:', saveErr)
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  const isImage = file?.type.startsWith('image/')
  const riskColor = result ? getRiskColor(result.risk_level) : '#71717a'
  const circumference = 2 * Math.PI * 36
  const ringOffset = result
    ? circumference - (result.risk_score / 100) * circumference
    : circumference

  return (
    <div className="shell">
      <header className="dash-header">
        <div className="dash-header__brand">
          <Shield size={22} className="dash-header__logo" />
          <span>DocRisk Sri Lanka</span>
        </div>
        <div className="dash-header__actions">
          <span className="dash-header__user" title={user.email ?? undefined}>
            {user.email}
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-logout"
            onClick={() => signOut(auth)}
          >
            <LogOut size={16} />
            Log out
          </button>
        </div>
      </header>

      <p className="dash-tagline">
        Upload a document to detect fraud signals in job offers, deeds, visas, and
        other official paperwork.
      </p>

      {!file && !loading && (
        <div
          className={`dropzone${dragOver ? ' drag-over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
          }}
          role="button"
          tabIndex={0}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={(e) => {
              const selected = e.target.files?.[0]
              if (selected) validateAndSetFile(selected)
            }}
          />
          <Upload className="dropzone-icon" size={36} strokeWidth={1.5} />
          <p className="dropzone-title">Drag & drop your document here</p>
          <p className="dropzone-hint">PDF, JPG, or PNG — max 10 MB</p>
          {fileError && <p className="file-error">{fileError}</p>}
        </div>
      )}

      {file && !loading && !result && (
        <div className="preview-card">
          <div className="preview-thumb">
            {isImage && previewUrl ? (
              <img src={previewUrl} alt="Document preview" />
            ) : (
              <FileText size={48} strokeWidth={1.25} />
            )}
          </div>
          <div className="preview-meta">
            <p className="preview-name">{file.name}</p>
            <p className="preview-size">{formatBytes(file.size)}</p>
            <div className="preview-actions">
              <button type="button" className="btn btn-primary" onClick={onAnalyze}>
                <ShieldAlert size={18} />
                Analyze Document
              </button>
              <button type="button" className="btn btn-ghost" onClick={clearFile}>
                <X size={18} />
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="loading-panel">
          <div className="loading-spinner" />
          <p className="loading-text">Analyzing...</p>
        </div>
      )}

      {error && <div className="api-error">{error}</div>}

      {result && (
        <section className="results" aria-live="polite">
          <div className="results-header">
            <span className="badge">{formatDocType(result.document_type)}</span>
            <span
              className="risk-label"
              style={{
                color: riskColor,
                background: `${riskColor}18`,
                border: `1px solid ${riskColor}55`,
              }}
            >
              {result.risk_level} risk
            </span>
          </div>

          <div className="risk-score-block">
            <div
              className="risk-ring"
              aria-label={`Risk score ${result.risk_score} out of 100`}
            >
              <svg width="88" height="88" viewBox="0 0 88 88">
                <circle cx="44" cy="44" r="36" fill="none" stroke="var(--border)" strokeWidth="8" />
                <circle
                  cx="44"
                  cy="44"
                  r="36"
                  fill="none"
                  stroke={riskColor}
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={ringOffset}
                />
              </svg>
              <span className="risk-ring-value">{result.risk_score}</span>
            </div>
            <div className="risk-bar-wrap">
              <div className="risk-bar-label">
                <span>Risk score</span>
                <span>{result.risk_score} / 100</span>
              </div>
              <div className="risk-bar-track">
                <div
                  className="risk-bar-fill"
                  style={{ width: `${result.risk_score}%`, background: riskColor }}
                />
              </div>
            </div>
          </div>

          <div>
            <h2 className="section-title">Summary</h2>
            <p className="summary-box">{result.summary}</p>
          </div>

          <div>
            <h2 className="section-title">Red flags</h2>
            {result.red_flags.length > 0 ? (
              <ul className="flag-list">
                {result.red_flags.map((flag, i) => (
                  <li key={`${flag}-${i}`}>
                    <AlertTriangle size={18} />
                    <span>{flag}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="flag-empty">No red flags detected.</p>
            )}
          </div>

          <div>
            <button
              type="button"
              className="explanation-toggle"
              onClick={() => setExplanationOpen((o) => !o)}
              aria-expanded={explanationOpen}
            >
              <span>Detailed explanation</span>
              {explanationOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </button>
            {explanationOpen && (
              <div className="explanation-body">{result.explanation}</div>
            )}
          </div>

          <div>
            <h2 className="section-title">Recommended action</h2>
            <div className="action-box">
              <Lightbulb size={20} />
              <p>{result.recommended_action}</p>
            </div>
          </div>

          <button type="button" className="btn btn-ghost" onClick={clearFile}>
            Analyze another document
          </button>
        </section>
      )}
    </div>
  )
}
