"""
@author: Samah SHAYYA
@date: 28-May-2026

@description: FastAPI application for the Operations API backend.
Serves REST and WebSocket endpoints for telemetry, robot commands, and live
dashboard updates.
"""

import asyncio
import json
import logging
import os

from contextlib import asynccontextmanager
from typing import Any, Dict, List

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.consumer import run_consumer
from app.db import init_db
from app.routes import auth, telemetry, commands
from app.store import store

REDIS_URL: str = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
SERVICE_PORT: int = int(os.getenv('SERVICE_PORT', '8003'))
LOG_LEVEL: str = os.getenv('LOG_LEVEL', 'INFO')
FRONTEND_ORIGIN: str = os.getenv('FRONTEND_ORIGIN', 'http://localhost:3000')

logging.basicConfig(
    level = getattr(logging, LOG_LEVEL.upper(), logging.INFO),
    format = '%(asctime)s [%(levelname)s] %(name)s: %(message)s',
)

logger: logging.Logger = logging.getLogger(__name__)

_consumer_task: asyncio.Task | None = None
_ws_connections: List[WebSocket] = []


async def _broadcast_snapshot():
    """
    Periodically broadcasts the telemetry snapshot to all connected WebSocket
    clients.
    """

    while True:
        await asyncio.sleep(2)

        snapshot: Dict[str, Any] = store.get_snapshot()
        payload: str = json.dumps(
            {'type': 'snapshot', 'data': snapshot},
            default = str,
        )
        stale: List[WebSocket] = []

        for ws in _ws_connections:
            try:
                await ws.send_text(payload)
            except Exception:
                stale.append(ws)

        for ws in stale:
            _ws_connections.remove(ws)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Manages the Redis consumer and WebSocket broadcaster background tasks.

    @param app: The FastAPI application instance (unused).
    """

    global _consumer_task

    logger.info('Initialising database ...')
    await init_db()

    logger.info('Starting ops-api consumer ...')

    _consumer_task = asyncio.create_task(run_consumer(REDIS_URL))

    broadcast_task: asyncio.Task = asyncio.create_task(_broadcast_snapshot())

    yield

    if _consumer_task is not None:
        _consumer_task.cancel()

    broadcast_task.cancel()

    try:
        await _consumer_task
        await broadcast_task
    except asyncio.CancelledError:
        pass

    logger.info('ops-api shut down.')


app = FastAPI(
    title = 'Operations API',
    version = '0.1.0',
    lifespan = lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins = [FRONTEND_ORIGIN, 'http://localhost:3000'],
    allow_credentials = True,
    allow_methods = ['*'],
    allow_headers = ['*'],
)

app.include_router(auth.router)
app.include_router(telemetry.router)
app.include_router(commands.router)


@app.get('/health')
async def health():
    """Returns service health status."""

    return {'status': 'ok', 'service': 'ops-api'}


@app.websocket('/ws')
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for live dashboard updates.

    Clients receive JSON telemetry snapshots every 2 seconds.
    """

    await websocket.accept()

    _ws_connections.append(websocket)

    logger.info('WebSocket client connected (%d total)', len(_ws_connections))

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        if websocket in _ws_connections:
            _ws_connections.remove(websocket)

        logger.info('WebSocket client disconnected (%d remaining)',
                    len(_ws_connections))
