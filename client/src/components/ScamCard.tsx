import type React from 'react'
import { AlertTriangle, ChevronRight, ExternalLink, MessageCircle } from 'lucide-react'
import type { ScamEntry } from '../utils/scamData'
import './ScamCard.css'

interface Props {
  scam: ScamEntry
  onReadMore: (scam: ScamEntry) => void
  index?: number
}

export function ScamCard({ scam, onReadMore, index = 0 }: Props) {
  const severityClass =
    scam.severity === 'High'
      ? 'risk-pill risk-pill--high'
      : scam.severity === 'Medium'
        ? 'risk-pill risk-pill--medium'
        : 'risk-pill risk-pill--low'

  return (
    <div className="scam-card" style={{ animationDelay: `${index * 80}ms` } as React.CSSProperties}>
      <div className="scam-card__top">
        <div className="scam-card__meta">
          <span className="scam-category-badge">{scam.category}</span>
          <span className="scam-source-badge">{scam.source}</span>
          <span className={severityClass}>{scam.severity}</span>
        </div>
        <AlertTriangle
          size={15}
          className={`scam-card__alert-icon scam-card__alert-icon--${scam.severity.toLowerCase()}`}
        />
      </div>
      <h3 className="scam-card__title">{scam.title}</h3>
      <p className="scam-card__desc">{scam.description}</p>
      <div className="scam-card__footer">
        <span className="scam-card__date">Updated {scam.lastUpdated}</span>
        <a
          className="scam-card__source-link"
          href={scam.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink size={12} />
          Official page
        </a>
        <button className="scam-card__cta" onClick={() => onReadMore(scam)}>
          <MessageCircle size={13} />
          Read More &amp; Chat
          <ChevronRight size={13} />
        </button>
      </div>
    </div>
  )
}
