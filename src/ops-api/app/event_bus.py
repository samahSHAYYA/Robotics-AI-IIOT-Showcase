"""
@author: AI Orchestrator
@date: 04-Jun-2026

@description: Event bus for ops-api. Uses Redis Streams (XADD/XREAD)
for durable, persistent event delivery. The integration-service consumer
reads from the same stream and tracks last-delivered IDs.
"""

import asyncio
import json
import logging
import os
from datetime import datetime, timezone
from typing import Any

import redis.asyncio as aioredis

logger = logging.getLogger(__name__)

REDIS_URL: str = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
EVENT_STREAM: str = 'events:ops-api-stream'
MAXLEN: int = 10000  # Keep last 10K events

_pub: aioredis.Redis | None = None


async def get_publisher() -> aioredis.Redis:
    """Lazy-init Redis connection."""
    global _pub
    if _pub is None:
        _pub = aioredis.from_url(REDIS_URL, decode_responses=True)
        logger.info('Event bus connected to Redis Streams: %s', EVENT_STREAM)
    return _pub


async def publish_event(
    event_type: str,
    payload: dict[str, Any],
    tenant_id: int,
    factory_id: int | None = None,
):
    """
    Publish an event to the Redis Stream.

    @param event_type: e.g. 'alert.raised', 'telemetry.updated'
    @param payload: The event data dict (must be JSON-serializable).
    @param tenant_id: The tenant that owns this event.
    @param factory_id: Optional factory scope.
    """
    try:
        pub = await get_publisher()
        event = {
            'event_type': event_type,
            'payload': json.dumps(payload),
            'tenant_id': str(tenant_id),
            'factory_id': str(factory_id) if factory_id else '',
            'timestamp': datetime.now(timezone.utc).isoformat(),
        }
        await pub.xadd(EVENT_STREAM, event, maxlen=MAXLEN)
        logger.debug('Event streamed: %s (tenant=%d)', event_type, tenant_id)
    except Exception as exc:
        logger.error('Failed to stream event %s: %s', event_type, exc)


async def close_publisher():
    """Close the Redis connection on shutdown."""
    global _pub
    if _pub:
        await _pub.close()
        _pub = None
        logger.info('Event bus publisher closed')
