/**
 * Base URL for the Express API (no trailing slash).
 * In dev, prefer same-origin `/api` so Vite's proxy routes traffic correctly even when you open
 * the app via a LAN IP (otherwise hard-coded localhost hits the wrong machine).
 */
export function getApiBase(): string {
  if (import.meta.env.DEV) {
    return ''
  }

  const raw = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/analyze'
  const base = raw.replace(/\/api\/analyze\/?$/, '').replace(/\/$/, '')
  return base || 'http://localhost:4000'
}
