export type OfficialScamSource = "SLCERT" | "Sri Lanka Police";

export type ScamSeverity = "High" | "Medium" | "Low";

export interface OfficialScamEntry {
  id: string;
  title: string;
  category: string;
  severity: ScamSeverity;
  description: string;
  explanation: string;
  lastUpdated: string;
  source: OfficialScamSource;
  sourceUrl: string;
}

export interface TrendingScamsResponse {
  success: boolean;
  scams: OfficialScamEntry[];
  fetchedAt: string;
  sources: OfficialScamSource[];
  cached?: boolean;
  error?: string;
}
