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

/**
 * Thin fetch wrapper — automatically injects the localtunnel bypass header
 * when the API base is a loca.lt tunnel URL, so the tunnel interstitial is skipped.
 */
export function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const base = getApiBase()
  const isTunnel = base.includes('loca.lt') || base.includes('ngrok')
  if (isTunnel) {
    const headers = new Headers(init.headers)
    headers.set('bypass-tunnel-reminder', 'true')
    return fetch(input, { ...init, headers })
  }
  return fetch(input, init)
}
