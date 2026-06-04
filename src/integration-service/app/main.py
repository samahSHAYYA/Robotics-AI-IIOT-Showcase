"""
@author: Samah SHAYYA
@date: 04-Jun-2026

@description: FastAPI application for the Integration Service. Manages
connections to external enterprise systems (ERP, CRM, factory APIs) through
a pluggable adapter framework with tenant-scoped CRUD, connection testing,
sync logging, and a background sync engine.
"""

import asyncio
import logging
import os

from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI

from app.db import init_db
from app.routes import integrations as integrations_router
from app.event_consumer import start_event_consumer
from app.sync_engine import start_sync_engine

LOG_LEVEL: str = os.getenv('LOG_LEVEL', 'INFO')
SERVICE_PORT: int = int(os.getenv('SERVICE_PORT', '8006'))

logging.basicConfig(
    level = getattr(logging, LOG_LEVEL.upper(), logging.INFO),
    format = '%(asctime)s [%(levelname)s] %(name)s: %(message)s',
)

logger: logging.Logger = logging.getLogger(__name__)

_sync_task: asyncio.Task | None = None
_event_consumer_task: asyncio.Task | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Initialise the database on startup, start the background sync engine,
    and clean up on shutdown.

    @param app: The FastAPI application instance (unused).
    """
    global _sync_task

    logger.info('Initialising integration service database ...')
    await init_db()

    logger.info('Starting sync engine ...')
    _sync_task = start_sync_engine()

    logger.info('Starting event consumer ...')
    _event_consumer_task = start_event_consumer()

    logger.info('Integration service started.')

    yield

    if _sync_task:
        _sync_task.cancel()
        logger.info('Sync engine stopped.')

    if _event_consumer_task:
        _event_consumer_task.cancel()
        logger.info('Event consumer stopped.')

    logger.info('Integration service shut down.')


app = FastAPI(
    title = 'Integration Service',
    version = '0.1.0',
    lifespan = lifespan,
)

app.include_router(integrations_router.router)


@app.get('/')
async def root() -> dict[str, Any]:
    """Return service overview information."""
    return {
        'service': 'Integration Service',
        'version': '0.1.0',
        'endpoints': {
            'health': '/health',
            'docs': '/docs',
            'integrations_list': 'GET /api/v1/integrations',
            'integrations_create': 'POST /api/v1/integrations',
            'integrations_detail': 'GET /api/v1/integrations/{id}',
            'integrations_update': 'PUT /api/v1/integrations/{id}',
            'integrations_delete': 'DELETE /api/v1/integrations/{id}',
            'integrations_test': 'POST /api/v1/integrations/{id}/test',
            'integrations_sync_log': 'GET /api/v1/integrations/{id}/sync-log',
            'adapters_list': 'GET /api/v1/adapters',
        },
    }


@app.get('/health')
async def health() -> dict[str, str]:
    """Return service health status."""
    return {'status': 'ok', 'service': 'integration-service'}
