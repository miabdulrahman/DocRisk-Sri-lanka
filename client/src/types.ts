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
