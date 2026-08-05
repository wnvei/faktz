from tavily import TavilyClient
from app.core.config import settings
from app.models.schemas import Evidence

try:
    tavily_client = TavilyClient(api_key=settings.TAVILY_API_KEY)
except Exception:
    tavily_client = None

def fetch_evidence_for_claim(claim_text: str) -> list[Evidence]:
    if not tavily_client:
        print("Tavily client not initialized (missing API key).")
        return []
    
    try:
        # Search the web for the factual claim
        response = tavily_client.search(
            query=claim_text,
            search_depth="advanced",
            include_answer=False,
            max_results=5,
            include_raw_content=False
        )
        
        evidences = []
        for res in response.get("results", []):
            evidences.append(
                Evidence(
                    url=res.get("url", ""),
                    title=res.get("title", ""),
                    snippet=res.get("content", ""),
                    publisher=res.get("url", "").split("/")[2] if "//" in res.get("url", "") else "Unknown",
                    credibility_score=80, # This can be enhanced by maintaining a trusted domains list
                    is_primary_source=False
                )
            )
        return evidences
    except Exception as e:
        print(f"Error fetching evidence: {e}")
        return []
