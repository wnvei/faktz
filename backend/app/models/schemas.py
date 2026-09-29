from pydantic import BaseModel, Field
from typing import List, Optional

class Claim(BaseModel):
    id: str
    text: str
    importance: str = Field(default="Medium", description="Low, Medium, High")
    type: str = Field(default="Fact", description="Fact, Inference, Opinion, Causal, Narrative")

class ExtractedArticle(BaseModel):
    title: str
    summary: str
    key_takeaways: List[str]
    entities: List[str]
    claims: List[Claim]
    bias_estimate: str
    emotional_language: List[str]
    is_satire: bool = Field(default=False)
    omissions_detected: List[str] = Field(default_factory=list, description="Missing qualifiers, timeframe, or opposite evidence")
    narrative_conclusion: str = Field(default="", description="The broader interpretation built from the claims")

class Evidence(BaseModel):
    url: str
    title: str
    snippet: str
    publisher: str
    credibility_score: int
    is_primary_source: bool
    is_independent: bool = Field(default=True, description="Whether this source represents independent reporting")
    original_origin: Optional[str] = Field(default=None, description="The origin of this information if copied")
    temporal_relevance: Optional[str] = Field(default="Current", description="Current, Historical, Outdated, Future")
    citation_accurate: Optional[bool] = Field(default=True, description="Does the evidence actually support the article's citation?")

class ClaimVerification(BaseModel):
    claim_id: str
    status: str = Field(description="Verified, Partially Verified, Needs More Evidence, Contradicted, Misleading, Out of Context, Opinion")
    confidence: int = Field(description="0-100")
    explanation: str
    contradiction_type: Optional[str] = Field(default=None, description="Direct, Temporal, Definition, Scope, Interpretation, Evidence-quality")
    scope_expansion: Optional[str] = Field(default=None, description="If the article expands the scope of evidence unfairly")
    temporal_verification: Optional[str] = Field(default="Current", description="Current, Historical, Outdated, Future, Date-inconsistent")
    supporting_evidence: List[Evidence]
    contradicting_evidence: List[Evidence]

class AnalysisResponse(BaseModel):
    article: ExtractedArticle
    verifications: List[ClaimVerification]
    overall_score: int
    score_explanation: str
    short_summary: str = Field(default="")
    key_reasons: List[str] = Field(default_factory=list, description="List of reasons, starting with ✓ or ⚠")

class AnalyzeRequest(BaseModel):
    model_config = {"populate_by_name": True}

    url: str
    html_content: str = Field(alias="htmlContent", default="")
    text_content: str = Field(alias="textContent")
    title: str
    investigation_mode: str = Field(default="Standard", description="Quick Check, Standard, Deep Investigation, Academic, Breaking News")
    media_url: Optional[str] = Field(default=None, description="Optional image/video/audio URL for multimodal verification")
