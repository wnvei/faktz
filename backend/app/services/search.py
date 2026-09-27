from tavily import TavilyClient
from app.core.config import settings
from app.models.schemas import Evidence

try:
    tavily_client = TavilyClient(api_key=settings.TAVILY_API_KEY)
except Exception:
    tavily_client = None

# Domain credibility tiers (higher = more credible)
_HIGH_CREDIBILITY = {
    "reuters.com", "apnews.com", "bbc.com", "bbc.co.uk",
    "theguardian.com", "nytimes.com", "washingtonpost.com",
    "economist.com", "ft.com", "nature.com", "science.org",
    "who.int", "un.org", "gov.uk", "gov.au", "europa.eu",
    "aljazeera.com", "dw.com", "france24.com",
}
_MEDIUM_CREDIBILITY = {
    "cnn.com", "nbcnews.com", "abcnews.go.com", "cbsnews.com",
    "foxnews.com", "politico.com", "thehill.com", "axios.com",
    "time.com", "newsweek.com", "forbes.com", "bloomberg.com",
    "npr.org", "pbs.org", "vox.com", "theatlantic.com",
    "middleeasteye.net", "haaretz.com", "timesofisrael.com",
}
_FACT_CHECK_SITES = {
    "factcheck.org", "politifact.com", "snopes.com",
    "fullfact.org", "leadstories.com", "checkyourfact.com",
}

def _domain_credibility(url: str) -> int:
    """Return a credibility score 0-100 based on domain reputation."""
    try:
        domain = url.split("//")[1].split("/")[0].lstrip("www.")
    except IndexError:
        return 40
    if domain in _FACT_CHECK_SITES:
        return 95
    if domain in _HIGH_CREDIBILITY:
        return 85
    if domain in _MEDIUM_CREDIBILITY:
        return 65
    # Unknown domain — lower trust
    return 40

def _search(query: str, max_results: int = 5) -> list[Evidence]:
    """Run a single Tavily search and return Evidence objects."""
    if not tavily_client:
        return []
    try:
        response = tavily_client.search(
            query=query,
            search_depth="advanced",
            include_answer=False,
            max_results=max_results,
            include_raw_content=False,
        )
        results = []
        for res in response.get("results", []):
            url = res.get("url", "")
            results.append(Evidence(
                url=url,
                title=res.get("title", ""),
                snippet=res.get("content", ""),
                publisher=url.split("/")[2].lstrip("www.") if "//" in url else "Unknown",
                credibility_score=_domain_credibility(url),
                is_primary_source=False,
            ))
        return results
    except Exception as e:
        print(f"Error fetching evidence: {e}")
        return []

def fetch_evidence_for_claim(claim_text: str) -> tuple[list[Evidence], list[Evidence]]:
    """
    Returns (supporting_pool, counter_pool).
    supporting_pool: standard evidence search
    counter_pool:    explicit counter-narrative / debunking search
    """
    # Primary: straight claim search
    supporting_pool = _search(claim_text, max_results=5)

    # Counter: search for contradictions, rebuttals, alternative accounts
    counter_query = f'"{claim_text}" debunked OR contradicted OR false OR "in reality" OR "actually" OR misleading'
    counter_pool = _search(counter_query, max_results=4)

    # Deduplicate counter pool against primary (by URL)
    primary_urls = {e.url for e in supporting_pool}
    counter_pool = [e for e in counter_pool if e.url not in primary_urls]

    return supporting_pool, counter_pool
