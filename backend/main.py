from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import analyze, chat

app = FastAPI(title="Faktz API", version="1.0.0")

# Allow extension to call the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict to extension ID or specific domains
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analyze.router, prefix="/api")
app.include_router(chat.router, prefix="/api")

@app.get("/")
def read_root():
    return {"message": "Faktz API is running."}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
