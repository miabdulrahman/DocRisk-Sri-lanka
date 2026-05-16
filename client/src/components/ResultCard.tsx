import { AlertTriangle } from 'lucide-react'
import type { AnalysisResult, DocumentType, OutputLang } from '../types'
import './ResultCard.css'

const OUTPUT_LANG_LABELS: Record<OutputLang, string> = {
  english: 'English',
  sinhala: 'සිංහල',
  tamil: 'தமிழ்',
}

function formatDocType(type: DocumentType): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

type ResultMetaBadgesProps = {
  documentType: DocumentType
  outputLang: OutputLang
}

export function ResultMetaBadges({ documentType, outputLang }: ResultMetaBadgesProps) {
  return (
    <div className="result-meta-badges">
      <span className="doc-type-badge">{formatDocType(documentType)}</span>
      <span className="output-lang-badge">{OUTPUT_LANG_LABELS[outputLang]}</span>
    </div>
  )
}

type ConfidenceIndicatorProps = {
  confidence: number
}

export function ConfidenceIndicator({ confidence }: ConfidenceIndicatorProps) {
  if (confidence >= 80) {
    return (
      <span className="confidence-badge confidence-badge--high">High confidence</span>
    )
  }

  if (confidence >= 60) {
    return (
      <span className="confidence-badge confidence-badge--moderate">
        Moderate confidence — verify manually
      </span>
    )
  }

  return (
    <div className="confidence-warning" role="alert">
      <AlertTriangle size={22} className="confidence-warning__icon" aria-hidden />
      <p className="confidence-warning__text">
        AI confidence is low. Document may be unclear or partially visible. Please verify
        this result with a professional before making decisions.
      </p>
    </div>
  )
}

export function ResultConfidence({ result }: { result: AnalysisResult }) {
  return (
    <div className="result-confidence">
      <ConfidenceIndicator confidence={result.confidence} />
    </div>
  )
}

