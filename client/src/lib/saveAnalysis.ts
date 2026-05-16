import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import type { AnalysisResult } from '../types'
import { db } from './firebase'

export async function saveAnalysisToFirestore(
  userId: string,
  fileName: string,
  result: AnalysisResult
): Promise<void> {
  if (!db) return

  await addDoc(collection(db, 'users', userId, 'analyses'), {
    fileName,
    ...result,
    createdAt: serverTimestamp(),
  })
}
