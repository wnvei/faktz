export interface Claim {
  id: string;
  text: string;
  importance: string;
  type?: string;
}

export interface Evidence {
  url: string;
  title: string;
  snippet: string;
  publisher: string;
  credibility_score: number;
  is_primary_source: boolean;
  is_independent?: boolean;
  original_origin?: string;
}

export interface ClaimVerification {
  claim_id: string;
  status: string;
  confidence: number;
  explanation: string;
  contradiction_type?: string;
  scope_expansion?: string;
  temporal_verification?: string;
  supporting_evidence: Evidence[];
  contradicting_evidence: Evidence[];
}

export interface ExtractedArticle {
  title: string;
  summary: string;
  key_takeaways: string[];
  entities: string[];
  claims: Claim[];
  bias_estimate: string;
  emotional_language: string[];
  is_satire?: boolean;
  omissions_detected?: string[];
  narrative_conclusion?: string;
}

export interface AnalysisResponse {
  article: ExtractedArticle;
  verifications: ClaimVerification[];
  overall_score: number;
  score_explanation: string;
  short_summary?: string;
  key_reasons?: string[];
}
