export type OutputLang = 'english' | 'sinhala' | 'tamil';

export type RiskLevel = 'low' | 'medium' | 'high';

export type DocumentType =
  | 'job_offer'
  | 'land_deed'
  | 'visa_letter'
  | 'certificate'
  | 'bank_notice'
  | 'other';

export interface AnalysisResult {
  document_type: DocumentType;
  risk_score: number;
  confidence: number; // 0-100
  risk_level: RiskLevel;
  summary: string;
  red_flags: string[];
  explanation: string;
  recommended_action: string;
}

export interface AnalyzeApiResponse {
  success: boolean;
  result?: AnalysisResult;
  error?: string;
}

export interface AdminStats {
  totalAnalyses: number;
  riskBreakdown: Record<RiskLevel, number>;
  docTypeBreakdown: Record<string, number>;
  avgRiskScore: number;
}

export interface AdminStatsResponse {
  success: boolean;
  totalAnalyses?: number;
  riskBreakdown?: Record<RiskLevel, number>;
  docTypeBreakdown?: Record<string, number>;
  avgRiskScore?: number;
  error?: string;
}
