import type React from 'react'
import { AlertTriangle, ChevronRight, MessageCircle } from 'lucide-react'
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
        <button className="scam-card__cta" onClick={() => onReadMore(scam)}>
          <MessageCircle size={13} />
          Read More &amp; Chat
          <ChevronRight size={13} />
        </button>
      </div>
    </div>
  )
}
