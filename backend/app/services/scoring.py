from typing import List, Tuple, Dict, Any
from app.models.schemas import ClaimVerification, ExtractedArticle

# Weight multipliers by claim importance
_IMPORTANCE_WEIGHT = {"High": 3, "Medium": 2, "Low": 1}

# Score deltas per status (applied before importance weighting)
_STATUS_DELTA = {
    "Verified": 0,
    "Partially Verified": -40,
    "Needs More Evidence": -50,
    "Out of Context": -60,
    "Opinion": -30,
    "Misleading": -80,
    "Contradicted": -100,
}

def _get_importance(claim_id: str, article: ExtractedArticle) -> str:
    for claim in article.claims:
        if claim.id == claim_id:
            return claim.importance
    return "Medium"

def calculate_credibility_score(
    article: ExtractedArticle,
    verifications: List[ClaimVerification],
) -> Tuple[int, str, str, List[str]]:

    if article.is_satire:
        return 5, "This article appears to be satire or parody and should not be taken as factual news.", "This is a satirical article.", ["⚠ Satire / Parody"]

    if not verifications:
        return 50, "No claims could be extracted or verified — maintaining a neutral score.", "No verifiable claims found.", ["⚠ Insufficient claims"]

    # --- Weighted scoring ---
    total_weight = 0
    weighted_score = 0.0

    status_counts: dict[str, int] = {}
    high_importance_issues = []

    for v in verifications:
        importance = _get_importance(v.claim_id, article)
        weight = _IMPORTANCE_WEIGHT.get(importance, 1)

        # Base delta from status
        delta = _STATUS_DELTA.get(v.status, -10)

        # Confidence modifier: low confidence (< 50) adds extra penalty
        confidence_modifier = 0
        if v.confidence < 50 and v.status != "Verified":
            confidence_modifier = -5
        elif v.confidence >= 85 and v.status == "Verified":
            confidence_modifier = +5

        # Counter-evidence penalty: even "Verified" claims with contradicting evidence lose points
        if v.contradicting_evidence:
            avg_counter_credibility = sum(
                e.credibility_score for e in v.contradicting_evidence
            ) / len(v.contradicting_evidence)
            if avg_counter_credibility >= 75:  # High-credibility counter-source
                confidence_modifier -= 10
            elif avg_counter_credibility >= 55:
                confidence_modifier -= 5

        claim_score = 100 + delta + confidence_modifier
        weighted_score += claim_score * weight
        total_weight += weight

        status_counts[v.status] = status_counts.get(v.status, 0) + 1
        if importance == "High" and v.status in ("Contradicted", "Misleading", "Out of Context"):
            high_importance_issues.append(v)

    base_score = weighted_score / total_weight if total_weight > 0 else 50

    # --- Penalties ---
    # Emotional / manipulative language
    if len(article.emotional_language) > 3:
        base_score -= 12
    elif len(article.emotional_language) > 1:
        base_score -= 5

    # Multiple high-importance claims contradicted is a strong signal
    if len(high_importance_issues) >= 2:
        base_score -= 10

    # Bias penalty
    if article.bias_estimate in ("Left", "Right"):
        base_score -= 5

    # Narrative / Omissions penalty
    if article.omissions_detected:
        base_score -= 8
    
    # Check if Narrative Conclusion exists but claims are weak
    if article.narrative_conclusion and base_score < 60:
        base_score -= 10 # Unsupported narrative conclusion

    final_score = max(0, min(100, round(base_score)))

    # --- Explanation ---
    parts = []
    if status_counts.get("Contradicted", 0):
        n = status_counts["Contradicted"]
        parts.append(f"{n} claim{'s' if n > 1 else ''} directly contradicted by evidence.")
    if status_counts.get("Misleading", 0):
        n = status_counts["Misleading"]
        parts.append(f"{n} claim{'s' if n > 1 else ''} found to be misleading or out of context.")
    if status_counts.get("Needs More Evidence", 0):
        n = status_counts["Needs More Evidence"]
        parts.append(f"{n} claim{'s' if n > 1 else ''} lacked sufficient evidence.")
    if len(article.emotional_language) > 3:
        parts.append("The article uses highly emotional or manipulative language.")
    if article.bias_estimate in ("Left", "Right"):
        parts.append(f"Article shows {article.bias_estimate.lower()}-leaning bias.")
    if high_importance_issues:
        parts.append(f"{len(high_importance_issues)} HIGH-importance claim(s) were contradicted or misleading.")

    if final_score >= 80:
        summary = "The article is highly credible — most claims are well-supported by evidence."
        short = "Highly Credible. Claims are well-supported."
    elif final_score >= 60:
        summary = "The article has moderate credibility. Some claims are disputed or lack evidence."
        short = "Mostly Credible, but with some unverified or disputed claims."
    elif final_score >= 40:
        summary = "The article has questionable credibility. Multiple claims are misleading or contradicted."
        short = "Mixed or Misleading. Contains disputed claims or lacks context."
    else:
        summary = "The article has very low credibility. Key claims are contradicted by evidence."
        short = "Low Credibility. Key claims are contradicted."

    explanation = summary + (" " + " ".join(parts) if parts else "")
    
    # --- Key Reasons ---
    reasons = []
    if final_score >= 70:
        reasons.append("✓ Strong supporting evidence for main claims")
    if len(article.omissions_detected) > 0:
        reasons.append("⚠ Missing context or selective statistics")
    if len(high_importance_issues) > 0:
        reasons.append(f"⚠ {len(high_importance_issues)} significant contradiction(s) found")
    elif status_counts.get("Contradicted", 0) > 0:
        reasons.append("⚠ Contradictory evidence exists for some claims")
    if article.narrative_conclusion and final_score < 60:
        reasons.append("⚠ Overall conclusion unsupported by verifiable facts")
    if not reasons and final_score >= 60:
        reasons.append("✓ No major contradictions found")
    
    # Limit to top 3-4
    reasons = reasons[:4]

    return final_score, explanation, short, reasons
