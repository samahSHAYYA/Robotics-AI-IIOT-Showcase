"""
@author: Samah SHAYYA
@date: 29-May-2026

@description: AI Agent microservice — PydanticAI-powered chat interface to
factory telemetry. Reads current state from ops-api (read-only). Uses
OpenAI-compatible LLM (e.g. Ollama) when available; falls back to mock.
"""

import logging
import os

from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.agent import FactoryAgent
from app.router import router

logger: logging.Logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    llm_url: str = os.getenv('OLLAMA_URL', '')
    ops_api_url: str = os.getenv('OPS_API_URL', 'http://ops-api:8003')
    agent = FactoryAgent(llm_url=llm_url, ops_api_url=ops_api_url)
    app.state.agent = agent
    logger.info(
        'AI Agent initialised (model=%s, ready=%s)',
        os.getenv('LLM_MODEL', 'qwen3:14b'),
        agent.ready,
    )
    yield


app = FastAPI(title='AI Agent', lifespan=lifespan)
app.include_router(router)


@app.get('/health')
async def health():
    agent_ready = (
        app.state.agent.ready
        if hasattr(app.state, 'agent')
        else False
    )
    return {'status': 'ok', 'llm_connected': agent_ready}
