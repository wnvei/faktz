from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from groq import Groq
from app.core.config import settings
from typing import List

router = APIRouter()
client = Groq(api_key=settings.GROQ_API_KEY)

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    context: str # The article summary, claims, and evidence as a string

class ChatResponse(BaseModel):
    reply: str

@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    try:
        system_prompt = f"""You are Faktz, an AI credibility assistant. Answer the user's questions about the article based ONLY on the following context (which includes extracted claims and retrieved evidence).
If the context does not contain the answer, say "I don't have enough evidence to answer that based on the current analysis."

CONTEXT:
{request.context}"""

        # Build message history in OpenAI-compatible format
        messages = [{"role": "system", "content": system_prompt}]
        for msg in request.messages:
            messages.append({
                "role": "user" if msg.role == "user" else "assistant",
                "content": msg.content
            })

        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=messages,
            temperature=0.3,
        )

        return ChatResponse(reply=response.choices[0].message.content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
