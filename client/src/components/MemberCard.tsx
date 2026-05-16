import { useEffect, useState } from 'react'
import { Copy, Send, Trash2 } from 'lucide-react'
import type { CircleMember } from '../types'

export type MemberCardProps = {
  member: CircleMember
  onCopyLink: (link: string) => void
  onRemove: (id: string) => void
  onResendLink?: (member: CircleMember) => void
}

const REL_AVATAR: Record<CircleMember['relationship'], string> = {
  grandmother: 'var(--g-member-amber, #d97706)',
  grandfather: 'var(--g-member-amber, #d97706)',
  child: 'var(--g-member-blue, #2563eb)',
  parent: 'var(--g-member-teal, #0d9488)',
  other: 'var(--g-member-gray, #6b7280)',
}

const REL_LABEL: Record<CircleMember['relationship'], string> = {
  grandmother: 'Grandmother',
  grandfather: 'Grandfather',
  child: 'Child',
  parent: 'Parent',
  other: 'Other',
}

function initials(name: string): string {
  const t = name.trim()
  if (!t) return '?'
  return t[0]!.toUpperCase()
}

function formatLastCheck(iso: string | null): string {
  if (!iso) return 'Never checked'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Never checked'
  const diff = Date.now() - d.getTime()
  const days = Math.floor(diff / 86400000)
  if (days <= 0) return 'Today'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

function isRecentCheck(iso: string | null): boolean {
  if (!iso) return false
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return false
  return Date.now() - d.getTime() < 7 * 86400000
}

export function MemberCard({ member, onCopyLink, onRemove, onResendLink }: MemberCardProps) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const t = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(t)
  }, [copied])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(member.checkLink)
      setCopied(true)
      onCopyLink(member.checkLink)
    } catch {
      setCopied(true)
      onCopyLink(member.checkLink)
    }
  }

  const handleRemove = () => {
    if (
      window.confirm(
        `Remove ${member.name} from your circle? Their protection link will stop working.`,
      )
    ) {
      onRemove(member.id)
    }
  }

  const dotOk = isRecentCheck(member.lastCheckAt)

  return (
    <article className="member-card">
      <div className="member-card__top">
        <div
          className="member-card__avatar"
          style={{ background: REL_AVATAR[member.relationship] }}
          aria-hidden
        >
          {initials(member.name)}
        </div>
        <div className="member-card__status-dot" title={dotOk ? 'Active in the last 7 days' : 'No recent check'}>
          <span className={dotOk ? 'member-card__dot member-card__dot--ok' : 'member-card__dot member-card__dot--idle'} />
        </div>
      </div>
      <div className="member-card__body">
        <h3 className="member-card__name">{member.name}</h3>
        <p className="member-card__rel">{REL_LABEL[member.relationship]}</p>
        <p className="member-card__phone">{member.phone}</p>
        <span className="member-card__badge">Total checks: {member.totalChecks}</span>
        <p className="member-card__last">{formatLastCheck(member.lastCheckAt)}</p>
      </div>
      <div className="member-card__actions">
        {onResendLink && (
          <button
            type="button"
            className="btn btn-primary btn-sm member-card__resend"
            onClick={() => onResendLink(member)}
          >
            <Send size={14} />
            Resend link
          </button>
        )}
        <button type="button" className="btn btn-ghost btn-sm member-card__copy" onClick={handleCopy}>
          <Copy size={14} />
          {copied ? 'Copied!' : 'Copy protection link'}
        </button>
        <button
          type="button"
          className="member-card__remove"
          onClick={handleRemove}
          aria-label={`Remove ${member.name}`}
        >
          <Trash2 size={18} />
        </button>
      </div>
    </article>
  )
}
