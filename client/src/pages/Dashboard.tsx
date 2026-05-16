import { useCallback, useEffect, useRef, useState } from 'react'
import type { User } from 'firebase/auth'
import { FileText, ScanSearch, ShieldCheck, Upload, X, Zap } from 'lucide-react'
import { analyzeDocument } from '../api'
import { saveAnalysisToFirestore } from '../lib/saveAnalysis'
import type { AnalysisResult, OutputLang } from '../types'

const MAX_BYTES = 10 * 1024 * 1024
const ACCEPTED_EXT = ['.pdf', '.jpg', '.jpeg', '.png'] as const

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function isAcceptedFile(file: File): boolean {
  const name = file.name.toLowerCase()
  return ACCEPTED_EXT.some((ext) => name.endsWith(ext))
}

export type AnalysisCompletePayload = {
  result: AnalysisResult
  file: File
  previewUrl: string | null
  outputLang: OutputLang
}

type DashboardProps = {
  user: User
  outputLang: OutputLang
  onResult: (payload: AnalysisCompletePayload) => void
  onAnalyzingChange?: (analyzing: boolean) => void
}

export function Dashboard({ user, outputLang, onResult, onAnalyzingChange }: DashboardProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isLoading = loading

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
    if (inputRef.current) inputRef.current.value = ''
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) validateAndSetFile(dropped)
  }

  const onAnalyze = async () => {
    if (!file || isLoading) return
    setLoading(true)
    onAnalyzingChange?.(true)
    setError(null)

    try {
      const token = await user.getIdToken()
      const data = await analyzeDocument(file, token, outputLang)

      if (!data.success || !data.result) {
        throw new Error(data.error ?? 'Analysis failed. Please try again.')
      }

      await saveAnalysisToFirestore(user.uid, file.name, data.result).catch(
        (saveErr) => console.warn('Could not save to Firestore:', saveErr),
      )

      onResult({
        result: data.result,
        file,
        previewUrl,
        outputLang,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setLoading(false)
      onAnalyzingChange?.(false)
    }
  }

  return (
    <>
      {!file && (
        <div className="hero">
          <div className="hero-eyebrow">
            <span className="hero-dot" />
            Powered by Gemini 2.5 Flash
          </div>
          <h1 className="hero-heading">
            Detect Document<br />
            <span className="hero-gradient">Fraud Instantly</span>
          </h1>
          <p className="hero-sub">
            Upload any Sri Lankan document — job offers, land deeds, visa letters, or
            certificates — and get an AI-powered fraud risk assessment in seconds.
          </p>
          <div className="hero-chips">
            {[
              { icon: <Zap size={13} />, label: 'Gemini 2.5' },
              { icon: <ShieldCheck size={13} />, label: 'Sri Lanka Docs' },
              { icon: <FileText size={13} />, label: 'PDF · JPG · PNG' },
              { icon: <Upload size={13} />, label: 'Max 10 MB' },
            ].map((chip, i) => (
              <span
                key={chip.label}
                className="hero-chip"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                {chip.icon}
                {chip.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {!file && (
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
              const f = e.target.files?.[0]
              if (f) validateAndSetFile(f)
            }}
          />
          <div className="dropzone-icon-wrap">
            <Upload size={28} strokeWidth={1.5} className="dropzone-icon" />
          </div>
          <p className="dropzone-title">Drag &amp; drop your document here</p>
          <p className="dropzone-hint">PDF, JPG, or PNG — max 10 MB</p>
          {fileError && <p className="file-error">{fileError}</p>}
        </div>
      )}

      {file && (
        <div className="preview-card">
          <div className="preview-thumb">
            {file.type.startsWith('image/') && previewUrl ? (
              <img src={previewUrl} alt="Document preview" />
            ) : (
              <FileText size={48} strokeWidth={1.25} />
            )}
          </div>
          <div className="preview-meta">
            <p className="preview-name">{file.name}</p>
            <p className="preview-size">{formatBytes(file.size)}</p>
            {error && <div className="api-error">{error}</div>}
            <div className="preview-actions">
              <button className="btn btn-primary" onClick={onAnalyze} disabled={isLoading}>
                <ScanSearch size={16} />
                Analyze Document
              </button>
              <button className="btn btn-ghost" onClick={clearFile}>
                <X size={16} />
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {error && !file && <div className="api-error">{error}</div>}
    </>
  )
}
