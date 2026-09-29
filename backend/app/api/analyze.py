from fastapi import APIRouter, HTTPException
from typing import List
from app.models.schemas import AnalyzeRequest, AnalysisResponse
from app.services.extraction import extract_article_info
from app.services.verification import verify_claim
from app.services.scoring import calculate_credibility_score

router = APIRouter()

@router.post("/analyze", response_model=AnalysisResponse)
async def analyze_article(request: AnalyzeRequest):
    try:
        # 1. Extract claims and metadata
        article_info = extract_article_info(request.title, request.text_content)
        
        # 2. Verify each claim sequentially to avoid TPM rate limits
        verifications = [verify_claim(claim) for claim in article_info.claims]
            
        # 3. Calculate score
        score, explanation, short_summary, key_reasons = calculate_credibility_score(article_info, verifications)
        
        return AnalysisResponse(
            article=article_info,
            verifications=verifications,
            overall_score=score,
            score_explanation=explanation,
            short_summary=short_summary,
            key_reasons=key_reasons
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
