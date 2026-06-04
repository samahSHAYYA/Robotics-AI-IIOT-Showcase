"""
@author: Samah SHAYYA / AI Orchestrator
@date: 04-Jun-2026

@description: Per-tenant rate limiting middleware. Limits requests per tenant
(extracted from JWT) rather than globally. Tenants without a token share a
single 'anonymous' bucket.
"""

import asyncio
import logging
import os
import time
from collections import defaultdict
from typing import Any

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from jose import JWTError, jwt

logger = logging.getLogger(__name__)

SECRET_KEY: str = os.getenv('JWT_SECRET', 'super-secret-key-change-in-production')
ALGORITHM: str = 'HS256'

# Per-tenant rate limit state
# Structure: {tenant_key: [timestamp1, timestamp2, ...]}
_tenant_requests: dict[str, list[float]] = defaultdict(list)
_lock: asyncio.Lock = asyncio.Lock()

DEFAULT_MAX_REQUESTS: int = 200  # Higher per-tenant limit
DEFAULT_WINDOW_SECONDS: int = 60


def _extract_tenant_id(request: Request) -> str:
    """Extract tenant_id from JWT, or fall back to client IP."""
    auth_header = request.headers.get('Authorization', '')
    if auth_header.startswith('Bearer '):
        token = auth_header[7:]
        try:
            payload: dict[str, Any] = jwt.decode(
                token, SECRET_KEY, algorithms=[ALGORITHM],
            )
            tid = payload.get('tenant_id')
            if tid is not None:
                return f'tenant:{tid}'
        except (JWTError, Exception):
            pass
    # Fall back to client IP
    forwarded = request.headers.get('X-Forwarded-For', '')
    if forwarded:
        client_ip = forwarded.split(',')[0].strip()
    else:
        client_ip = request.client.host if request.client else 'unknown'
    return f'ip:{client_ip}'


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Per-tenant rate limiting middleware.

    Each tenant (or anonymous IP) has its own request counter window.
    """

    def __init__(self, app, max_requests: int = DEFAULT_MAX_REQUESTS,
                 window_seconds: int = DEFAULT_WINDOW_SECONDS):
        super().__init__(app)
        self.max_requests: int = max_requests
        self.window_seconds: int = window_seconds

    async def dispatch(self, request: Request, call_next) -> Response:
        tenant_key: str = _extract_tenant_id(request)
        now: float = time.time()

        async with _lock:
            # Prune expired timestamps
            timestamps: list[float] = _tenant_requests[tenant_key]
            cutoff: float = now - self.window_seconds
            _tenant_requests[tenant_key] = [t for t in timestamps if t > cutoff]

            # Check limit
            if len(_tenant_requests[tenant_key]) >= self.max_requests:
                logger.warning(
                    'Rate limit exceeded for %s (%d req in %ds)',
                    tenant_key, self.max_requests, self.window_seconds,
                )
                return Response(
                    content='{"detail":"Rate limit exceeded. Try again later."}',
                    status_code=429,
                    media_type='application/json',
                    headers={'Retry-After': str(self.window_seconds)},
                )

            # Record this request
            _tenant_requests[tenant_key].append(now)

        response: Response = await call_next(request)
        return response
