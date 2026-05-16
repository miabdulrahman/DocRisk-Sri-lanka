import { doc, getDoc } from 'firebase/firestore'
import type { AdminStatsResponse } from '../types'
import { db } from './firebase'

export const API_BASE = (
  import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/analyze'
).replace(/\/api\/analyze\/?$/, '') || 'http://localhost:4000'

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
  const res = await fetch(`${API_BASE}/api/admin/stats`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.json() as Promise<AdminStatsResponse>
}
