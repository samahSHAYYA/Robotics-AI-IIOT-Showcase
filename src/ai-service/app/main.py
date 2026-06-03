"""
@author: Samah SHAYYA
@date: 28-May-2026

@description: FastAPI application for AI/ML inference service.
Consumes sensor events from Redis Streams and emits ML predictions.
"""

import asyncio
import logging
import os

from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.consumer import run_consumer

# Feature 45: OpenTelemetry distributed tracing (optional dependency)
try:
    from app.tracing import setup_tracing
    _otel_available: bool = True
except ModuleNotFoundError:
    _otel_available: bool = False
    setup_tracing = None

REDIS_URL: str = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
SERVICE_PORT: int = int(os.getenv('SERVICE_PORT', '8002'))
LOG_LEVEL: str = os.getenv('LOG_LEVEL', 'INFO')

logging.basicConfig(
    level = getattr(logging, LOG_LEVEL.upper(), logging.INFO),
    format = '%(asctime)s [%(levelname)s] %(name)s: %(message)s',
)

logger: logging.Logger = logging.getLogger(__name__)

_consumer_task: asyncio.Task | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Manages the Redis consumer background task lifecycle.

    @param app: The FastAPI application instance (unused).
    """

    global _consumer_task

    logger.info('Starting AI service consumer ...')

    _consumer_task = asyncio.create_task(run_consumer(REDIS_URL))

    yield

    if _consumer_task is not None:
        _consumer_task.cancel()

        try:
            await _consumer_task
        except asyncio.CancelledError:
            pass

    logger.info('AI service shut down.')


app = FastAPI(
    title = 'AI Service',
    version = '0.1.0',
    lifespan = lifespan,
)

# Feature 45: Wire up OpenTelemetry tracing (instruments FastAPI + HTTPX)
if _otel_available and setup_tracing is not None:
    setup_tracing(app)


@app.get('/health')
async def health():
    """Returns service health status."""

    return {'status': 'ok', 'service': 'ai-service'}
