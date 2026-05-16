/** Base URL for the Express API (no trailing slash). */
export function getApiBase(): string {
  const raw = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/analyze'
  const base = raw.replace(/\/api\/analyze\/?$/, '').replace(/\/$/, '')
  return base || 'http://localhost:4000'
}
