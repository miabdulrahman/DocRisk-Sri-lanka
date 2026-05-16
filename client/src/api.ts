import type { AnalyzeApiResponse } from './types'
import { getApiBase } from './lib/apiBase'

export const API_URL = `${getApiBase()}/api/analyze`

export async function analyzeDocument(
  file: File,
  token: string,
  outputLang: string,
): Promise<AnalyzeApiResponse> {
  const formData = new FormData()
  formData.append('outputLang', outputLang)
  formData.append('document', file)

  let res: Response
  try {
    res = await fetch(API_URL, {
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
