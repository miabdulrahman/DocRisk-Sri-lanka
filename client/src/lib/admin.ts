import { doc, getDoc } from 'firebase/firestore'
import type { AdminStatsResponse } from '../types'
import { getApiBase } from './apiBase'
import { db } from './firebase'

export async function checkIsAdmin(uid: string): Promise<boolean> {
  if (!db) return false

  try {
    const snap = await getDoc(doc(db, 'config', 'admins'))
    if (!snap.exists()) return false
    const uids = snap.data()?.uids
    return Array.isArray(uids) && uids.includes(uid)
  } catch {
    return false
  }
}

export async function fetchAdminStats(token: string): Promise<AdminStatsResponse> {
  const url = `${getApiBase()}/api/admin/stats`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) {
    const text = await res.text()
    let message = `Server error (${res.status})`
    try {
      const json = JSON.parse(text) as { error?: string }
      if (json.error) message = json.error
    } catch {
      if (text.includes('Cannot GET')) {
        message =
          'Admin API not found. Restart the backend server (npm run dev from project root).'
      }
    }
    throw new Error(message)
  }

  return res.json() as Promise<AdminStatsResponse>
}
