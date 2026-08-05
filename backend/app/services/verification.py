import json
from groq import Groq
from app.core.config import settings
from app.models.schemas import Claim, ClaimVerification, Evidence
from app.services.search import fetch_evidence_for_claim

client = Groq(api_key=settings.GROQ_API_KEY)

def verify_claim(claim: Claim) -> ClaimVerification:
    # 1. Fetch Evidence
    evidences = fetch_evidence_for_claim(claim.text)

    if not evidences:
        return ClaimVerification(
            claim_id=claim.id,
            status="Needs More Evidence",
            confidence=0,
            explanation="Insufficient evidence available to verify this claim.",
            supporting_evidence=[],
            contradicting_evidence=[]
        )

    # 2. Evaluate with LLM
    evidence_text = "\n".join([f"Source: {e.url}\nSnippet: {e.snippet}" for e in evidences])

    prompt = f"""
    You are an expert fact-checker. Evaluate the following claim based ONLY on the provided evidence.
    
    Claim to evaluate: "{claim.text}"
    
    Evidence:
    {evidence_text}
    
    Determine the status of the claim.
    Return ONLY a JSON object matching this schema:
    {{
      "status": "string (Verified, Partially Verified, Needs More Evidence, Contradicted, Misleading, Out of Context, Opinion)",
      "confidence": "integer (0-100, representing your confidence in this assessment based on evidence quality)",
      "explanation": "string (Detailed explanation of why this status was chosen, referencing the evidence)",
      "supporting_evidence_urls": ["string (urls from the evidence that support the claim)"],
      "contradicting_evidence_urls": ["string (urls from the evidence that contradict the claim)"]
    }}
    
    Do not invent evidence. If the provided evidence is not enough to make a solid conclusion, use "Needs More Evidence".
    Return ONLY JSON. Do not include markdown formatting like ```json.
    """

    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {
                    "role": "system",
                    "content": "You are an expert fact-checker. Always respond with valid JSON only, no markdown formatting."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            temperature=0.1,
            response_format={"type": "json_object"},
        )
        data = json.loads(response.choices[0].message.content)

        # Match URLs back to Evidence objects
        supporting = [e for e in evidences if e.url in data.get("supporting_evidence_urls", [])]
        contradicting = [e for e in evidences if e.url in data.get("contradicting_evidence_urls", [])]

        # If the LLM failed to match URLs perfectly, use all evidences for context
        if not supporting and not contradicting and data.get("status") in ["Verified", "Contradicted"]:
            if data.get("status") == "Verified":
                supporting = evidences
            elif data.get("status") == "Contradicted":
                contradicting = evidences

        return ClaimVerification(
            claim_id=claim.id,
            status=data.get("status", "Needs More Evidence"),
            confidence=data.get("confidence", 0),
            explanation=data.get("explanation", "Failed to parse explanation."),
            supporting_evidence=supporting,
            contradicting_evidence=contradicting
        )
    except Exception as e:
        print(f"Error during verification: {e}")
        return ClaimVerification(
            claim_id=claim.id,
            status="Needs More Evidence",
            confidence=0,
            explanation="An error occurred during verification.",
            supporting_evidence=[],
            contradicting_evidence=[]
        )
