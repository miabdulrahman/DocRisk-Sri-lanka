import { useEffect, useId, useState } from 'react'
import { MessageCircle, Phone, Send, X } from 'lucide-react'
import type { CircleMember } from '../types'
import './ShareProtectionModal.css'

export type ShareProtectionModalProps = {
  member: CircleMember
  guardianName: string
  onClose: () => void
}

function buildEncodedShareMessage(member: CircleMember, guardianName: string): string {
  const text =
    `Hi ${member.name}! I've set up a safety tool for you on DocRisk.\n\n` +
    `When you receive any suspicious link or document (job offers, bank messages, government letters), ` +
    `tap this link to check if it is safe before clicking or signing:\n\n` +
    `${member.checkLink}\n\n` +
    `Save this link to your home screen. I'll be notified automatically whenever you use it. - ${guardianName}`
  return encodeURIComponent(text)
}

export function ShareProtectionModal({ member, guardianName, onClose }: ShareProtectionModalProps) {
  const titleId = useId()
  const [copied, setCopied] = useState(false)
  const digits = member.phone.replace(/\D/g, '')
  const enc = buildEncodedShareMessage(member, guardianName)
  const waUrl = digits ? `https://wa.me/${digits}?text=${enc}` : ''
  const smsUrl = `sms:${member.phone}?body=${enc}`

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (!copied) return
    const t = window.setTimeout(() => setCopied(false), 2500)
    return () => window.clearTimeout(t)
  }, [copied])

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(member.checkLink)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const openWhatsApp = () => {
    if (!waUrl) return
    window.open(waUrl, '_blank', 'noopener,noreferrer')
  }

  const openSms = () => {
    window.location.href = smsUrl
  }

  return (
    <div className="share-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="share-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="share-modal__close" onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>

        <h2 id={titleId} className="share-modal__title">
          Now share this link with {member.name || 'them'}
        </h2>

        <label className="share-modal__link-label" htmlFor="share-modal-link">
          Protection link
        </label>
        <div className="share-modal__link-wrap">
          <input
            id="share-modal-link"
            readOnly
            className="share-modal__link-input"
            value={member.checkLink}
            onFocus={(e) => e.currentTarget.select()}
          />
        </div>

        <div className="share-modal__actions" role="group" aria-label="Share options">
          <button
            type="button"
            className="share-modal__btn share-modal__btn--whatsapp"
            onClick={openWhatsApp}
            disabled={!digits}
          >
            <MessageCircle size={28} strokeWidth={2} aria-hidden />
            <span className="share-modal__btn-text">
              <span className="share-modal__btn-title">WhatsApp</span>
              <span className="share-modal__btn-sub">Best for daily use in Sri Lanka</span>
            </span>
            <Send size={20} className="share-modal__btn-chevron" aria-hidden />
          </button>

          <button type="button" className="share-modal__btn share-modal__btn--sms" onClick={openSms}>
            <Phone size={26} strokeWidth={2} aria-hidden />
            <span className="share-modal__btn-text">
              <span className="share-modal__btn-title">Text message (SMS)</span>
              <span className="share-modal__btn-sub">Opens your messaging app</span>
            </span>
            <Send size={20} className="share-modal__btn-chevron" aria-hidden />
          </button>

          <button type="button" className="share-modal__btn share-modal__btn--copy" onClick={() => void copyLink()}>
            <span className="share-modal__copy-icon" aria-hidden>
              {copied ? '✓' : '⎘'}
            </span>
            <span className="share-modal__btn-text">
              <span className="share-modal__btn-title">{copied ? 'Copied!' : 'Copy link only'}</span>
              <span className="share-modal__btn-sub">Paste anywhere you chat</span>
            </span>
          </button>
        </div>

        {!digits && (
          <p className="share-modal__warn">Add a valid phone number to enable WhatsApp sharing.</p>
        )}
      </div>
    </div>
  )
}
