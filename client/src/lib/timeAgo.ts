/** Short relative time for activity feeds (e.g. "5 minutes ago"). */
export function timeAgo(iso: string): string {
  const d = new Date(iso)
  const t = d.getTime()
  if (Number.isNaN(t)) return '—'
  const sec = Math.floor((Date.now() - t) / 1000)
  if (sec < 45) return 'Just now'
  if (sec < 3600)
    return `${Math.max(1, Math.floor(sec / 60))} minute${Math.floor(sec / 60) === 1 ? '' : 's'} ago`
  if (sec < 86400) return `${Math.floor(sec / 3600)} hour${Math.floor(sec / 3600) === 1 ? '' : 's'} ago`
  if (sec < 604800) return `${Math.floor(sec / 86400)} day${Math.floor(sec / 86400) === 1 ? '' : 's'} ago`
  return d.toLocaleDateString()
}
