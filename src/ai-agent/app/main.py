"""
@author: Samah SHAYYA
@date: 29-May-2026

@description: AI Agent microservice — PydanticAI-powered chat interface to
factory telemetry. Reads current state from ops-api (read-only). Uses
OpenAI-compatible LLM (e.g. Ollama) when available; falls back to mock.
"""

import os

from fastapi import FastAPI

from app.agent import FactoryAgent
from app.router import router

app = FastAPI(title = 'AI Agent')
app.include_router(router)


@app.on_event('startup')
async def startup():
    llm_url: str = os.getenv('OLLAMA_URL', '')
    ops_api_url: str = os.getenv('OPS_API_URL', 'http://ops-api:8003')
    app.state.agent = FactoryAgent(llm_url = llm_url, ops_api_url = ops_api_url)


@app.get('/health')
async def health():
    agent_ready = (
        app.state.agent.ready
        if hasattr(app.state, 'agent')
        else False
    )
    return {'status': 'ok', 'llm_connected': agent_ready}
