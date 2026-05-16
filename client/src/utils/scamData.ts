export type Severity = 'High' | 'Medium' | 'Low'

export type OfficialScamSource = 'SLCERT' | 'Sri Lanka Police'

export interface ScamEntry {
  id: string
  title: string
  category: string
  severity: Severity
  description: string
  explanation: string
  lastUpdated: string
  source: OfficialScamSource
  sourceUrl: string
}
