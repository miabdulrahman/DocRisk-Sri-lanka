export type OutputLang = 'english' | 'sinhala' | 'tamil';

export type RiskLevel = 'low' | 'medium' | 'high';

export type DocumentType =
  | 'job_offer'
  | 'land_deed'
  | 'visa_letter'
  | 'certificate'
  | 'bank_notice'
  | 'nic'
  | 'other';

/**
 * Structured fields auto-extracted by Gemini from identity-style documents.
 * All keys are optional — the model returns only what it can read confidently.
 */
export interface ExtractedData {
  full_name?: string;
  document_id?: string;
  date_of_birth?: string;
  /** Misc additional fields the model surfaces (issuer, address, etc.). */
  [key: string]: string | undefined;
}

/**
 * One bounding box flagged by the model as potentially tampered.
 *
 * `box_2d` is normalized on a 0..1000 scale: [ymin, xmin, ymax, xmax].
 * Frontend converts these to percentage CSS to overlay on the document image.
 */
export interface TamperBox {
  field_name: string;
  box_2d: [number, number, number, number];
  reason: string;
}

export interface AnalysisResult {
  document_type: DocumentType;
  risk_score: number;
  confidence: number; // 0-100
  risk_level: RiskLevel;
  summary: string;
  red_flags: string[];
  explanation: string;
  recommended_action: string;
  /** AI-extracted data fields (may be undefined for non-ID documents). */
  extracted_data?: ExtractedData | undefined;
  /** Bounding boxes around suspected tampered regions of the image. */
  tamper_coordinates?: TamperBox[] | undefined;
}

export interface AnalyzeApiResponse {
  success: boolean;
  result?: AnalysisResult;
  error?: string;
  /** Set when a fast deterministic pre-validator rejected the file. */
  preValidation?: {
    field: 'nic';
    code: string;
    message: string;
  };
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
