import json
import re
from json_repair import repair_json
from groq import Groq
from app.core.config import settings
from app.models.schemas import ExtractedArticle

client = Groq(api_key=settings.GROQ_API_KEY)

def _parse_json(text: str) -> dict:
    """Repair and parse JSON from LLM output using json_repair."""
    text = text.strip()
    if not text:
        raise ValueError("Model returned an empty response.")
    # Strip markdown code fences if present
    match = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", text)
    if match:
        text = match.group(1).strip()
    # Try direct parse first (fastest, no mutation)
    try:
        import json as _json
        result = _json.loads(text)
        if isinstance(result, dict):
            return result
    except Exception:
        pass
    # json_repair handles truncated strings, missing brackets, unescaped quotes
    repaired = repair_json(text, return_objects=True)
    if isinstance(repaired, dict):
        return repaired
    # Last resort: find the outermost {...} block and try again
    brace_match = re.search(r"(\{[\s\S]+\})", text)
    if brace_match:
        try:
            import json as _json
            return _json.loads(repair_json(brace_match.group(1), return_objects=False))
        except Exception:
            pass
    raise ValueError(f"Could not parse JSON from response (len={len(text)}): {text[:300]}")

def _sanitize(text: str) -> str:
    """Remove control characters and normalize whitespace for safe prompt insertion."""
    # Remove non-printable control characters (except newlines/tabs)
    text = re.sub(r"[^\x09\x0A\x0D\x20-\x7E\u0080-\uFFFF]", "", text)
    # Collapse excessive blank lines to at most 2
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()

def extract_article_info(title: str, text_content: str) -> ExtractedArticle:
    prompt = f"""You are an expert investigative fact-checker. Analyze the article below deeply and return ONLY a JSON object.

Title: {title}

Text:
{_sanitize(text_content[:4000])}

Return ONLY this JSON (no markdown, no explanation, no trailing text):
{{
  "title": "string",
  "summary": "string (2-3 sentence neutral summary)",
  "key_takeaways": ["string", "string", "string"],
  "entities": ["person/org/place names mentioned"],
  "claims": [
    {{
      "id": "c1",
      "text": "string (specific claim, max 30 words)",
      "importance": "High",
      "type": "Fact"
    }},
    {{
      "id": "c2",
      "text": "string",
      "importance": "High",
      "type": "Causal"
    }},
    {{
      "id": "c3",
      "text": "string",
      "importance": "Medium",
      "type": "Inference"
    }}
  ],
  "bias_estimate": "Center",
  "emotional_language": ["string"],
  "is_satire": false,
  "omissions_detected": ["string (e.g. missing qualifier, timeframe, opposing evidence)"],
  "narrative_conclusion": "string (The broader interpretation built from the claims)"
}}

Rules:
- Extract UP TO 7 claims. Include as many as the article contains, up to 7.
- type must be exactly one of: Fact, Inference, Opinion, Causal, Narrative.
- Separate Facts (directly asserted) from Inferences (derived conclusions) and Opinions.
- Prioritize claims that are CONTROVERSIAL or where mainstream narrative may OMIT or CONTRADICT other well-known facts.
- importance must be exactly "High", "Medium", or "Low". High = central to the article's argument.
- bias_estimate must be one of: Left, Center Left, Center, Center Right, Right, Unknown.
- is_satire must be a boolean.
- Use omissions_detected to flag if there is important missing context (e.g., selective statistics, missing denominator). Leave empty if none.
- Use narrative_conclusion to describe the overall conclusion the article builds.
- Return ONLY the JSON object, nothing else."""

    try:
        response = client.chat.completions.create(
            model="openai/gpt-oss-120b",
            messages=[
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            temperature=0.1,
            max_tokens=2000,
        )
        raw = response.choices[0].message.content
        data = _parse_json(raw)
    except Exception as e:
        print(f"Error during extraction (API/parse): {e}")
        return ExtractedArticle(
            title=title,
            summary="Failed to extract article.",
            key_takeaways=[],
            entities=[],
            claims=[],
            bias_estimate="Unknown",
            emotional_language=[],
            is_satire=False,
            omissions_detected=[],
            narrative_conclusion=""
        )

    # Sanitize is_satire — model sometimes returns a string
    if isinstance(data.get("is_satire"), str):
        data["is_satire"] = data["is_satire"].lower() == "true"

    # Inject safe defaults for fields the model may omit
    data.setdefault("title", title)
    data.setdefault("summary", "")
    data.setdefault("key_takeaways", [])
    data.setdefault("entities", [])
    data.setdefault("claims", [])
    data.setdefault("bias_estimate", "Unknown")
    data.setdefault("emotional_language", [])
    data.setdefault("is_satire", False)
    data.setdefault("omissions_detected", [])
    data.setdefault("narrative_conclusion", "")

    try:
        return ExtractedArticle(**data)
    except Exception as e:
        print(f"Error during extraction (validation): {e}")
        return ExtractedArticle(
            title=title,
            summary="Failed to validate article.",
            key_takeaways=[],
            entities=[],
            claims=[],
            bias_estimate="Unknown",
            emotional_language=[],
            is_satire=False,
            omissions_detected=[],
            narrative_conclusion=""
        )
