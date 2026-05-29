"""
@author: Samah SHAYYA
@date: 28-May-2026

@description: AI Agent microservice — chat interface to factory telemetry.
Reads current state from ops-api (readonly) and optionally uses
Ollama LLM for natural-language analysis. Falls back to rule-based mock.
"""

import os

from fastapi import FastAPI, APIRouter
from app.router import router
from app.llm import LLMClient

app = FastAPI(title="AI Agent")
app.include_router(router)


@app.on_event("startup")
async def startup():
    llm_url = os.getenv("OLLAMA_URL", "")
    app.state.llm = LLMClient(base_url=llm_url)
    app.state.ops_api_url = os.getenv("OPS_API_URL", "http://ops-api:8003")


@app.get("/health")
async def health():
    llm_ok = app.state.llm.ready if hasattr(app.state, "llm") else False
    return {"status": "ok", "llm_connected": llm_ok}
