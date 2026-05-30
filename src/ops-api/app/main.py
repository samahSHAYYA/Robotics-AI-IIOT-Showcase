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
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.consumer import run_consumer
from app.auth import hash_password
from app.db import User, async_session_factory, init_db
from app.routes import auth, telemetry, commands

# Feature 27: Rate limiting + security middleware
from app.middleware.rate_limit import RateLimitMiddleware
from app.middleware.security_headers import SecurityHeadersMiddleware

# Feature 28: Audit logging (router)
from app.routes import audit as audit_router
# Feature 29: Webhooks (router)
from app.routes import webhooks as webhooks_router
# Feature 30: Analytics (router)
from app.routes import analytics as analytics_router
# Feature 32: Reports / PDF (router)
from app.routes import reports as reports_router
# Feature 34: Prometheus metrics (router)
from app.routes import metrics as metrics_router

# Feature 30: Analytics engine (fed by broadcast loop)
from app import analytics_engine

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
_ws_connections: list[WebSocket] = []


async def _broadcast_snapshot():
    """
    Periodically broadcasts the telemetry snapshot to all connected WebSocket
    clients and feeds the analytics engine.
    """

    while True:
        await asyncio.sleep(2)

        snapshot: dict[str, Any] = store.get_snapshot()

        # Feed streaming analytics engine
        analytics_engine.update(snapshot)

        payload: str = json.dumps(
            {'type': 'snapshot', 'data': snapshot},
            default = str,
        )
        stale: list[WebSocket] = []

        for ws in _ws_connections:
            try:
                await ws.send_text(payload)
            except Exception:
                stale.append(ws)

        for ws in stale:
            _ws_connections.remove(ws)


ADMIN_USERNAME: str = os.getenv('ADMIN_USERNAME', 'admin')
ADMIN_PASSWORD: str = os.getenv('ADMIN_PASSWORD', 'admin')


async def _seed_admin():
    from sqlalchemy import select

    async with async_session_factory() as session:
        result = await session.execute(
            select(User).where(User.username == ADMIN_USERNAME),
        )
        existing = result.scalar_one_or_none()

        if existing is None:
            user = User(
                username=ADMIN_USERNAME,
                password_hash=hash_password(ADMIN_PASSWORD),
                role='admin',
            )
            session.add(user)
            await session.commit()
            logger.info('Created admin user (username=%s)', ADMIN_USERNAME)
        else:
            logger.info('Admin user already exists (username=%s)', ADMIN_USERNAME)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Manages the Redis consumer and WebSocket broadcaster background tasks.

    @param app: The FastAPI application instance (unused).
    """

    global _consumer_task

    logger.info('Initialising database ...')
    await init_db()
    await _seed_admin()

    logger.info('Starting ops-api consumer ...')

    _consumer_task = asyncio.create_task(run_consumer(REDIS_URL))

    broadcast_task: asyncio.Task = asyncio.create_task(_broadcast_snapshot())
    movement_task: asyncio.Task = store.start_movement_simulation()

    logger.info('Robot movement simulation started.')

    yield

    if _consumer_task is not None:
        _consumer_task.cancel()

    broadcast_task.cancel()
    movement_task.cancel()

    try:
        await _consumer_task
        await broadcast_task
        await movement_task
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

# Feature 27: Rate limiting + security headers
app.add_middleware(RateLimitMiddleware, max_requests=100, window_seconds=60)
app.add_middleware(SecurityHeadersMiddleware)

# Original routers
app.include_router(auth.router)
app.include_router(telemetry.router)
app.include_router(commands.router)

# Feature 28: Audit log router
app.include_router(audit_router.router)

# Feature 29: Webhooks router
app.include_router(webhooks_router.router)

# Feature 30: Analytics router
app.include_router(analytics_router.router)

# Feature 32: Reports / PDF router
app.include_router(reports_router.router)

# Feature 34: Prometheus metrics router
app.include_router(metrics_router.router)


@app.get('/')
async def root():
    """Returns service overview information."""
    return {
        'service': 'Operations API',
        'version': '0.1.0',
        'endpoints': {
            'health': '/health',
            'docs': '/docs',
            'auth': '/api/v1/auth/login',
            'telemetry': '/api/v1/telemetry',
            'commands': '/api/v1/commands',
            'audit': '/api/v1/audit',
            'webhooks': '/api/v1/webhooks',
            'analytics': '/api/v1/analytics/current',
            'analytics_ws': '/api/v1/analytics/ws',
            'reports': '/api/v1/reports/pdf',
            'metrics': '/metrics',
            'websocket': '/ws',
        },
    }

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
