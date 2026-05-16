import { collection, getDocs } from 'firebase/firestore'
import type {
  AnalysisResult,
  DocumentType,
  RiskLevel,
} from '../types'
import { db, isFirebaseConfigured } from './firebase'

export type UserAnalysisSummary = AnalysisResult & {
  id: string
  fileName: string
  /** From Firestore `createdAt`; may be null for legacy rows */
  createdAt: Date | null
}

function isRiskLevel(v: unknown): v is RiskLevel {
  return v === 'low' || v === 'medium' || v === 'high'
}

function isDocumentType(v: unknown): v is DocumentType {
  return (
    v === 'job_offer' ||
    v === 'land_deed' ||
    v === 'visa_letter' ||
    v === 'certificate' ||
    v === 'bank_notice' ||
    v === 'other'
  )
}

function asFirestoreDate(v: unknown): Date | null {
  if (v && typeof v === 'object' && 'toDate' in v) {
    const fn = (v as { toDate?: () => Date }).toDate
    if (typeof fn === 'function') {
      try {
        const d = fn.call(v)
        return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null
      } catch {
        return null
      }
    }
  }
  return null
}

function mapDoc(docId: string, raw: Record<string, unknown>): UserAnalysisSummary {
  const fileName =
    typeof raw.fileName === 'string' ? raw.fileName : 'Untitled'

  let risk_score = typeof raw.risk_score === 'number' ? raw.risk_score : 0
  risk_score = Math.min(100, Math.max(0, risk_score))

  let confidence = typeof raw.confidence === 'number' ? raw.confidence : 50
  confidence = Math.min(100, Math.max(0, confidence))

  return {
    id: docId,
    fileName,
    createdAt: asFirestoreDate(raw.createdAt),
    document_type: isDocumentType(raw.document_type)
      ? raw.document_type
      : 'other',
    risk_score,
    confidence,
    risk_level: isRiskLevel(raw.risk_level) ? raw.risk_level : 'medium',
    summary: typeof raw.summary === 'string' ? raw.summary : '—',
    red_flags: Array.isArray(raw.red_flags)
      ? raw.red_flags.filter((x): x is string => typeof x === 'string')
      : [],
    explanation:
      typeof raw.explanation === 'string' ? raw.explanation : '',
    recommended_action:
      typeof raw.recommended_action === 'string'
        ? raw.recommended_action
        : '',
  }
}

/** Pulls analyses saved under users/{uid}/analyses (newest-first). */
export async function fetchUserAnalyses(uid: string): Promise<UserAnalysisSummary[]> {
  if (!isFirebaseConfigured || !uid.trim()) return []

  try {
    const snap = await getDocs(collection(db, 'users', uid, 'analyses'))
    const rows = snap.docs.map((d) => mapDoc(d.id, d.data() as Record<string, unknown>))
    rows.sort((a, b) => {
      const ta = a.createdAt?.getTime() ?? 0
      const tb = b.createdAt?.getTime() ?? 0
      return tb - ta
    })
    return rows
  } catch {
    throw new Error('Could not load your analysis history from Firestore.')
  }
}

export function summarizeAnalyses(entries: UserAnalysisSummary[]) {
  const total = entries.length
  const riskCounts: Record<RiskLevel, number> = {
    low: 0,
    medium: 0,
    high: 0,
  }
  const byType: Record<string, number> = {}
  let riskSum = 0
  let confSum = 0

  for (const e of entries) {
    if (riskCounts[e.risk_level] !== undefined) {
      riskCounts[e.risk_level] += 1
    }
    byType[e.document_type] = (byType[e.document_type] ?? 0) + 1
    riskSum += e.risk_score
    confSum += e.confidence
  }

  const avgRisk = total ? Math.round((riskSum / total) * 10) / 10 : 0
  const avgConfidence = total ? Math.round((confSum / total) * 10) / 10 : 0
  const highPct = total ? Math.round((riskCounts.high / total) * 100) : 0

  return {
    total,
    riskCounts,
    byType,
    avgRisk,
    avgConfidence,
    highPct,
  }
}
