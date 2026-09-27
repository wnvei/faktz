import re
from json_repair import repair_json
from groq import Groq
from app.core.config import settings
from app.models.schemas import Claim, ClaimVerification, Evidence
from app.services.search import fetch_evidence_for_claim

client = Groq(api_key=settings.GROQ_API_KEY)

def _parse_json(text: str) -> dict:
    """Repair and parse JSON from LLM output using json_repair."""
    text = text.strip()
    match = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", text)
    if match:
        text = match.group(1)
    repaired = repair_json(text, return_objects=True)
    if isinstance(repaired, dict):
        return repaired
    raise ValueError(f"Could not parse JSON: {text[:200]}")

def _clean(s: str) -> str:
    """Strip chars that break JSON string values."""
    return (
        s.replace('\u201c', '"').replace('\u201d', '"')
         .replace('\\', ' ').replace('\r', ' ').replace('\n', ' ').strip()
    )

def _format_pool(evidences: list[Evidence], label: str) -> str:
    if not evidences:
        return f"[No {label} sources found]"
    return "\n".join(
        f"[{label[0]}{i+1}] ({e.credibility_score}/100 credibility) URL: {e.url}\n    Snippet: {_clean(e.snippet)[:250]}"
        for i, e in enumerate(evidences)
    )

def verify_claim(claim: Claim) -> ClaimVerification:
    # 1. Fetch both evidence pools
    supporting_pool, counter_pool = fetch_evidence_for_claim(claim.text)
    all_evidences = supporting_pool + counter_pool

    if not all_evidences:
        return ClaimVerification(
            claim_id=claim.id,
            status="Needs More Evidence",
            confidence=0,
            explanation="No web evidence found to verify this claim.",
            supporting_evidence=[],
            contradicting_evidence=[],
        )

    # 2. Build prompt with both pools clearly separated
    prompt = f"""You are an expert investigative fact-checker. Evaluate the claim using ALL provided evidence.
Pay special attention to COUNTER-EVIDENCE — mainstream media may suppress or ignore contradicting facts.

Claim: "{claim.text}"

=== CORROBORATING EVIDENCE ===
{_format_pool(supporting_pool, "supporting")}

=== COUNTER-NARRATIVE / CONTRADICTING EVIDENCE ===
{_format_pool(counter_pool, "counter")}

Respond with ONLY a raw JSON object (no markdown, no explanation):
{{
  "status": "Verified",
  "confidence": 80,
  "explanation": "string (2-3 sentences. If counter-evidence exists, explicitly address what it says and why you weight the evidence the way you do.)",
  "supporting_evidence_urls": ["url1"],
  "contradicting_evidence_urls": ["url2"]
}}

Rules:
- status must be exactly one of: Verified, Partially Verified, Needs More Evidence, Contradicted, Misleading, Out of Context, Opinion
- If STRONG counter-evidence exists, status should be Contradicted or Misleading — not Verified
- confidence 0-100: reduce confidence if sources disagree or counter-evidence is from high-credibility domains
- Only include URLs that appear in the evidence above
- Return ONLY the JSON object, nothing else."""

    try:
        response = client.chat.completions.create(
            model="openai/gpt-oss-120b",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=600,
        )
        raw = response.choices[0].message.content
        data = _parse_json(raw)

        # Sanitize confidence
        try:
            data["confidence"] = int(data.get("confidence", 0))
        except (ValueError, TypeError):
            data["confidence"] = 0

        # Match URLs back to Evidence objects (check both pools)
        url_map = {e.url: e for e in all_evidences}
        supporting_urls = data.get("supporting_evidence_urls", [])
        contradicting_urls = data.get("contradicting_evidence_urls", [])

        supporting = [url_map[u] for u in supporting_urls if u in url_map]
        contradicting = [url_map[u] for u in contradicting_urls if u in url_map]

        # Fallback: assign pools by status if URL matching failed
        if not supporting and not contradicting:
            status = data.get("status", "")
            if status == "Verified":
                supporting = supporting_pool[:3]
            elif status == "Contradicted":
                contradicting = counter_pool[:3] or supporting_pool[:3]
            elif status in ("Misleading", "Out of Context", "Partially Verified"):
                supporting = supporting_pool[:2]
                contradicting = counter_pool[:2]

        return ClaimVerification(
            claim_id=claim.id,
            status=data.get("status", "Needs More Evidence"),
            confidence=data.get("confidence", 0),
            explanation=data.get("explanation", "No explanation provided."),
            supporting_evidence=supporting,
            contradicting_evidence=contradicting,
        )
    except Exception as e:
        print(f"Error during verification: {e}")
        return ClaimVerification(
            claim_id=claim.id,
            status="Needs More Evidence",
            confidence=0,
            explanation="Verification failed due to an error.",
            supporting_evidence=[],
            contradicting_evidence=[],
        )
