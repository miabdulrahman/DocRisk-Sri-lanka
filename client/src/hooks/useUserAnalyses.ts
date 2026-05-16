import { useEffect, useState } from 'react'
import {
  fetchUserAnalyses,
  type UserAnalysisSummary,
} from '../lib/userAnalyses'
import { isFirebaseConfigured } from '../lib/firebase'

export function useUserAnalyses(uid: string) {
  const [items, setItems] = useState<UserAnalysisSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!uid) {
      setItems([])
      setError(null)
      return
    }

    if (!isFirebaseConfigured) {
      setItems([])
      setError(null)
      return
    }

    setItems(null)
    setError(null)

    let cancelled = false

    async function load() {
      try {
        const data = await fetchUserAnalyses(uid)
        if (!cancelled) setItems(data)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load data.')
          setItems([])
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [uid])

  return { items, error, loading: items === null && !error }
}
