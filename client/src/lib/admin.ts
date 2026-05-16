import type { AdminStatsResponse } from '../types'
import { getApiBase } from './apiBase'

export type AdminGateResult =
  | { allowed: true }
  | { allowed: false; reason: string }

/**
 * Validates the Firebase ID token on the backend (Admin SDK reads `config/admins`).
 */
export async function verifyAdminGate(idToken: string): Promise<AdminGateResult> {
  try {
    const url = `${getApiBase()}/api/admin/check`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${idToken}` },
    })
    let data = {} as {
      success?: boolean
      isAdmin?: boolean
      error?: string
    }

    try {
      data = (await res.json()) as typeof data
    } catch {
      /* body not JSON */
    }

    if (res.status === 401) {
      return {
        allowed: false,
        reason:
          data.error ??
          'Sign-in token could not be verified. Ensure the backend has FIREBASE_PROJECT_ID and a valid service account JSON (GOOGLE_APPLICATION_CREDENTIALS path). Restart the API after editing server/.env.',
      }
    }

    if (res.status === 503) {
      return {
        allowed: false,
        reason:
          data.error ??
          'Server cannot verify admin access — Firestore is not available. Check FIREBASE_PROJECT_ID and GOOGLE_APPLICATION_CREDENTIALS on the server.',
      }
    }

    if (!res.ok) {
      return {
        allowed: false,
        reason: data.error ?? `Admin check failed (HTTP ${res.status}).`,
      }
    }

    if (data.success && data.isAdmin) return { allowed: true }

    return {
      allowed: false,
      reason:
        'Your Firebase user is signed in but is not listed as an admin. In Firestore, create collection `config` → document ID `admins` with field `uids` (array) containing your user UID exactly as shown under Authentication → Users.',
    }
  } catch {
    return {
      allowed: false,
      reason:
        'Could not reach the API from the browser. Start the backend (port 4000), keep Vite’s /api proxy, or set VITE_API_URL=http://localhost:4000 while developing.',
    }
  }
}

/** @deprecated prefer verifyAdminGate for messages */
export async function checkIsAdmin(idToken: string): Promise<boolean> {
  const g = await verifyAdminGate(idToken)
  return g.allowed
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
