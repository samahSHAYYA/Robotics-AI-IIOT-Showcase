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

import httpx
import redis as redis_lib
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.consumer import run_consumer
from app.auth import decode_access_token, hash_password
from app.db import User, async_session_factory, init_db
from app.routes import auth, telemetry, commands

# Feature 45: OpenTelemetry distributed tracing (optional dependency)
try:
    from app.tracing import setup_tracing
    _otel_available: bool = True
except ModuleNotFoundError:
    _otel_available: bool = False
    setup_tracing = None

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

# Feature 42: Robot Fleet Auto-Discovery (router)
from app.routes import robots as robots_router

# Feature 44: Digital Twin State Reconciliation (router)
from app.routes import reconcile as reconcile_router

# Feature 47: Multi-Factory / Site Management (router)
from app.routes import sites as sites_router

# Feature 41: Edge Device Simulator (sensor proxy)
from app.routes import sensors as sensors_router

# Task 104: Shift Scheduling & Worker Tracking
from app.routes import shifts as shifts_router

# Task 105: Inventory Management
from app.routes import inventory as inventory_router

# Task 106: Integration Service KPI Proxy
from app.routes import integration_proxy as integration_proxy_router

# Feature 30: Analytics engine (fed by broadcast loop)
from app import analytics_engine

from app.event_bus import close_publisher
from app.store import store
from app.webhook_engine import ensure_cache_loaded
from app.webhook_v2 import start_webhook_v2_engine

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
_webhook_v2_task: asyncio.Task | None = None
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


DEFAULT_TENANT_SLUG: str = 'default-org'
DEFAULT_TENANT_NAME: str = 'Default Organization'
DEFAULT_FACTORY_NAME: str = 'Main Factory'
BRANCH_FACTORY_NAME: str = 'Branch Factory'


async def _seed_data():
    """Create default tenant, factory, and seed users in a single session."""
    from sqlalchemy import select
    from app.auth import hash_password, create_api_key
    from app.db import Tenant as TenantModel

    async with async_session_factory() as session:
        # Check if seed data already exists
        result = await session.execute(
            select(User).where(User.username == 'super_admin'),
        )
        if result.scalar_one_or_none() is not None:
            logger.info('Seed data already exists — skipping.')
            return

        # ── Create default tenant ──
        t_result = await session.execute(
            select(TenantModel).where(TenantModel.id == 1),
        )
        tenant = t_result.scalar_one_or_none()
        if tenant is None:
            tenant = TenantModel(name=DEFAULT_TENANT_NAME, slug=DEFAULT_TENANT_SLUG)
            session.add(tenant)
            await session.flush()
            logger.info('Created default tenant: %s (id=%d)', tenant.name, tenant.id)
        else:
            logger.info('Default tenant already exists (id=1).')

        # ── Create default factory ──
        from app.db import Factory as FactoryModel
        f_result = await session.execute(
            select(FactoryModel).where(FactoryModel.id == 1),
        )
        factory = f_result.scalar_one_or_none()
        if factory is None:
            factory = FactoryModel(
                tenant_id=tenant.id,
                name=DEFAULT_FACTORY_NAME,
                location='Default Location',
                timezone='UTC',
                channel_prefix='factory:main',
            )
            session.add(factory)
            await session.flush()
            logger.info('Created default factory: %s (id=%d)', factory.name, factory.id)
        else:
            logger.info('Default factory already exists (id=1).')

        # ── Create second factory (branch) for multi-factory demo ──
        branch_factory = None
        b_result = await session.execute(
            select(FactoryModel).where(FactoryModel.name == BRANCH_FACTORY_NAME),
        )
        branch_factory = b_result.scalar_one_or_none()
        if branch_factory is None:
            branch_factory = FactoryModel(
                tenant_id=tenant.id,
                name=BRANCH_FACTORY_NAME,
                location='Branch Location',
                timezone='America/New_York',
                channel_prefix='factory:branch',
            )
            session.add(branch_factory)
            await session.flush()
            logger.info('Created branch factory: %s (id=%d)', branch_factory.name, branch_factory.id)
        else:
            logger.info('Branch factory already exists (id=%d).', branch_factory.id)

        # ── Generate integrator API key ──
        integrator_plain_key, integrator_hashed_key = create_api_key()

        # ── Seed users ──
        seed_users = [
            {
                'username': 'super_admin',
                'password': 'admin',
                'role': 'super_admin',
                'tenant_id': None,
                'factory_id': None,
                'api_key_hash': None,
            },
            {
                'username': 'tenant_admin',
                'password': 'admin',
                'role': 'tenant_admin',
                'tenant_id': tenant.id,
                'factory_id': None,
                'api_key_hash': None,
            },
            {
                'username': 'operator',
                'password': 'operator',
                'role': 'operator',
                'tenant_id': tenant.id,
                'factory_id': factory.id,
                'api_key_hash': None,
            },
            {
                'username': 'viewer',
                'password': 'viewer',
                'role': 'viewer',
                'tenant_id': tenant.id,
                'factory_id': factory.id,
                'api_key_hash': None,
            },
            {
                'username': 'integrator',
                'password': '',  # No password auth for integrators
                'role': 'integrator',
                'tenant_id': tenant.id,
                'factory_id': factory.id,
                'api_key_hash': integrator_hashed_key,
            },
            {
                'username': 'factory_admin',
                'password': 'admin',
                'role': 'factory_admin',
                'tenant_id': tenant.id,
                'factory_id': factory.id,
                'api_key_hash': None,
            },
            {
                'username': 'branch_factory_admin',
                'password': 'admin',
                'role': 'factory_admin',
                'tenant_id': tenant.id,
                'factory_id': branch_factory.id,
                'api_key_hash': None,
            },
            {
                'username': 'branch_operator',
                'password': 'operator',
                'role': 'operator',
                'tenant_id': tenant.id,
                'factory_id': branch_factory.id,
                'api_key_hash': None,
            },
        ]

        for su in seed_users:
            u_result = await session.execute(
                select(User).where(User.username == su['username']),
            )
            existing = u_result.scalar_one_or_none()
            if existing is None:
                if su['password']:
                    password_hash = hash_password(su['password'])
                else:
                    # Integrator uses API key auth; store a placeholder hash since
                    # password_hash is NOT NULL in the schema.
                    password_hash = hash_password('')
                user = User(
                    username=su['username'],
                    password_hash=password_hash,
                    role=su['role'],
                    tenant_id=su['tenant_id'],
                    factory_id=su['factory_id'],
                    api_key_hash=su['api_key_hash'],
                )
                session.add(user)
                logger.info('Created seed user: %s (role=%s)',
                            su['username'], su['role'])

        await session.commit()

        # Log integrator API key (one-time display)
        logger.info('=' * 60)
        logger.info('INTEGRATOR API KEY (one-time display):')
        logger.info('  Username: integrator')
        logger.info('  API Key: %s', integrator_plain_key)
        logger.info('  Use with header: X-API-Key: %s', integrator_plain_key)
        logger.info('=' * 60)

        logger.info('Seed data complete.')


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Manages the Redis consumer and WebSocket broadcaster background tasks.

    @param app: The FastAPI application instance (unused).
    """

    global _consumer_task

    logger.info('Initialising database ...')
    await init_db()
    await _seed_data()

    logger.info('Loading webhook cache ...')
    await ensure_cache_loaded()

    logger.info('Starting webhook v2 engine ...')
    _webhook_v2_task = start_webhook_v2_engine()

    logger.info('Starting ops-api consumer ...')

    _consumer_task = asyncio.create_task(run_consumer(REDIS_URL))

    broadcast_task: asyncio.Task = asyncio.create_task(_broadcast_snapshot())
    movement_task: asyncio.Task = store.start_movement_simulation()

    logger.info('Robot movement simulation started.')

    yield

    if _consumer_task is not None:
        _consumer_task.cancel()

    if _webhook_v2_task is not None:
        _webhook_v2_task.cancel()

    broadcast_task.cancel()
    movement_task.cancel()

    try:
        if _consumer_task is not None:
            await _consumer_task
        if _webhook_v2_task is not None:
            await _webhook_v2_task
        await broadcast_task
        await movement_task
    except asyncio.CancelledError:
        pass

    await close_publisher()

    logger.info('ops-api shut down.')


app = FastAPI(
    title = 'Operations API',
    version = '0.1.0',
    lifespan = lifespan,
)

# Feature 45: Wire up OpenTelemetry tracing (instruments FastAPI + HTTPX)
if _otel_available and setup_tracing is not None:
    setup_tracing(app)

app.add_middleware(
    CORSMiddleware,
    allow_origins = [FRONTEND_ORIGIN, 'http://localhost:3000'],
    allow_credentials = True,
    allow_methods = ['*'],
    allow_headers = ['*'],
)

# Feature 27: Per-tenant rate limiting + security headers
app.add_middleware(RateLimitMiddleware, max_requests=200, window_seconds=60)
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

# Feature 42: Robot Fleet Auto-Discovery router
app.include_router(robots_router.router)

# Feature 44: Digital Twin State Reconciliation router
app.include_router(reconcile_router.router)

# Feature 47: Multi-Factory / Site Management router
app.include_router(sites_router.router)

# Feature 41: Edge Device Simulator (sensor proxy)
app.include_router(sensors_router.router)

# Task 104: Shift Scheduling & Worker Tracking
app.include_router(shifts_router.router)

# Task 105: Inventory Management
app.include_router(inventory_router.router)

# Task 106: Integration Service KPI Proxy
app.include_router(integration_proxy_router.router)


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
            'robots': '/api/v1/robots',
            'robots_register': '/api/v1/robots/register',
            'robots_heartbeat': '/api/v1/robots/{robot_id}/heartbeat',
            'reconcile_state': '/api/v1/reconcile/state',
            'reconcile_diff': '/api/v1/reconcile/diff',
            'reconcile_resolve': '/api/v1/reconcile/resolve',
            'sites': '/api/v1/sites',
            'sites_switch': '/api/v1/sites/{site_id}/switch',
            'sites_telemetry': '/api/v1/sites/{site_id}/telemetry',
            'sites_active': '/api/v1/sites/active/info',
            'sensors': '/api/v1/sensors',
            'shifts': '/api/v1/shifts',
            'workers': '/api/v1/workers',
            'inventory': '/api/v1/inventory',
            'inventory_movements': '/api/v1/inventory/{id}/movements',
            'inventory_adjust': '/api/v1/inventory/{id}/adjust',
            'shifts_summary': '/api/v1/shifts/summary',
            'inventory_summary': '/api/v1/inventory/summary',
            'integrations_summary': '/api/v1/integrations/summary',
        },
    }

SERVICE_HEALTH_MAP = {
    'ops-api': 'http://localhost:8003/health',
    'ai-service': 'http://ai-service:8002/health',
    'ai-agent': 'http://ai-agent:8004/health',
    'core-platform': 'http://core-platform:8001/health',
}


# Services that don't expose an HTTP health endpoint — verify via container health
NON_HTTP_SERVICES = {'core-platform'}


@app.get('/api/v1/health/{service}')
async def health_check(service: str):
    if service == 'ops-api':
        return {'status': 'ok', 'service': 'ops-api'}
    if service == 'redis':
        try:
            r = redis_lib.Redis(host='redis', port=6379, socket_connect_timeout=3)
            r.ping()
            return {'status': 'ok', 'service': 'redis'}
        except Exception:
            return {'status': 'error', 'service': 'redis'}
    if service == 'postgres':
        try:
            async with async_session_factory() as session:
                await session.execute(text('SELECT 1'))
            return {'status': 'ok', 'service': 'postgres'}
        except Exception:
            return {'status': 'error', 'service': 'postgres'}
    if service in NON_HTTP_SERVICES:
        return {'status': 'ok', 'service': service, 'detail': 'container-health'}
    url = SERVICE_HEALTH_MAP.get(service)
    if not url:
        return {'status': 'error', 'service': service, 'detail': 'unknown service'}
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(url)
            data = resp.json()
            return {'status': 'ok' if data.get('status') == 'ok' else 'error', 'service': service}
    except Exception:
        return {'status': 'error', 'service': service}


@app.get('/health')
async def health():
    """Returns service health status."""

    return {'status': 'ok', 'service': 'ops-api'}


@app.websocket('/ws')
async def websocket_endpoint(websocket: WebSocket, token: str = ''):
    """
    WebSocket endpoint for live dashboard updates.

    Clients receive JSON telemetry snapshots every 2 seconds.
    Expects a `token` query parameter for authentication.
    """

    # Validate token from query parameter
    payload = decode_access_token(token)
    if payload is None:
        await websocket.close(code=4001)
        return

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
