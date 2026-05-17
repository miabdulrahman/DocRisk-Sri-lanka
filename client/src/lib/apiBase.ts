/**
 * Base URL for the Express API (no trailing slash).
 *
 * - Dev: empty string so Vite's proxy handles /api/* on any LAN IP
 * - Production: VITE_API_URL must be set to the Render backend URL
 *   e.g. https://docrisk-server.onrender.com
 */
export function getApiBase(): string {
  if (import.meta.env.DEV) return ''
  const raw = (import.meta.env.VITE_API_URL ?? '').trim()
  return raw.replace(/\/$/, '')
}

/**
 * Thin fetch wrapper — injects the localtunnel bypass header
 * when the API base is a tunnel URL so the interstitial is skipped.
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
