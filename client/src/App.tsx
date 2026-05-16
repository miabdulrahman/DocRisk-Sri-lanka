import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  FileText,
  Lightbulb,
  ShieldAlert,
  Upload,
  X,
} from 'lucide-react'
import { AuthBar } from './components/AuthBar'
import { useAuth } from './contexts/AuthContext'
import { isFirebaseConfigured } from './lib/firebase'
import { saveAnalysisToFirestore } from './lib/saveAnalysis'
import type { AnalysisResult, AnalyzeApiResponse, RiskLevel } from './types'
import './App.css'

const API_URL =
  import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/analyze'
const MAX_BYTES = 10 * 1024 * 1024
const ACCEPTED_EXT = ['.pdf', '.jpg', '.jpeg', '.png'] as const

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

function App() {
  const { user, firebaseEnabled, getIdToken } = useAuth()
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

    if (firebaseEnabled && !user) {
      setError('Sign in with Google to analyze documents.')
      setLoading(false)
      return
    }

    const formData = new FormData()
    formData.append('document', file)

    try {
      const headers: HeadersInit = {}
      const token = await getIdToken()
      if (token) headers.Authorization = `Bearer ${token}`

      const res = await fetch(API_URL, { method: 'POST', body: formData, headers })
      const data: AnalyzeApiResponse = await res.json()

      if (!res.ok || !data.success || !data.result) {
        throw new Error(data.error ?? 'Analysis failed. Please try again.')
      }
      setResult(data.result)

      if (user && isFirebaseConfigured) {
        await saveAnalysisToFirestore(user.uid, file.name, data.result).catch(
          (saveErr) => console.warn('Could not save to Firestore:', saveErr)
        )
      }
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
    <div className="app">
      <header className="app-header">
        <AuthBar />
        <h1>DocRisk Sri Lanka</h1>
        <p>
          Upload a document to detect fraud signals in job offers, deeds, visas,
          and other official paperwork.
        </p>
        {firebaseEnabled && !user && (
          <p className="auth-hint">Sign in to analyze and save your results.</p>
        )}
      </header>

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
          <p className="dropzone-hint">
            or click to browse — PDF, JPG, PNG up to 10 MB
          </p>
          {fileError && <p className="file-error">{fileError}</p>}
        </div>
      )}

      {file && !loading && !result && (
        <PreviewCard
          file={file}
          isImage={!!isImage}
          previewUrl={previewUrl}
          onAnalyze={onAnalyze}
          onClear={clearFile}
        />
      )}

      {loading && (
        <div className="loading-panel">
          <div className="loading-spinner" />
          <p className="loading-text">Analyzing...</p>
        </div>
      )}

      {error && <div className="api-error">{error}</div>}

      {result && (
        <AnalysisResults
          result={result}
          riskColor={riskColor}
          circumference={circumference}
          ringOffset={ringOffset}
          explanationOpen={explanationOpen}
          onToggleExplanation={() => setExplanationOpen((o) => !o)}
          onReset={clearFile}
        />
      )}
    </div>
  )
}

function PreviewCard({
  file,
  isImage,
  previewUrl,
  onAnalyze,
  onClear,
}: {
  file: File
  isImage: boolean
  previewUrl: string | null
  onAnalyze: () => void
  onClear: () => void
}) {
  return (
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
          <button type="button" className="btn btn-ghost" onClick={onClear}>
            <X size={18} />
            Remove
          </button>
        </div>
      </div>
    </div>
  )
}

function AnalysisResults({
  result,
  riskColor,
  circumference,
  ringOffset,
  explanationOpen,
  onToggleExplanation,
  onReset,
}: {
  result: AnalysisResult
  riskColor: string
  circumference: number
  ringOffset: number
  explanationOpen: boolean
  onToggleExplanation: () => void
  onReset: () => void
}) {
  return (
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
            <circle
              cx="44"
              cy="44"
              r="36"
              fill="none"
              stroke="var(--border)"
              strokeWidth="8"
            />
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
              style={{
                width: `${result.risk_score}%`,
                background: riskColor,
              }}
            />
          </div>
        </div>
      </div>

      <SummarySection summary={result.summary} />

      <RedFlagsSection flags={result.red_flags} />

      <ExplanationSection
        open={explanationOpen}
        text={result.explanation}
        onToggle={onToggleExplanation}
      />

      <RecommendedActionSection text={result.recommended_action} />

      <button type="button" className="btn btn-ghost" onClick={onReset}>
        Analyze another document
      </button>
    </section>
  )
}

function SummarySection({ summary }: { summary: string }) {
  return (
    <div>
      <h2 className="section-title">Summary</h2>
      <p className="summary-box">{summary}</p>
    </div>
  )
}

function RedFlagsSection({ flags }: { flags: string[] }) {
  return (
    <div>
      <h2 className="section-title">Red flags</h2>
      {flags.length > 0 ? (
        <ul className="flag-list">
          {flags.map((flag, i) => (
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
  )
}

function ExplanationSection({
  open,
  text,
  onToggle,
}: {
  open: boolean
  text: string
  onToggle: () => void
}) {
  return (
    <div>
      <button
        type="button"
        className="explanation-toggle"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span>Detailed explanation</span>
        {open ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
      </button>
      {open && <div className="explanation-body">{text}</div>}
    </div>
  )
}

function RecommendedActionSection({ text }: { text: string }) {
  return (
    <div>
      <h2 className="section-title">Recommended action</h2>
      <div className="action-box">
        <Lightbulb size={20} />
        <p>{text}</p>
      </div>
    </div>
  )
}

export default App
