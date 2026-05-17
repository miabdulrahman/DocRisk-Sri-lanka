import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch, getApiBase } from '../lib/apiBase'
import type { ScamEntry } from '../utils/scamData'

interface TrendingScamsPayload {
  success: boolean
  scams: ScamEntry[]
  fetchedAt?: string
  sources?: string[]
  cached?: boolean
  error?: string
}

const CACHE_KEY = 'docrisk-official-scams-v1'
const CACHE_TTL_MS = 10 * 60 * 1000
const AUTO_REFRESH_MS = 30 * 60 * 1000

interface CachedPayload {
  scams: ScamEntry[]
  sources: string[]
  fetchedAt: string
  savedAt: number
}

function readCache(): CachedPayload | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedPayload
    if (Date.now() - parsed.savedAt > CACHE_TTL_MS) {
      sessionStorage.removeItem(CACHE_KEY)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function writeCache(payload: CachedPayload) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(payload))
  } catch {
    /* ignore quota errors */
  }
}

function parseJsonResponse(raw: string, status: number): TrendingScamsPayload {
  const trimmed = raw.trim()
  if (!trimmed || trimmed.startsWith('<')) {
    if (status === 404) {
      throw new Error(
        'Official advisories API was not found. Restart the backend: run npm run dev in the server/ folder.',
      )
    }
    throw new Error(
      'The server returned HTML instead of JSON. Ensure the API is running on port 4000 and the client proxy is active.',
    )
  }

  try {
    return JSON.parse(trimmed) as TrendingScamsPayload
  } catch {
    throw new Error('Could not read the server response. Is the backend running?')
  }
}

export function useOfficialScams() {
  const [scams, setScams] = useState<ScamEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sources, setSources] = useState<string[]>([])
  const [fetchedAt, setFetchedAt] = useState<string | null>(null)
  const inflight = useRef<Promise<void> | null>(null)

  const load = useCallback(async (force = false) => {
    if (!force) {
      const cached = readCache()
      if (cached) {
        setScams(cached.scams)
        setSources(cached.sources)
        setFetchedAt(cached.fetchedAt)
        setLoading(false)
        setError(null)
        return
      }
    }

    if (inflight.current) {
      await inflight.current
      return
    }

    setLoading(true)
    setError(null)

    const task = (async () => {
      try {
        const res = await apiFetch(`${getApiBase()}/api/trending-scams`)
        const raw = await res.text()
        const data = parseJsonResponse(raw, res.status)

        if (res.status === 429) {
          throw new Error(
            'Too many requests. Wait a few minutes, or restart the backend server (npm run dev in server/) to reset limits.',
          )
        }

        if (!res.ok || !data.success || !Array.isArray(data.scams)) {
          throw new Error(data.error ?? 'Could not load official scam advisories.')
        }

        const at = data.fetchedAt ?? new Date().toISOString()
        setScams(data.scams)
        setSources(data.sources ?? [])
        setFetchedAt(at)
        writeCache({
          scams: data.scams,
          sources: data.sources ?? [],
          fetchedAt: at,
          savedAt: Date.now(),
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load official advisories.'
        setError(message)
        if (!readCache()) setScams([])
      } finally {
        setLoading(false)
        inflight.current = null
      }
    })()

    inflight.current = task
    await task
  }, [])

  useEffect(() => {
    void load()
    const interval = setInterval(() => void load(true), AUTO_REFRESH_MS)
    return () => clearInterval(interval)
  }, [load])

  const reload = useCallback(() => {
    sessionStorage.removeItem(CACHE_KEY)
    return load(true)
  }, [load])

  return { scams, loading, error, sources, fetchedAt, reload }
}
