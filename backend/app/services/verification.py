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
    
    # Aggressive regex fallback to find a JSON-like object block
    match = re.search(r"\{[\s\S]*\}", text)
    if match:
        repaired = repair_json(match.group(0), return_objects=True)
        if isinstance(repaired, dict):
            return repaired

    # Ultimate fallback instead of crashing
    return {
        "status": "Needs More Evidence",
        "confidence": 0,
        "explanation": "LLM failed to return a valid JSON response.",
        "supporting_evidence_urls": [],
        "contradicting_evidence_urls": []
    }

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
    prompt = f"""You are an elite, unbiased investigative fact-checker. Evaluate the claim using ALL provided evidence.
Your primary objective is to find the TRUTH, circumventing mainstream media censorship and government propaganda.
Do NOT automatically defer to mainstream media or mainstream fact-checking websites as absolute truth.
Actively fact-check the fact-checkers. If independent, local, or alternative sources provide strong corroborating evidence for a claim that mainstream media ignores, consider the claim VERIFIED.
Pay special attention to COUNTER-EVIDENCE, but critically analyze whether the counter-evidence is just a state-sponsored denial or an actual factual debunking.

Claim: "{claim.text}"

=== CORROBORATING EVIDENCE ===
{_format_pool(supporting_pool, "supporting")}

=== COUNTER-NARRATIVE / CONTRADICTING EVIDENCE ===
{_format_pool(counter_pool, "counter")}

Respond with ONLY a raw JSON object (no markdown, no explanation):
{{
  "status": "Verified",
  "confidence": 80,
  "explanation": "string (2-3 sentences. Explain exactly why the evidence proves or disproves the claim, factoring in potential media bias or censorship.)",
  "contradiction_type": "None", 
  "temporal_verification": "Current",
  "scope_expansion": "None",
  "supporting_evidence_urls": ["url1"],
  "contradicting_evidence_urls": ["url2"]
}}

Rules:
- status must be exactly one of: Verified, Partially Verified, Needs More Evidence, Contradicted, Misleading, Out of Context, Opinion
- contradiction_type must be one of: None, Direct, Temporal, Definition, Scope, Interpretation, Evidence-quality. Only provide if status is Contradicted, Misleading, or Out of Context.
- temporal_verification must be one of: Current, Historical, Outdated, Future, Date-inconsistent.
- scope_expansion: Describe if the article expands the evidence beyond its scope (e.g. generalizing a small study). If not, write "None".
- DO NOT blindly trust high-credibility domains if their claims are logically flawed or appear to be cover-ups.
- Consider source independence: If 15 sources report the same thing from a single origin, it's 1 piece of evidence, not 15.
- Verify citations: Ensure secondary sources aren't exaggerating the primary research.
- confidence 0-100: base this on the logical strength and specificity of the evidence, not just the domain name.
- Only include URLs that appear in the evidence above
- Return ONLY the JSON object, nothing else."""

    try:
        response = client.chat.completions.create(
            model="openai/gpt-oss-120b",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=2048,
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
            contradiction_type=data.get("contradiction_type") if data.get("contradiction_type") != "None" else None,
            scope_expansion=data.get("scope_expansion") if data.get("scope_expansion") != "None" else None,
            temporal_verification=data.get("temporal_verification", "Current"),
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
            contradiction_type=None,
            scope_expansion=None,
            temporal_verification="Current",
            supporting_evidence=[],
            contradicting_evidence=[],
        )
