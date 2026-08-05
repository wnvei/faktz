from typing import List, Tuple
from app.models.schemas import ClaimVerification, ExtractedArticle

def calculate_credibility_score(article: ExtractedArticle, verifications: List[ClaimVerification]) -> Tuple[int, str]:
    if not verifications:
        return 50, "No claims could be extracted or verified, maintaining a neutral score."

    base_score = 100
    
    verified_count = 0
    contradicted_count = 0
    misleading_count = 0
    needs_evidence_count = 0
    
    for v in verifications:
        if v.status == "Verified":
            verified_count += 1
        elif v.status == "Contradicted":
            contradicted_count += 1
            base_score -= 20
        elif v.status in ["Misleading", "Out of Context"]:
            misleading_count += 1
            base_score -= 10
        elif v.status == "Needs More Evidence":
            needs_evidence_count += 1
            base_score -= 5
            
    # Apply emotional language penalty
    if len(article.emotional_language) > 2:
        base_score -= 10
        
    # Ensure bounds
    final_score = max(0, min(100, base_score))
    
    explanation_parts = []
    if contradicted_count > 0:
        explanation_parts.append(f"{contradicted_count} claims were contradicted by evidence.")
    if misleading_count > 0:
        explanation_parts.append(f"{misleading_count} claims were misleading or out of context.")
    if needs_evidence_count > 0:
        explanation_parts.append(f"{needs_evidence_count} claims lacked sufficient evidence.")
    if len(article.emotional_language) > 2:
        explanation_parts.append("The article uses highly emotional or manipulative language.")
        
    if final_score >= 80:
        explanation = "The article is highly credible, with claims well-supported by evidence."
    elif final_score >= 50:
        explanation = "The article has mixed credibility. Some claims lack evidence or are somewhat misleading." + " ".join(explanation_parts)
    else:
        explanation = "The article has low credibility due to significant issues. " + " ".join(explanation_parts)

    return final_score, explanation
