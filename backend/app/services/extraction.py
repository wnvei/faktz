import json
from groq import Groq
from app.core.config import settings
from app.models.schemas import ExtractedArticle

client = Groq(api_key=settings.GROQ_API_KEY)

def extract_article_info(title: str, text_content: str) -> ExtractedArticle:
    prompt = f"""
    You are an expert investigative journalist and fact-checker. 
    Analyze the following article text.
    
    Article Title: {title}
    
    Article Text:
    {text_content}
    
    Extract the following information and return ONLY a valid JSON object matching this schema:
    {{
      "title": "string",
      "summary": "string (concise summary of the article)",
      "key_takeaways": ["string"],
      "entities": ["string (important people, organizations, dates, locations)"],
      "claims": [
        {{
          "id": "string (generate a unique short string like c1, c2)",
          "text": "string (the exact or closely paraphrased factual claim)",
          "importance": "string (High, Medium, Low)"
        }}
      ],
      "bias_estimate": "string (Left, Center Left, Center, Center Right, Right, Unknown. Explain briefly in parentheses)",
      "emotional_language": ["string (examples of emotionally manipulative wording, if any)"]
    }}
    
    Ensure that "claims" ONLY includes factual assertions that can be verified, NOT opinions.
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
            temperature=0.2,
            response_format={"type": "json_object"},
        )
        data = json.loads(response.choices[0].message.content)
        return ExtractedArticle(**data)
    except Exception as e:
        print(f"Error during extraction: {e}")
        return ExtractedArticle(
            title=title,
            summary="Failed to parse article.",
            key_takeaways=[],
            entities=[],
            claims=[],
            bias_estimate="Unknown",
            emotional_language=[]
        )
