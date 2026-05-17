import type { AnalyzeApiResponse } from './types'
import { apiFetch, getApiBase } from './lib/apiBase'

export const API_URL = `${getApiBase()}/api/analyze`

export interface AnalyzeOptions {
  /** Hint to the backend about what kind of document this is — enables fast NIC pre-validation. */
  documentHint?: 'nic' | string
  /** Optional NIC number for deterministic pre-validation before paying for Gemini. */
  nicNumber?: string
}

export async function analyzeDocument(
  file: File,
  token: string,
  outputLang: string,
  options: AnalyzeOptions = {},
): Promise<AnalyzeApiResponse> {
  const formData = new FormData()
  formData.append('outputLang', outputLang)
  formData.append('document', file)
  if (options.documentHint) formData.append('documentHint', options.documentHint)
  if (options.nicNumber) formData.append('nicNumber', options.nicNumber)

  let res: Response
  try {
    res = await apiFetch(API_URL, {
      method: 'POST',
      body: formData,
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Output-Lang': outputLang,
      },
    })
  } catch (err) {
    console.error('[analyzeDocument] request failed before response', {
      url: API_URL,
      file: { name: file.name, type: file.type, size: file.size },
      outputLang,
      error: err,
    })
    throw err
  }

  let data: AnalyzeApiResponse
  try {
    data = (await res.json()) as AnalyzeApiResponse
  } catch (err) {
    console.error('[analyzeDocument] failed to parse error response JSON', {
      url: API_URL,
      status: res.status,
      statusText: res.statusText,
      file: { name: file.name, type: file.type, size: file.size },
      outputLang,
      error: err,
    })
    return { success: false, error: `Analysis failed with HTTP ${res.status}.` }
  }

  if (!res.ok) {
    console.error('[analyzeDocument] backend returned an error', {
      url: API_URL,
      status: res.status,
      statusText: res.statusText,
      response: data,
      file: { name: file.name, type: file.type, size: file.size },
      outputLang,
    })
  }

  if (!res.ok && !data.error) {
    return { success: false, error: 'Analysis failed. Please try again.' }
  }
  return data
}
