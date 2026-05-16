import { useCallback, useEffect, useRef, useState } from 'react'
import type { User } from 'firebase/auth'
import { FileText, ScanSearch, ShieldCheck, Upload, X, Zap } from 'lucide-react'
import { analyzeDocument } from '../api'
import { saveAnalysisToFirestore } from '../lib/saveAnalysis'
import type { AnalysisResult, OutputLang } from '../types'

const MAX_BYTES = 10 * 1024 * 1024

type FileCategory = '' | 'pdf' | 'image' | 'docx'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
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
  const [selectedCategory, setSelectedCategory] = useState<FileCategory>('')
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

  const validateAndSetFile = useCallback((next: File, category: FileCategory) => {
    setFileError(null)
    setError(null)
    
    if (!category) {
      setFileError('Please select a document type first.')
      return
    }

    const name = next.name.toLowerCase()
    let isValid = false
    
    if (category === 'pdf' && name.endsWith('.pdf')) isValid = true
    else if (category === 'image' && (name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png'))) isValid = true
    else if (category === 'docx' && name.endsWith('.docx')) isValid = true

    if (!isValid) {
      const typeName = category === 'pdf' ? 'PDF' : category === 'image' ? 'Image (JPG/PNG)' : 'Word Document (DOCX)'
      setFileError(`Please upload a valid ${typeName} file.`)
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
    if (!selectedCategory) {
      setFileError('Please select a document type first.')
      return
    }
    const dropped = e.dataTransfer.files[0]
    if (dropped) validateAndSetFile(dropped, selectedCategory)
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

  const getAcceptString = () => {
    if (selectedCategory === 'pdf') return '.pdf'
    if (selectedCategory === 'image') return '.jpg,.jpeg,.png'
    if (selectedCategory === 'docx') return '.docx'
    return ''
  }

  return (
    <>
      {!file && (
        <div className="analyze-hero-spline">
          <div className="analyze-hero-spline__grid">
            <div className="analyze-hero-spline__intro">
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
                    { icon: <FileText size={13} />, label: 'PDF · JPG · PNG · DOCX' },
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
            </div>
            <aside className="analyze-hero-spline__aside" aria-hidden>
              <div className="analyze-hero-spline__sticky">
                <div className="analyze-hero-spline__beam" />
                <div className="analyze-hero-spline__orbit" />
                <div className="analyze-hero-spline__orbit analyze-hero-spline__orbit--inner" />
                <div className="analyze-hero-spline__plinth" />
                <img
                  className="analyze-hero-spline__art"
                  src={`${import.meta.env.BASE_URL}hero-scam-guard.svg`}
                  alt=""
                  width={520}
                  height={620}
                  decoding="async"
                />
              </div>
            </aside>
          </div>
        </div>
      )}

      {!file && (
        <div style={{ marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
          <label htmlFor="file-type" style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>
            1. Select Document Type
          </label>
          <select 
            id="file-type" 
            value={selectedCategory} 
            onChange={(e) => {
              setSelectedCategory(e.target.value as FileCategory)
              setFileError(null)
            }}
            style={{ 
              padding: '0.75rem 1rem', 
              borderRadius: '8px', 
              border: '1px solid var(--border)',
              backgroundColor: 'var(--surface)',
              color: 'var(--text)',
              fontSize: '1rem',
              width: '100%',
              maxWidth: '300px',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="" disabled>-- Choose Type --</option>
            <option value="pdf">PDF Document (.pdf)</option>
            <option value="image">Image (.jpg, .png)</option>
            <option value="docx">Word Document (.docx)</option>
          </select>
        </div>
      )}

      {!file && (
        <div
          className={`dropzone${dragOver ? ' drag-over' : ''}${!selectedCategory ? ' disabled' : ''}`}
          style={{ 
            opacity: !selectedCategory ? 0.5 : 1, 
            cursor: !selectedCategory ? 'not-allowed' : 'pointer' 
          }}
          onDragOver={(e) => {
            e.preventDefault()
            if (selectedCategory) setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => {
            if (!selectedCategory) {
              setFileError('Please select a document type first.')
              return
            }
            inputRef.current?.click()
          }}
          onKeyDown={(e) => {
            if (!selectedCategory) return
            if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
          }}
          role="button"
          tabIndex={selectedCategory ? 0 : -1}
        >
          <input
            ref={inputRef}
            type="file"
            accept={getAcceptString()}
            disabled={!selectedCategory}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) validateAndSetFile(f, selectedCategory)
            }}
          />
          <div className="dropzone-icon-wrap">
            <Upload size={28} strokeWidth={1.5} className="dropzone-icon" />
          </div>
          <p className="dropzone-title">
            {!selectedCategory ? '2. Select a type above to upload' : '2. Drag & drop your document here'}
          </p>
          <p className="dropzone-hint">
            {selectedCategory === 'pdf' && 'PDF — max 10 MB'}
            {selectedCategory === 'image' && 'JPG or PNG — max 10 MB'}
            {selectedCategory === 'docx' && 'DOCX — max 10 MB'}
            {!selectedCategory && 'PDF, JPG, PNG, or DOCX — max 10 MB'}
          </p>
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
