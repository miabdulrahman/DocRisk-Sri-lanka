import type { AnalyzeApiResponse } from './types'

export const API_URL =
  import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/analyze'

export async function analyzeDocument(
  file: File,
  token: string,
  outputLang: string,
): Promise<AnalyzeApiResponse> {
  const formData = new FormData()
  formData.append('outputLang', outputLang)
  formData.append('document', file)

  const res = await fetch(API_URL, {
    method: 'POST',
    body: formData,
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Output-Lang': outputLang,
    },
  })

  const data = (await res.json()) as AnalyzeApiResponse
  if (!res.ok && !data.error) {
    return { success: false, error: 'Analysis failed. Please try again.' }
  }
  return data
}
