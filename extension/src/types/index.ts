export interface Claim {
  id: string;
  text: string;
  importance: string;
}

export interface Evidence {
  url: string;
  title: string;
  snippet: string;
  publisher: string;
  credibility_score: number;
  is_primary_source: boolean;
}

export interface ClaimVerification {
  claim_id: string;
  status: string;
  confidence: number;
  explanation: string;
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
}

export interface AnalysisResponse {
  article: ExtractedArticle;
  verifications: ClaimVerification[];
  overall_score: number;
  score_explanation: string;
}
