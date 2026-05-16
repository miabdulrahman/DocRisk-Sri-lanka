import { useState } from 'react'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardCopy,
  IdCard,
  RotateCcw,
  ScanSearch,
  ShieldCheck,
  FileText,
} from 'lucide-react'
import { ResultConfidence, ResultMetaBadges } from './ResultCard'
import type { AnalysisResult, ExtractedData, OutputLang, RiskLevel, TamperBox } from '../types'

function parseFlag(flag: string): { lead: string; detail: string | null } {
  const match = flag.match(/^(.+?)\s*\((.+)\)\s*$/)
  if (match) return { lead: match[1], detail: match[2] }
  return { lead: flag, detail: null }
}

function getRiskColor(level: RiskLevel): string {
  switch (level) {
    case 'low':
      return 'var(--risk-low)'
    case 'medium':
      return 'var(--risk-medium)'
    case 'high':
      return 'var(--risk-high)'
    default:
      return 'var(--text-muted)'
  }
}

function HalfCircleGauge({ score, level }: { score: number; level: RiskLevel }) {
  const R = 80
  const CX = 100
  const CY = 100
  const clamped = Math.min(100, Math.max(0, score))
  const angle = Math.PI * (1 - clamped / 100)
  const ex = CX + R * Math.cos(angle)
  const ey = CY - R * Math.sin(angle)
  const largeArc = clamped > 50 ? 1 : 0
  const fillPath =
    clamped === 0
      ? ''
      : `M ${CX - R} ${CY} A ${R} ${R} 0 ${largeArc} 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`
  const riskColor = level === 'low' ? '#86efac' : level === 'medium' ? '#fbbf24' : '#ef4444'
  const pointerDeg = -180 + clamped * 1.8

  return (
    <div className="gauge-wrap">
      <svg viewBox="0 0 200 110" className="gauge-svg" aria-label={`Risk score ${score} out of 100`}>
        <defs>
          <linearGradient id="gauge-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#86efac" />
            <stop offset="50%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#ef4444" />
          </linearGradient>
          <filter id="gauge-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <path
          d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`}
          fill="none"
          stroke="url(#gauge-grad)"
          strokeWidth="10"
          strokeLinecap="round"
          opacity="0.2"
        />
        {fillPath && (
          <path
            d={fillPath}
            fill="none"
            stroke={riskColor}
            strokeWidth="10"
            strokeLinecap="round"
            filter="url(#gauge-glow)"
          />
        )}
        <g style={{ transformOrigin: `${CX}px ${CY}px`, transform: `rotate(${pointerDeg}deg)` }}>
          <polygon
            points={`${CX + R - 16},${CY} ${CX + R + 2},${CY - 5} ${CX + R + 2},${CY + 5}`}
            fill={riskColor}
          />
        </g>
        <text
          x={CX}
          y={CY - 6}
          textAnchor="middle"
          fill={riskColor}
          fontSize="28"
          fontWeight="800"
          fontFamily="Plus Jakarta Sans, Inter, sans-serif"
        >
          {(score / 10).toFixed(1)}
        </text>
        <text
          x={CX}
          y={CY + 14}
          textAnchor="middle"
          fill="var(--text-muted)"
          fontSize="11"
          fontWeight="500"
          fontFamily="Plus Jakarta Sans, Inter, sans-serif"
        >
          / 10
        </text>
      </svg>
    </div>
  )
}

function tamperBoxToStyle(box: TamperBox['box_2d']): React.CSSProperties {
  const [ymin, xmin, ymax, xmax] = box
  const top = (ymin / 1000) * 100
  const left = (xmin / 1000) * 100
  const height = ((ymax - ymin) / 1000) * 100
  const width = ((xmax - xmin) / 1000) * 100
  return {
    top: `${top}%`,
    left: `${left}%`,
    width: `${width}%`,
    height: `${height}%`,
  }
}

function DocPreviewWithTamper({
  file,
  previewUrl,
  tamperBoxes,
}: {
  file: File
  previewUrl: string | null
  tamperBoxes?: TamperBox[]
}) {
  const isImage = file.type.startsWith('image/') && previewUrl
  const boxes = tamperBoxes ?? []

  if (!isImage) {
    return (
      <div className="doc-preview">
        <FileText size={40} strokeWidth={1.25} />
      </div>
    )
  }

  return (
    <div className={`doc-preview doc-preview--with-overlay${boxes.length ? ' doc-preview--has-tamper' : ''}`}>
      <img src={previewUrl ?? undefined} alt="Document preview" />
      {boxes.length > 0 && (
        <div className="tamper-overlay" aria-hidden={false} aria-label="Detected tampered regions">
          {boxes.map((box, i) => (
            <div
              key={`${box.field_name}-${i}`}
              className="tamper-box"
              style={{ ...tamperBoxToStyle(box.box_2d), animationDelay: `${i * 120}ms` }}
              tabIndex={0}
              role="button"
              aria-label={`${box.field_name}: ${box.reason}`}
            >
              <span className="tamper-box__label">{box.field_name}</span>
              <span className="tamper-box__tooltip" role="tooltip">
                <strong>{box.field_name}</strong>
                <span>{box.reason}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const EXTRACTED_FIELD_LABELS: Record<string, string> = {
  full_name: 'Full Name',
  document_id: 'Document / NIC Number',
  date_of_birth: 'Date of Birth',
  nic_kind: 'NIC Format',
  nic_birth_year: 'Decoded Birth Year',
  nic_gender: 'Decoded Gender',
}

const EXTRACTED_FIELD_ORDER = [
  'full_name',
  'document_id',
  'date_of_birth',
  'nic_kind',
  'nic_birth_year',
  'nic_gender',
]

function humanizeKey(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function CopyableField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      const tmp = document.createElement('textarea')
      tmp.value = value
      tmp.style.position = 'fixed'
      tmp.style.left = '-9999px'
      document.body.appendChild(tmp)
      tmp.select()
      try {
        document.execCommand('copy')
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1400)
      } catch {
        /* ignore */
      } finally {
        document.body.removeChild(tmp)
      }
    }
  }

  return (
    <div className="extracted-field">
      <label className="extracted-field__label">{label}</label>
      <div className="extracted-field__row">
        <input
          className="extracted-field__input"
          type="text"
          readOnly
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          aria-label={label}
        />
        <button
          type="button"
          className={`extracted-field__copy${copied ? ' extracted-field__copy--ok' : ''}`}
          onClick={onCopy}
          aria-label={`Copy ${label}`}
          title={`Copy ${label}`}
        >
          {copied ? <Check size={14} /> : <ClipboardCopy size={14} />}
          <span className="extracted-field__copy-text">{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
    </div>
  )
}

function ExtractedDataCard({ data }: { data: ExtractedData }) {
  const entries = Object.entries(data).filter(
    ([, v]) => typeof v === 'string' && v.trim().length > 0,
  ) as [string, string][]

  if (entries.length === 0) return null

  const ordered = [
    ...EXTRACTED_FIELD_ORDER.filter((k) => entries.some(([ek]) => ek === k)).map(
      (k) => entries.find(([ek]) => ek === k) as [string, string],
    ),
    ...entries.filter(([k]) => !EXTRACTED_FIELD_ORDER.includes(k)),
  ]

  return (
    <section className="result-card extracted-card" style={{ '--delay': '140ms' } as React.CSSProperties}>
      <div className="extracted-card__head">
        <span className="extracted-card__icon">
          <IdCard size={17} />
        </span>
        <div>
          <h3 className="extracted-card__title">Extracted Document Information</h3>
          <p className="extracted-card__sub">
            Auto-filled by Gemini OCR. Verify each field against the original before reuse.
          </p>
        </div>
      </div>
      <div className="extracted-card__grid">
        {ordered.map(([key, value]) => (
          <CopyableField key={key} label={EXTRACTED_FIELD_LABELS[key] ?? humanizeKey(key)} value={value} />
        ))}
      </div>
    </section>
  )
}

type DocumentAnalysisResultProps = {
  result: AnalysisResult
  file: File
  previewUrl: string | null
  outputLang: OutputLang
} & (
  | { mode: 'interactive'; onReset: () => void }
  | { mode: 'readonly'; fileLabel: string }
)

/** Same result layout as the main Analyze flow (`ResultDashboard`), usable from guardian views without local file uploads. */
export function DocumentAnalysisResult(props: DocumentAnalysisResultProps) {
  const { result, file, previewUrl, outputLang } = props
  const readonly = props.mode === 'readonly'
  const displayName = readonly ? props.fileLabel : file.name
  const [explanationOpen, setExplanationOpen] = useState(false)
  const riskColor = getRiskColor(result.risk_level)
  const isMediumPlus = result.risk_level !== 'low'
  const isHigh = result.risk_level === 'high'

  const pillClass =
    result.risk_level === 'low'
      ? 'risk-pill risk-pill--low'
      : result.risk_level === 'medium'
        ? 'risk-pill risk-pill--medium'
        : 'risk-pill risk-pill--high'

  return (
    <div className="result-dashboard">
      <div className="result-col result-col--left">
        <div className="result-card doc-card" style={{ '--delay': '0ms' } as React.CSSProperties}>
          <div className="doc-card-header">
            <div>
              <h2 className="doc-card-title">Document Risk Analysis</h2>
              <p className="doc-card-filename">{displayName}</p>
              <p className="doc-card-risk" style={{ color: riskColor }}>
                {result.risk_level} risk
              </p>
            </div>
            {!readonly && (
              <button className="btn btn-ghost btn-sm" onClick={props.onReset}>
                <RotateCcw size={14} />
                Analyze
              </button>
            )}
          </div>

          <div className="gauge-preview-row">
            <HalfCircleGauge score={result.risk_score} level={result.risk_level} />
            <DocPreviewWithTamper
              file={file}
              previewUrl={previewUrl}
              tamperBoxes={result.tamper_coordinates}
            />
          </div>

          {result.tamper_coordinates && result.tamper_coordinates.length > 0 && (
            <p className="tamper-summary" role="note">
              <AlertTriangle size={14} />
              {result.tamper_coordinates.length} suspected tampered{' '}
              {result.tamper_coordinates.length === 1 ? 'region' : 'regions'} highlighted on the preview —
              hover a box for the forensic reason.
            </p>
          )}

          <div className="risk-summary-grid">
            <div className="risk-cell risk-cell--badges">
              <span className="risk-cell__label">Document Type</span>
              <ResultMetaBadges documentType={result.document_type} outputLang={outputLang} />
            </div>
            <div className="risk-cell">
              <span className="risk-cell__label">Risk Level</span>
              <span className={pillClass}>{result.risk_level}</span>
            </div>
            <div className="risk-cell">
              <span className="risk-cell__label">Risk Score</span>
              <span className="risk-cell__value risk-cell__value--score" style={{ color: riskColor }}>
                {(result.risk_score / 10).toFixed(1)} <span className="risk-cell__unit">/ 10</span>
              </span>
            </div>
            <div className="risk-cell">
              <span className="risk-cell__label">Summary</span>
              <span className="risk-cell__value risk-cell__value--clamp">{result.summary}</span>
            </div>
          </div>

          <ResultConfidence result={result} />

          {result.red_flags.length > 0 && (
            <div className="red-flags">
              <h3 className="section-label">Key Red Flags</h3>
              <ul className="flag-list">
                {result.red_flags.map((flag, i) => {
                  const { lead, detail } = parseFlag(flag)
                  return (
                    <li
                      key={`flag-${i}`}
                      className="flag-item"
                      style={{
                        borderLeftColor: riskColor,
                        animationDelay: `${i * 70}ms`,
                      }}
                    >
                      <AlertTriangle size={15} style={{ color: riskColor }} />
                      <span>
                        <strong>{lead}</strong>
                        {detail && <span className="flag-detail"> ({detail})</span>}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>

        <div className="result-card" style={{ '--delay': '80ms' } as React.CSSProperties}>
          <button
            className="explanation-toggle"
            onClick={() => setExplanationOpen((o) => !o)}
            aria-expanded={explanationOpen}
          >
            <span>Detailed Explanation</span>
            {explanationOpen ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
          </button>
          {explanationOpen && <div className="explanation-body">{result.explanation}</div>}
        </div>

        {!readonly && (
          <button className="btn btn-ghost" onClick={props.onReset}>
            <RotateCcw size={15} />
            Analyze another document
          </button>
        )}
      </div>

      <div className="result-col result-col--right">
        <div className="result-card findings-card" style={{ '--delay': '50ms' } as React.CSSProperties}>
          <div className="findings-header">
            <div className="findings-icon-tile">
              <ScanSearch size={17} />
            </div>
            <div>
              <h3 className="findings-title">Analysis Findings</h3>
              <p className="findings-sub">Explanation &amp; action</p>
            </div>
          </div>
          {result.red_flags.length > 0 ? (
            <ul className="findings-list">
              {result.red_flags.map((flag, i) => {
                const { lead } = parseFlag(flag)
                return (
                  <li key={`finding-${i}`} className="findings-item">
                    <span className="findings-bullet" style={{ background: riskColor }} />
                    <span>
                      <strong>{lead}</strong>
                    </span>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="findings-empty">No significant anomalies detected.</p>
          )}
        </div>

        <div
          className={`result-card action-card${isMediumPlus ? ' action-card--danger' : ' action-card--safe'}`}
          style={{ '--delay': '110ms' } as React.CSSProperties}
        >
          <div className="action-header">
            {isMediumPlus ? <AlertTriangle size={19} /> : <ShieldCheck size={19} />}
            <h3 className="action-title">Recommended Action</h3>
          </div>
          <p className="action-body">{result.recommended_action}</p>
          <button
            type="button"
            className={`btn action-cta${isHigh ? ' btn-danger' : isMediumPlus ? ' btn-warning' : ' btn-safe'}`}
          >
            {isMediumPlus ? 'Flag for Manual Review' : 'Approve Document'}
          </button>
        </div>
      </div>

      {result.extracted_data && Object.keys(result.extracted_data).length > 0 && (
        <div className="result-extracted-row">
          <ExtractedDataCard data={result.extracted_data} />
        </div>
      )}
    </div>
  )
}

/** @deprecated import DocumentAnalysisResult instead */
export function ResultDashboard({
  result,
  file,
  previewUrl,
  outputLang,
  onReset,
}: {
  result: AnalysisResult
  file: File
  previewUrl: string | null
  outputLang: OutputLang
  onReset: () => void
}) {
  return (
    <DocumentAnalysisResult
      mode="interactive"
      result={result}
      file={file}
      previewUrl={previewUrl}
      outputLang={outputLang}
      onReset={onReset}
    />
  )
}
