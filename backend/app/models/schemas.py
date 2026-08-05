from pydantic import BaseModel, Field
from typing import List, Optional

class Claim(BaseModel):
    id: str
    text: str
    importance: str = Field(description="Low, Medium, High")

class ExtractedArticle(BaseModel):
    title: str
    summary: str
    key_takeaways: List[str]
    entities: List[str]
    claims: List[Claim]
    bias_estimate: str
    emotional_language: List[str]

class Evidence(BaseModel):
    url: str
    title: str
    snippet: str
    publisher: str
    credibility_score: int
    is_primary_source: bool

class ClaimVerification(BaseModel):
    claim_id: str
    status: str = Field(description="Verified, Partially Verified, Needs More Evidence, Contradicted, Misleading, Out of Context, Opinion")
    confidence: int = Field(description="0-100")
    explanation: str
    supporting_evidence: List[Evidence]
    contradicting_evidence: List[Evidence]

class AnalysisResponse(BaseModel):
    article: ExtractedArticle
    verifications: List[ClaimVerification]
    overall_score: int
    score_explanation: str

class AnalyzeRequest(BaseModel):
    model_config = {"populate_by_name": True}

    url: str
    html_content: str = Field(alias="htmlContent", default="")
    text_content: str = Field(alias="textContent")
    title: str
